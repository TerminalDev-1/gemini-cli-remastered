/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { AuthType, validateAgyAuthentication } from '@google/gemini-cli-core';

export const authCommand: SlashCommand = {
  name: 'auth',
  description: 'Show Antigravity CLI authentication status',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    try {
      await validateAgyAuthentication();
      const selected =
        context.services.settings.merged.security.auth.selectedType;
      return {
        type: 'message',
        messageType: 'info',
        content:
          selected === AuthType.AGY
            ? 'Authenticated with AGY.'
            : 'AGY is authenticated. Select “Authenticated with AGY” to activate it.',
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
