/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  EmbedContentResponse,
  FinishReason,
  GenerateContentResponse,
  type CountTokensParameters,
  type EmbedContentParameters,
  type GenerateContentParameters,
  type GenerateContentResponseUsageMetadata,
  type Part,
} from '@google/genai';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Config, ReasoningEffort } from '../config/config.js';
import type { LlmRole } from '../telemetry/llmRole.js';
import type { ContentGenerator } from './contentGenerator.js';

const execFileAsync = promisify(execFile);
export const DEFAULT_AGY_MODEL = 'gemini-3.8-flash-high';
const AGY_RESPONSE_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    text: { type: 'string' },
    functionCalls: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          args: { type: 'object', additionalProperties: true },
        },
        required: ['name', 'args'],
        additionalProperties: false,
      },
    },
  },
  required: ['text', 'functionCalls'],
  additionalProperties: false,
});

export interface AgyModel {
  id: string;
  name: string;
}

interface AgyUsage {
  input_tokens?: number;
  output_tokens?: number;
  thinking_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
}

interface AgyStructuredResponse {
  text?: string;
  functionCalls?: Array<{ name: string; args: Record<string, unknown> }>;
}

interface AgyResult {
  status?: string;
  response?: string;
  error?: string;
  structured_output?: AgyStructuredResponse;
  usage?: AgyUsage;
}

interface AgyEvent {
  event?: string;
  result?: AgyResult;
}

let cachedModels: AgyModel[] | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStructuredResponse(value: unknown): value is AgyStructuredResponse {
  if (!isRecord(value)) {
    return false;
  }
  if (value['text'] !== undefined && !isString(value['text'])) {
    return false;
  }
  const calls = value['functionCalls'];
  return (
    calls === undefined ||
    (Array.isArray(calls) &&
      calls.every(
        (call) =>
          isRecord(call) && isString(call['name']) && isRecord(call['args']),
      ))
  );
}

function isAgyEvent(value: unknown): value is AgyEvent {
  if (!isRecord(value)) {
    return false;
  }
  if (value['event'] !== undefined && !isString(value['event'])) {
    return false;
  }
  return value['result'] === undefined || isRecord(value['result']);
}

export function getAgyExecutable(): string {
  const configured = process.env['AGY_PATH']?.trim();
  if (configured) {
    return configured;
  }

  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'];
    if (localAppData) {
      const installedBinary = path.join(localAppData, 'agy', 'bin', 'agy.exe');
      if (existsSync(installedBinary)) {
        return installedBinary;
      }
    }
  }

  return 'agy';
}

