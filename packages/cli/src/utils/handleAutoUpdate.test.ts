/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { LoadedSettings } from '../config/settings.js';
import type { UpdateObject } from '../ui/utils/updateCheck.js';
import {
  handleAutoUpdate,
  isUpdateInProgress,
  setUpdateHandler,
  waitForUpdateCompletion,
} from './handleAutoUpdate.js';
import { updateEventEmitter } from './updateEventEmitter.js';

describe('local-only update handling', () => {
  it('never starts an updater process', async () => {
    const spawn = vi.fn();
    const info: UpdateObject = {
      message: 'Restart to update.',
      update: { latest: '1', current: '1', name: 'local build' },
    };
    const emit = vi.spyOn(updateEventEmitter, 'emit');

    handleAutoUpdate(info, {} as LoadedSettings, process.cwd(), false, spawn);

    expect(spawn).not.toHaveBeenCalled();
    expect(isUpdateInProgress()).toBe(false);
    expect(emit).toHaveBeenCalledWith('update-received', {
      ...info,
      isUpdating: false,
    });
    await expect(waitForUpdateCompletion()).resolves.toBeUndefined();
  });

  it('coalesces duplicate notifications for the same build update', () => {
    const addItem = vi.fn();
    const setUpdateInfo = vi.fn();
    const cleanup = setUpdateHandler(addItem, setUpdateInfo);
    const info: UpdateObject = {
      message: 'A new update has been found.',
      update: {
        latest: 'build V0.2.1',
        current: 'build V0.2.1',
        name: 'Gemini CLI AGY Adapter',
      },
    };

    try {
      updateEventEmitter.emit('update-received', info);
      updateEventEmitter.emit('update-received', info);
      expect(setUpdateInfo).toHaveBeenCalledTimes(1);
      expect(addItem).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });
});
