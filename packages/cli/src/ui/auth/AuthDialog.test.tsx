/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { Text } from 'ink';
import { AuthType, type Config } from '@google/gemini-cli-core';
import { renderWithProviders } from '../../test-utils/render.js';
import type { LoadedSettings } from '../../config/settings.js';
import { AuthDialog } from './AuthDialog.js';
import type { AuthState } from '../types.js';

vi.mock('../hooks/useKeypress.js', () => ({ useKeypress: vi.fn() }));
vi.mock('../components/shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: ({ items }: { items: Array<{ label: string }> }) => (
    <>
      {items.map((item) => (
        <Text key={item.label}>{item.label}</Text>
      ))}
    </>
  ),
}));

describe('AuthDialog', () => {
  it('offers only the authenticated AGY session', async () => {
    const settings = {
      merged: { security: { auth: { selectedType: AuthType.AGY } } },
      setValue: vi.fn(),
    } as unknown as LoadedSettings;
    const { lastFrame } = await renderWithProviders(
      <AuthDialog
        config={{} as Config}
        settings={settings}
        setAuthState={vi.fn<(state: AuthState) => void>()}
        authError={null}
        onAuthError={vi.fn()}
        setAuthContext={vi.fn()}
      />,
    );
    expect(lastFrame()).toContain('Authenticated with AGY');
    expect(lastFrame()).toContain('local Antigravity CLI session');
    expect(lastFrame()).not.toContain('API key');
    expect(lastFrame()).not.toContain('Google');
  });
});
