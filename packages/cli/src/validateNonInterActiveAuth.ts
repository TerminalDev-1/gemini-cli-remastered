/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  debugLogger,
  OutputFormat,
  ExitCodes,
  getAuthTypeFromEnv,
  type Config,
  type AuthType,
} from '@google/gemini-cli-core';
import { USER_SETTINGS_PATH, type LoadedSettings } from './config/settings.js';
import { validateAuthMethod } from './config/auth.js';
import { handleError } from './utils/errors.js';
import { runExitCleanup } from './utils/cleanup.js';

export async function validateNonInteractiveAuth(
  _configuredAuthType: AuthType | undefined,
  _useExternalAuth: boolean | undefined,
  nonInteractiveConfig: Config,
  _settings: LoadedSettings,
) {
  try {
    const effectiveAuthType = getAuthTypeFromEnv();

    if (!effectiveAuthType) {
      throw new Error(
        `Set Antigravity CLI authentication in ${USER_SETTINGS_PATH} before running.`,
      );
    }

    const authType: AuthType = effectiveAuthType;

    const err = await validateAuthMethod(String(authType));
    if (err != null) {
      throw new Error(err);
    }

    return authType;
  } catch (error) {
    if (nonInteractiveConfig.getOutputFormat() === OutputFormat.JSON) {
      handleError(
        error instanceof Error ? error : new Error(String(error)),
        nonInteractiveConfig,
        ExitCodes.FATAL_AUTHENTICATION_ERROR,
      );
    } else {
      debugLogger.error(error instanceof Error ? error.message : String(error));
      await runExitCleanup();
      process.exit(ExitCodes.FATAL_AUTHENTICATION_ERROR);
    }
  }
}
