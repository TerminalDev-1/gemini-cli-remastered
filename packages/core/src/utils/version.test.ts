/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPackageJson } from './package.js';
import { getVersion, resetVersionCache } from './version.js';

vi.mock('./package.js', () => ({ getPackageJson: vi.fn() }));

describe('version', () => {
  beforeEach(() => {
    delete process.env['CLI_VERSION'];
    resetVersionCache();
    vi.mocked(getPackageJson).mockResolvedValue({ version: '1.2.3' });
  });

  it('keeps the Gemini build string and appends RR-release-preview', async () => {
    await expect(getVersion()).resolves.toBe('1.2.3 RR-release-preview');
  });

  it('also labels an injected build string', async () => {
    process.env['CLI_VERSION'] = 'custom-build';
    await expect(getVersion()).resolves.toBe('custom-build RR-release-preview');
  });
});
