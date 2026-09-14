/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, lstatSync, readdirSync, statSync, watch } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVersion } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';
import { updateEventEmitter } from '../../utils/updateEventEmitter.js';

export interface UpdateInfo {
  latest: string;
  current: string;
  name: string;
  type?: string;
}

export interface UpdateObject {
  message: string;
  update: UpdateInfo;
  changedFiles?: string[];
  isUpdating?: boolean;
}

export interface LocalChangeSummary {
  changedFiles: string[];
  descriptions: string[];
  version?: string;
}

/** Persisted state format used by the baseline-aware watcher. */
const LOCAL_UPDATE_STATE_VERSION = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** npm update checks are intentionally disabled in this private fork. */
export async function checkForUpdates(
  _settings: LoadedSettings,
): Promise<UpdateObject | null> {
  return null;
}

function findLocalBuildRoot(): string {
  const configured = process.env['GEMINI_CLI_BUILD_ROOT']?.trim();
  if (configured) {
    return path.resolve(configured);
  }

  let current = path.dirname(fileURLToPath(import.meta.url));
  let nearestPackageRoot = current;
  while (true) {
    if (existsSync(path.join(current, '.git'))) {
      return current;
    }
    if (existsSync(path.join(current, 'package.json'))) {
      nearestPackageRoot = current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return nearestPackageRoot;
    }
    current = parent;
  }
}

function getPendingUpdatePath(): string {
  const configured = process.env['GEMINI_CLI_UPDATE_STATE_PATH']?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  const dataRoot =
    process.env['LOCALAPPDATA']?.trim() || path.join(os.homedir(), '.local');
  return path.join(dataRoot, 'gemini-cli-agy', 'pending-update.json');
}

function fileSignature(file: string): string | null {
  try {
    const stats = statSync(file);
    if (!stats.isFile()) {
      return null;
    }
    return `${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`;
  } catch {
    // A file removed after the initial snapshot is represented by null.
    return null;
  }
}

/**
 * Take a baseline before subscribing to the recursive watcher. On Windows,
 * opening a recursive watcher can deliver queued directory notifications for
 * existing entries. Comparing against this baseline prevents those startup
 * notifications from becoming a phantom update.
 */
function snapshotBuildFiles(root: string): Map<string, string | null> {
  const signatures = new Map<string, string | null>();
  const directories = [root];

  while (directories.length > 0) {
    const directory = directories.pop();
    if (!directory) {
      continue;
    }

    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(root, fullPath).replaceAll('\\', '/');
      const normalized = normalizeWatchedFilename(relativePath);
      if (!normalized) {
        continue;
      }
      if (entry.isDirectory()) {
        directories.push(fullPath);
        continue;
      }
      if (entry.isFile()) {
        signatures.set(normalized, fileSignature(fullPath));
      }
    }
  }

  return signatures;
}

function descriptionForFile(file: string): string | null {
  const normalized = file.replaceAll('\\', '/').toLowerCase();
  if (!normalized || normalized === 'unknown file') {
    return null;
  }
  if (normalized.includes('agycontentgenerator')) {
    return 'Added or updated the Antigravity CLI model backend adapter.';
  }
  if (normalized.includes('contentgenerator')) {
    return 'Routed model requests through the local Antigravity backend.';
  }
  if (normalized.includes('/auth') || normalized.includes('auth.')) {
    return 'Updated authentication to use the local Antigravity session.';
  }
  if (
    normalized.includes('modeldialog') ||
    normalized.includes('modelconfig') ||
    normalized.includes('acputils')
  ) {
    return 'Updated model selection to expose the available Antigravity models.';
  }
  if (normalized.includes('/acp/') || normalized.includes('a2a')) {
    return 'Updated agent integrations to use the local backend.';
  }
  if (
    normalized.includes('whatsnewdialog') ||
    normalized.includes('whatschangeddialog')
  ) {
    return 'Added the post-update change summary dialog.';
  }
  if (
    normalized.includes('updatedialog') ||
    normalized.includes('updatecheck') ||
    normalized.includes('autoupdate') ||
    normalized.includes('installationinfo')
  ) {
    return 'Added local update detection and restart handling.';
  }
  if (normalized.includes('version')) {
    return 'Updated build version labeling.';
  }
  if (/\.(md|txt|rst)$/u.test(normalized)) {
    return 'Updated project documentation or text content.';
  }
  if (/\.(json|ya?ml|toml)$/u.test(normalized)) {
    return 'Updated project configuration.';
  }
  if (normalized.includes('voice') || normalized.includes('transcription')) {
    return 'Updated local voice transcription behavior.';
  }
  if (normalized.includes('/ui/') || /\.(tsx|jsx|css)$/u.test(normalized)) {
    return 'Updated the terminal interface.';
  }
  if (
    normalized.includes('/commands/') ||
    /(?:^|[/])[^/]*command[^/]*\.(?:ts|tsx|js|jsx)$/u.test(normalized)
  ) {
    return 'Updated CLI commands and interactions.';
  }
  if (normalized.includes('/core/')) {
    return 'Updated core runtime behavior.';
  }
  if (normalized.includes('/services/') || normalized.includes('/service/')) {
    return 'Updated supporting services.';
  }
  if (normalized.includes('/tools/')) {
    return 'Updated built-in tools.';
  }
  if (normalized.includes('/config/')) {
    return 'Updated application configuration behavior.';
  }
  if (
    normalized.includes('/test') ||
    normalized.includes('__snapshots__') ||
    /\.(test|spec)\.[^.]+$/u.test(normalized)
  ) {
    return 'Updated automated checks.';
  }
  if (normalized.includes('/dist/') || normalized.includes('/build/')) {
    return 'Updated the runnable CLI build.';
  }
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/u.test(normalized)) {
    return 'Updated application code.';
  }
  if (/\.(sh|ps1|cmd|bat)$/u.test(normalized)) {
    return 'Updated command-line tooling.';
  }
  if (/\.(xml|lock)$/u.test(normalized)) {
    return 'Updated project build or dependency metadata.';
  }
  if (path.posix.basename(normalized).startsWith('.')) {
    return 'Updated project tooling or metadata.';
  }
  return 'Updated project files.';
}