export async function listAgyModels(forceRefresh = false): Promise<AgyModel[]> {
  if (cachedModels && !forceRefresh) {
    return cachedModels;
  }

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(getAgyExecutable(), ['models'], {
      encoding: 'utf8',
      timeout: 30_000,
      windowsHide: true,
    }));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to use Antigravity CLI. Install and authenticate AGY first. ${detail}`,
    );
  }

  cachedModels = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .map((line) => line.match(/^(\S+)\s+(.+)$/u))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ id: match[1], name: match[2].trim() }));

  if (cachedModels.length === 0) {
    throw new Error(
      'Antigravity CLI returned no models. Launch `agy` once and complete authentication.',
    );
  }

  return cachedModels;
}

export async function validateAgyAuthentication(): Promise<void> {
  await listAgyModels(true);
}

function buildBackendPrompt(request: GenerateContentParameters): string {
  return [
    'You are the model backend for a separate Gemini CLI-compatible frontend.',
    'Do not use Antigravity CLI tools. The frontend owns tool execution.',
    'Return a normal response in `text`, or request frontend tools in `functionCalls`.',
    'Use only function names declared in request.config.tools.',
    'When requesting tools, keep text empty. Otherwise return an empty functionCalls array.',
    'The complete frontend request follows as JSON:',
    JSON.stringify({
      systemInstruction: request.config?.systemInstruction,
      contents: request.contents,
      tools: request.config?.tools,
      toolConfig: request.config?.toolConfig,
      responseMimeType: request.config?.responseMimeType,
      responseSchema: request.config?.responseSchema,
    }),
  ].join('\n\n');
}

function toUsageMetadata(
  usage: AgyUsage | undefined,
): GenerateContentResponseUsageMetadata {
  return {
    promptTokenCount: usage?.input_tokens ?? 0,
    candidatesTokenCount: usage?.output_tokens ?? 0,
    thoughtsTokenCount: usage?.thinking_tokens ?? 0,
    cachedContentTokenCount: usage?.cache_read_tokens ?? 0,
    totalTokenCount: usage?.total_tokens ?? 0,
  };
}

function parseStructuredResponse(result: AgyResult): AgyStructuredResponse {
  if (result.structured_output) {
    return result.structured_output;
  }
  if (result.response) {
    try {
      const parsed: unknown = JSON.parse(result.response);
      if (isStructuredResponse(parsed)) {
        return parsed;
      }
    } catch {
      // Fall back to treating an unstructured response as text.
    }
    return { text: result.response, functionCalls: [] };
  }
  return { text: '', functionCalls: [] };
}

function toGenerateContentResponse(result: AgyResult): GenerateContentResponse {
  const structured = parseStructuredResponse(result);
  const parts: Part[] = [];
  if (structured.text) {
    parts.push({ text: structured.text });
  }
  for (const call of structured.functionCalls ?? []) {
    parts.push({ functionCall: { name: call.name, args: call.args } });
  }

  const response = new GenerateContentResponse();
  response.candidates = [
    {
      index: 0,
      content: { role: 'model', parts },
      finishReason: FinishReason.STOP,
    },
  ];
  response.modelVersion = 'antigravity-cli';
  response.usageMetadata = toUsageMetadata(result.usage);
  return response;
}

async function runAgy(
  request: GenerateContentParameters,
  cwd: string,
  reasoningEffort: ReasoningEffort | undefined,
): Promise<GenerateContentResponse> {
  const models = await listAgyModels();
  const requestedModel = request.model.trim();
  const selectedModel = models.some((model) => model.id === requestedModel)
    ? requestedModel
    : undefined;
  const args = [
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--disable-slash-commands',
    '--json-schema',
    AGY_RESPONSE_SCHEMA,
  ];
  if (selectedModel) {
    args.push('--model', selectedModel);
  }
  if (reasoningEffort) {
    args.push('--effort', reasoningEffort);
  }

  const child = spawn(getAgyExecutable(), args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const abortSignal = request.config?.abortSignal;
  const abort = () => child.kill();
  abortSignal?.addEventListener('abort', abort, { once: true });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  child.stdin.end(
    `${JSON.stringify({
      event: 'user',
      message: { content: buildBackendPrompt(request) },
    })}\n`,
  );

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  }).finally(() => abortSignal?.removeEventListener('abort', abort));

  if (abortSignal?.aborted) {
    throw new Error('Antigravity request aborted.');
  }
  if (exitCode !== 0) {
    throw new Error(
      `Antigravity CLI exited with code ${String(exitCode)}: ${stderr.trim()}`,
    );
  }

  const events = stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed: unknown = JSON.parse(line);
        return isAgyEvent(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    })
    .filter((event): event is AgyEvent => Boolean(event));
  const terminalEvent = events.findLast((event) => event.event === 'result');
  const result = terminalEvent?.result;
  if (!result) {
    throw new Error(
      `Antigravity CLI returned no result event. ${stderr.trim()}`.trim(),
    );
  }
  if (result.status !== 'SUCCESS') {
    throw new Error(result.error || `Antigravity request ${result.status}.`);
  }
  return toGenerateContentResponse(result);
}

function textForLocalCalculation(value: unknown): string {
  return JSON.stringify(value) ?? '';
}

export class AgyContentGenerator implements ContentGenerator {
  constructor(private readonly config: Config) {}

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<GenerateContentResponse> {
    return runAgy(
      request,
      this.config.getTargetDir(),
      this.config.getReasoningEffort(),
    );
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const response = await this.generateContent(request, userPromptId, role);
    async function* stream() {
      yield response;
    }
    return stream();
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    const response = new CountTokensResponse();
    response.totalTokens = Math.ceil(
      textForLocalCalculation(request).length / 4,
    );
    return response;
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    const dimensions = 128;
    const values = new Array<number>(dimensions).fill(0);
    const text = textForLocalCalculation(request.contents);
    for (let index = 0; index < text.length; index++) {
      values[(text.charCodeAt(index) + index * 31) % dimensions] += 1;
    }
    const magnitude = Math.sqrt(
      values.reduce((sum, value) => sum + value * value, 0),
    );
    const response = new EmbedContentResponse();
    response.embeddings = [
      { values: magnitude ? values.map((value) => value / magnitude) : values },
    ];
    return response;
  }
}
