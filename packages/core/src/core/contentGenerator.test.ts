/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../config/config.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import {
  AuthType,
  createContentGenerator,
  createContentGeneratorConfig,
  getAuthTypeFromEnv,
} from './contentGenerator.js';
import { AgyContentGenerator } from './agyContentGenerator.js';

const config = {
  getProxy: vi.fn(),
  getModel: vi.fn().mockReturnValue('gemini-3.8-flash-high'),
  getTargetDir: vi.fn().mockReturnValue(process.cwd()),
  getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
  getTelemetryLogPromptsEnabled: vi.fn().mockReturnValue(false),
  getTelemetryTracesEnabled: vi.fn().mockReturnValue(false),
} as unknown as Config;

describe('AGY content generator configuration', () => {
  it('always selects AGY regardless of Google environment variables', () => {
    vi.stubEnv('GEMINI_API_KEY', 'ignored');
    vi.stubEnv('GOOGLE_GENAI_USE_VERTEXAI', 'true');
    expect(getAuthTypeFromEnv()).toBe(AuthType.AGY);
    vi.unstubAllEnvs();
  });

  it('discards API credentials and returns AGY configuration', async () => {
    await expect(
      createContentGeneratorConfig(
        config,
        AuthType.AGY,
        'ignored-key',
        'https://ignored.invalid',
        { Authorization: 'ignored' },
      ),
    ).resolves.toEqual({ authType: AuthType.AGY });
  });

  it('creates the AGY adapter behind the logging wrapper', async () => {
    const generator = await createContentGenerator(
      { authType: AuthType.AGY },
      config,
    );
    expect(generator).toBeInstanceOf(LoggingContentGenerator);
    expect(AgyContentGenerator).toBeTypeOf('function');
  });

  it('rejects legacy Google authentication methods', async () => {
    await expect(
      createContentGenerator({ authType: AuthType.USE_GEMINI }, config),
    ).rejects.toThrow('only supports Antigravity CLI authentication');
  });
});
