/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from './types.js';
import { effortCommand } from './effortCommand.js';

function createContext(
  effort: 'low' | 'medium' | 'high' | undefined = undefined,
) {
  const config = {
    getReasoningEffort: vi.fn(() => effort),
    setReasoningEffort: vi.fn(),
  };
  return {
    context: {
      services: { agentContext: { config } },
    } as unknown as CommandContext,
    config,
  };
}

describe('/effort', () => {
  it('sets an effort independent of the model', async () => {
    const { context, config } = createContext();
    await expect(effortCommand.action!(context, 'high')).resolves.toEqual({
      type: 'message',
      messageType: 'info',
      content:
        'Reasoning effort set to high; it applies independently of the selected model.',
    });
    expect(config.setReasoningEffort).toHaveBeenCalledWith('high');
  });

  it('reports the current effort and supports auto reset', async () => {
    const { context, config } = createContext('low');
    await expect(effortCommand.action!(context, '')).resolves.toMatchObject({
      content: 'Reasoning effort: low',
    });
    await effortCommand.action!(context, 'auto');
    expect(config.setReasoningEffort).toHaveBeenCalledWith(undefined);
  });

  it('rejects unsupported values', async () => {
    const { context } = createContext();
    await expect(
      effortCommand.action!(context, 'turbo'),
    ).resolves.toMatchObject({
      type: 'message',
      messageType: 'error',
      content: 'Usage: /effort <low|medium|high|auto>',
    });
  });
});