/**
 * `fs.watch({recursive: true})` reports directory creation/rename events as
 * well as file changes.  Treating those directory names as changed files can
 * make one build look like thousands of updates (and can produce the generic
 * "Updated application behavior" description).  It can also report a null
 * filename on Windows, which must not become an "unknown file" update.
 */
function normalizeWatchedFilename(
  filename: string | Buffer | null,
): string | null {
  const relative = filename?.toString().trim();
  if (!relative) {
    return null;
  }

  const normalized = relative.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (normalized === '.' || normalized.endsWith('/')) {
    return null;
  }

  const segments = normalized.split('/').filter(Boolean);
  if (
    segments.some((segment) => {
      const lowerSegment = segment.toLowerCase();
      return (
        lowerSegment === '.git' ||
        lowerSegment === 'node_modules' ||
        lowerSegment === 'coverage' ||
        lowerSegment === '.nyc_output' ||
        lowerSegment === '.cache' ||
        lowerSegment === '.turbo' ||
        lowerSegment === '.gemini' ||
        lowerSegment === '.vscode' ||
        lowerSegment === 'dist' ||
        lowerSegment === 'build' ||
        lowerSegment === 'out' ||
        lowerSegment === 'tmp' ||
        lowerSegment === 'logs'
      );
    })
  ) {
    return null;
  }
  return normalized;
}

function filterChangedFiles(changedFiles: string[]): string[] {
  const root = findLocalBuildRoot();
  const pendingPath = path.resolve(getPendingUpdatePath()).toLowerCase();
  return [
    ...new Set(
      changedFiles
        .map((file) => normalizeWatchedFilename(file))
        .filter(
          (file): file is string =>
            file !== null &&
            path.resolve(root, file).toLowerCase() !== pendingPath &&
            isWatchedFile(root, file, 'change'),
        ),
    ),
  ].sort();
}

function isWatchedFile(root: string, relative: string, event: string): boolean {
  const absolute = path.resolve(root, relative);
  const rootRelative = path.relative(root, absolute);
  if (
    !rootRelative ||
    rootRelative === '..' ||
    rootRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(rootRelative)
  ) {
    return false;
  }

  try {
    return !lstatSync(absolute).isDirectory();
  } catch {
    // A deleted file has no stat entry. Preserve deletion notifications for
    // file-like paths while still ignoring deleted directories in practice.
    return event === 'rename' && path.extname(relative) !== '';
  }
}

export function summarizeChangedFiles(changedFiles: string[]): string[] {
  const counts = new Map<string, number>();
  for (const file of changedFiles) {
    const description = descriptionForFile(file);
    if (!description) {
      continue;
    }
    counts.set(description, (counts.get(description) ?? 0) + 1);
  }
  return [...counts].map(([description, count]) =>
    count > 1
      ? `${description.replace(/\.$/u, '')} (${count} files).`
      : description,
  );
}

