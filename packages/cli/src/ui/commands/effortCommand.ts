/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
} from './types.js';
import type { Config } from '@google/gemini-cli-core';

type ReasoningEffort = 'low' | 'medium' | 'high';
type ReasoningEffortConfig = Config & {
  getReasoningEffort(): ReasoningEffort | undefined;
  setReasoningEffort(effort: ReasoningEffort | undefined): void;
};

const EFFORT_VALUES = [
  'low',
  'medium',
  'high',
] as const satisfies ReadonlyArray<ReasoningEffort>;
type EffortArgument = (typeof EFFORT_VALUES)[number];

function isEffort(value: string): value is EffortArgument {
  return (EFFORT_VALUES as readonly string[]).includes(value);
}

export const effortCommand: SlashCommand = {
  name: 'effort',
  description:
    'Set AGY reasoning effort independently of the selected model (low, medium, high, or auto)',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  takesArgs: true,
  completion: (_context: CommandContext, partialArg: string) => {
    const partial = partialArg.trim().toLowerCase();
    return ['low', 'medium', 'high', 'auto'].filter((value) =>
      value.startsWith(partial),
    );
  },
  action: async (context: CommandContext, args: string) => {
    const config = context.services.agentContext?.config as
      | ReasoningEffortConfig
      | undefined;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Reasoning effort is unavailable before configuration loads.',
      };
    }

    const value = args.trim().toLowerCase();
    if (!value) {
      return {
        type: 'message',
        messageType: 'info',
        content: `Reasoning effort: ${config.getReasoningEffort() ?? 'auto (model default)'}`,
      };
    }

    if (value === 'auto' || value === 'default' || value === 'model') {
      config.setReasoningEffort(undefined);
      return {
        type: 'message',
        messageType: 'info',
        content:
          'Reasoning effort reset to auto; each model will use its own default.',
      };
    }

    if (!isEffort(value)) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Usage: /effort <low|medium|high|auto>',
      };
    }

    config.setReasoningEffort(value);
    return {
      type: 'message',
      messageType: 'info',
      content: `Reasoning effort set to ${value}; it applies independently of the selected model.`,
    };
  },
};
