/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { spawn } from 'node:child_process';
import type { UpdateObject } from '../ui/utils/updateCheck.js';
import type { LoadedSettings } from '../config/settings.js';
import { updateEventEmitter } from './updateEventEmitter.js';
import { MessageType, type HistoryItem } from '../ui/types.js';

/** npm self-updates are permanently disabled in this fork. */
export function isUpdateInProgress(): boolean {
  return false;
}

/** @internal */
export function _setUpdateStateForTesting(_value: boolean): void {}

export async function waitForUpdateCompletion(
  _timeoutMs = 30_000,
): Promise<void> {}

/**
 * Retained for compatibility with callers and extensions. It only displays a
 * restart notice and never invokes npm or another package manager.
 */
export function handleAutoUpdate(
  info: UpdateObject | null,
  _settings: LoadedSettings,
  _projectRoot: string,
  _isSandboxEnabled: boolean,
  _spawnFn?: typeof spawn,
) {
  if (info) {
    updateEventEmitter.emit('update-received', {
      ...info,
      isUpdating: false,
    });
  }
  return undefined;
}

export function setUpdateHandler(
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
  setUpdateInfo: (info: UpdateObject | null) => void,
) {
  let lastNotificationKey: string | undefined;
  const handleUpdateReceived = (info: UpdateObject) => {
    const notificationKey = JSON.stringify({
      message: info.message,
      update: info.update,
    });
    if (notificationKey === lastNotificationKey) {
      return;
    }
    lastNotificationKey = notificationKey;
    setUpdateInfo(info);
    addItem(
      {
        type: MessageType.INFO,
        text: info.message,
      },
      Date.now(),
    );
  };

  updateEventEmitter.on('update-received', handleUpdateReceived);
  return () => {
    updateEventEmitter.off('update-received', handleUpdateReceived);
  };
}
