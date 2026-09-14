/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, validateAgyAuthentication } from '@google/gemini-cli-core';

export async function validateAuthMethod(
  authMethod: string,
): Promise<string | null> {
  if (authMethod !== AuthType.AGY) {
    return 'This build authenticates exclusively through Antigravity CLI (AGY).';
  }
  try {
    await validateAgyAuthentication();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
