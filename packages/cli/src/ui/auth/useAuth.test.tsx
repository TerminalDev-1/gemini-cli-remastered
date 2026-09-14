/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { AuthType } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';
import { validateAuthMethodWithSettings } from './useAuth.js';

const validateAuthMethod = vi.hoisted(() => vi.fn());
vi.mock('../../config/auth.js', () => ({ validateAuthMethod }));

describe('validateAuthMethodWithSettings', () => {
  it('validates the AGY authentication method', async () => {
    validateAuthMethod.mockResolvedValue(null);
    const settings = {
      merged: { security: { auth: {} } },
    } as LoadedSettings;
    await expect(
      validateAuthMethodWithSettings(AuthType.AGY, settings),
    ).resolves.toBeNull();
    expect(validateAuthMethod).toHaveBeenCalledWith(AuthType.AGY);
  });

  it('rejects a legacy non-AGY method', async () => {
    validateAuthMethod.mockResolvedValue(
      'This build authenticates exclusively through Antigravity CLI (AGY).',
    );
    const settings = {
      merged: { security: { auth: { enforcedType: AuthType.AGY } } },
    } as LoadedSettings;
    await expect(
      validateAuthMethodWithSettings(AuthType.USE_GEMINI, settings),
    ).resolves.toContain('Antigravity CLI');
  });
});