async function readPendingUpdate(): Promise<LocalChangeSummary | null> {
  const pendingPath = getPendingUpdatePath();
  try {
    const raw = await readFile(pendingPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed['schemaVersion'] !== LOCAL_UPDATE_STATE_VERSION ||
      !Array.isArray(parsed['changedFiles'])
    ) {
      // State written by the original watcher may contain a full repository
      // listing. It is stale/ambiguous and must not keep nagging the user.
      await unlink(pendingPath).catch(() => undefined);
      return null;
    }
    const changedFiles = filterChangedFiles(
      parsed['changedFiles'].filter((file): file is string => isString(file)),
    );
    if (changedFiles.length === 0) {
      await unlink(pendingPath).catch(() => undefined);
      return null;
    }
    const version = isString(parsed['version']) ? parsed['version'] : undefined;
    return {
      changedFiles,
      descriptions: summarizeChangedFiles(changedFiles),
      version,
    };
  } catch {
    return null;
  }
}

export async function loadPendingLocalChanges(): Promise<LocalChangeSummary | null> {
  const pending = await readPendingUpdate();
  // A summary is for the next launch only. Consuming it here prevents the same
  // old update from nagging on every subsequent restart if it is not dismissed.
  if (pending) {
    await acknowledgePendingLocalChanges();
  }
  return pending;
}

let pendingWrite = Promise.resolve();

async function recordPendingLocalChanges(
  changedFiles: string[],
  version: string,
): Promise<void> {
  pendingWrite = pendingWrite.then(async () => {
    const existing = await readPendingUpdate();
    const mergedFiles = [
      ...new Set([...(existing?.changedFiles ?? []), ...changedFiles]),
    ].sort();
    const pendingPath = getPendingUpdatePath();
    await mkdir(path.dirname(pendingPath), { recursive: true });
    await writeFile(
      pendingPath,
      JSON.stringify(
        {
          schemaVersion: LOCAL_UPDATE_STATE_VERSION,
          changedFiles: mergedFiles,
          descriptions: summarizeChangedFiles(mergedFiles),
          version,
        } satisfies LocalChangeSummary & { schemaVersion: number },
        null,
        2,
      ),
      'utf8',
    );
  });
  await pendingWrite;
}

export async function acknowledgePendingLocalChanges(): Promise<void> {
  try {
    await unlink(getPendingUpdatePath());
  } catch {
    // Nothing to acknowledge.
  }
}

/**
 * Watches the local source/install tree. Any changed build input asks the
 * running process to restart; this never contacts npm or mutates files.
 */
export function startLocalUpdateWatcher(): () => void {
  const root = findLocalBuildRoot();
  const baseline = snapshotBuildFiles(root);
  const pendingFiles = new Set<string>();
  let flushTimer: NodeJS.Timeout | undefined;
  let updatePromptIssued = false;
  let stopped = false;
  try {
    const flushChanges = async () => {
      flushTimer = undefined;
      if (stopped || pendingFiles.size === 0) {
        return;
      }
      const changedFiles = [...pendingFiles].sort();
      pendingFiles.clear();
      const actualChanges = changedFiles.filter((relativePath) => {
        const currentSignature = fileSignature(path.join(root, relativePath));
        const previousSignature = baseline.get(relativePath);
        baseline.set(relativePath, currentSignature);
        return currentSignature !== previousSignature;
      });
      if (actualChanges.length === 0) {
        return;
      }
      const version = await getVersion();
      await recordPendingLocalChanges(actualChanges, version);
      if (stopped || updatePromptIssued) {
        return;
      }
      updatePromptIssued = true;
      updateEventEmitter.emit('update-received', {
        message: 'A new update has been found.',
        update: {
          latest: version,
          current: version,
          name: 'Gemini CLI AGY Adapter',
        },
        changedFiles: actualChanges,
        isUpdating: false,
      } satisfies UpdateObject);
    };
    const watcher = watch(root, { recursive: true }, (event, filename) => {
      const normalized = normalizeWatchedFilename(filename);
      if (!normalized || !isWatchedFile(root, normalized, event)) {
        return;
      }
      // The state file is normally outside the build tree, but test/dev
      // configurations can place it under the watched root. Never watch our
      // own persistence file or it will recursively trigger another update.
      const watchedAbsolute = path.resolve(root, normalized);
      if (
        watchedAbsolute.toLowerCase() ===
        path.resolve(getPendingUpdatePath()).toLowerCase()
      ) {
        return;
      }
      pendingFiles.add(normalized);
      if (flushTimer) {
        clearTimeout(flushTimer);
      }
      flushTimer = setTimeout(() => void flushChanges(), 300);
    });
    return () => {
      stopped = true;
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      pendingFiles.clear();
      watcher.close();
    };
  } catch {
    return () => {};
  }
}
