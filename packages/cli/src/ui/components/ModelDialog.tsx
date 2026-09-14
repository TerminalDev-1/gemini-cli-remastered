/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import {
  DEFAULT_AGY_MODEL,
  listAgyModels,
  ModelSlashCommandEvent,
  logModelSlashCommand,
  type AgyModel,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';

interface ModelDialogProps {
  onClose: () => void;
}

export function ModelDialog({ onClose }: ModelDialogProps): React.JSX.Element {
  const config = useContext(ConfigContext);
  const [models, setModels] = useState<AgyModel[]>([]);
  const [error, setError] = useState<string>();
  const [persistMode, setPersistMode] = useState(false);

  useEffect(() => {
    void listAgyModels(true)
      .then(setModels)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, []);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onClose();
        return true;
      }
      if (key.name === 'tab') {
        setPersistMode((previous) => !previous);
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const preferredModel = config?.getModel() || DEFAULT_AGY_MODEL;
  const options = useMemo(
    () =>
      models.map((model) => ({
        value: model.id,
        title: model.name,
        description: model.id,
        key: model.id,
      })),
    [models],
  );
  const initialIndex = Math.max(
    0,
    options.findIndex((option) => option.value === preferredModel),
  );
  const handleSelect = useCallback(
    (model: string) => {
      config?.setModel(model, !persistMode);
      if (config) {
        logModelSlashCommand(config, new ModelSlashCommandEvent(model));
      }
      onClose();
    },
    [config, onClose, persistMode],
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select Antigravity Model</Text>
      <Box marginTop={1}>
        {error ? (
          <Text color={theme.status.error}>{error}</Text>
        ) : options.length === 0 ? (
          <Text color={theme.text.secondary}>Loading models from AGY…</Text>
        ) : (
          <DescriptiveRadioButtonSelect
            items={options}
            onSelect={handleSelect}
            initialIndex={initialIndex}
            showNumbers={true}
            showScrollArrows={true}
          />
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          Remember model: {persistMode ? 'true' : 'false'} (Tab to toggle)
        </Text>
      </Box>
      <Text color={theme.text.secondary}>(Press Esc to close)</Text>
    </Box>
  );
}
