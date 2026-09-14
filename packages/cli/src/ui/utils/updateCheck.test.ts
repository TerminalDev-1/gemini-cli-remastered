/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LoadedSettings } from '../../config/settings.js';
import { updateEventEmitter } from '../../utils/updateEventEmitter.js';
import {
  acknowledgePendingLocalChanges,
  checkForUpdates,
  loadPendingLocalChanges,
  summarizeChangedFiles,
  startLocalUpdateWatcher,
  type UpdateObject,
} from './updateCheck.js';

describe('checkForUpdates', () => {
  afterEach(() => {
    delete process.env['GEMINI_CLI_BUILD_ROOT'];
    delete process.env['GEMINI_CLI_UPDATE_STATE_PATH'];
  });

  it('never checks npm for updates', async () => {
    await expect(checkForUpdates({} as LoadedSettings)).resolves.toBeNull();
  });

  it('asks for a restart when any local build file changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gemini-agy-watch-'));
    process.env['GEMINI_CLI_BUILD_ROOT'] = root;
    process.env['GEMINI_CLI_UPDATE_STATE_PATH'] = path.join(
      root,
      'pending.json',
    );
    const changed = new Promise<UpdateObject>((resolve) => {
      updateEventEmitter.once('update-received', resolve);
    });
    const stop = startLocalUpdateWatcher();
    try {
      await writeFile(path.join(root, 'system-prompt.txt'), 'changed');
      const update = await changed;
      expect(update.message).toBe('A new update has been found.');
      expect(update.update.name).toBe('Gemini CLI AGY Adapter');
      await expect(loadPendingLocalChanges()).resolves.toMatchObject({
        changedFiles: ['system-prompt.txt'],
        descriptions: ['Updated project documentation or text content.'],
      });
    } finally {
      stop();
      await acknowledgePendingLocalChanges();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('ignores generated trees and reports concrete UI changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gemini-agy-watch-'));
    process.env['GEMINI_CLI_BUILD_ROOT'] = root;
    process.env['GEMINI_CLI_UPDATE_STATE_PATH'] = path.join(
      root,
      'pending.json',
    );
    await mkdir(path.join(root, 'dist'), { recursive: true });
    await mkdir(path.join(root, 'src', 'ui'), { recursive: true });
    await writeFile(path.join(root, 'dist', 'bundle.js'), 'initial');
    await writeFile(
      path.join(root, 'src', 'ui', 'AppContainer.tsx'),
      'initial',
    );

    const updates: UpdateObject[] = [];
    const listener = (update: UpdateObject) => updates.push(update);
    updateEventEmitter.on('update-received', listener);
    const stop = startLocalUpdateWatcher();
    try {
      await writeFile(path.join(root, 'dist', 'bundle.js'), 'generated');
      await new Promise((resolve) => setTimeout(resolve, 450));
      expect(updates).toHaveLength(0);

      await writeFile(
        path.join(root, 'src', 'ui', 'AppContainer.tsx'),
        'changed',
      );
      await new Promise((resolve) => setTimeout(resolve, 450));
      expect(updates).toHaveLength(1);
      await expect(loadPendingLocalChanges()).resolves.toMatchObject({
        descriptions: ['Updated the terminal interface.'],
      });
    } finally {
      updateEventEmitter.off('update-received', listener);
      stop();
      await acknowledgePendingLocalChanges();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('emits one prompt while merging later changes into the pending summary', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gemini-agy-watch-'));
    process.env['GEMINI_CLI_BUILD_ROOT'] = root;
    process.env['GEMINI_CLI_UPDATE_STATE_PATH'] = path.join(
      root,
      'pending.json',
    );
    const updates: UpdateObject[] = [];
    const listener = (update: UpdateObject) => updates.push(update);
    updateEventEmitter.on('update-received', listener);
    const stop = startLocalUpdateWatcher();
    try {
      await writeFile(path.join(root, 'first.ts'), 'one');
      await new Promise((resolve) => setTimeout(resolve, 450));
      await writeFile(path.join(root, 'second.ts'), 'two');
      await new Promise((resolve) => setTimeout(resolve, 450));
      expect(updates).toHaveLength(1);
      await expect(loadPendingLocalChanges()).resolves.toMatchObject({
        changedFiles: ['first.ts', 'second.ts'],
      });
    } finally {
      updateEventEmitter.off('update-received', listener);
      stop();
      await acknowledgePendingLocalChanges();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('drops legacy pending state instead of replaying it forever', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'gemini-agy-pending-'));
    const pendingPath = path.join(root, 'pending.json');
    process.env['GEMINI_CLI_BUILD_ROOT'] = root;
    process.env['GEMINI_CLI_UPDATE_STATE_PATH'] = pendingPath;
    await writeFile(
      pendingPath,
      JSON.stringify({ changedFiles: ['unknown file'] }),
    );
    try {
      await expect(loadPendingLocalChanges()).resolves.toBeNull();
      expect(existsSync(pendingPath)).toBe(false);
    } finally {
      await acknowledgePendingLocalChanges();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not use the old generic application-behavior label', () => {
    expect(summarizeChangedFiles(['src/unknown.ts'])).toEqual([
      'Updated application code.',
    ]);
  });
});
