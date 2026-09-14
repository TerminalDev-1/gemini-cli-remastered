/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { summarizeChangedFiles } from '../utils/updateCheck.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';

interface UpdateDialogProps {
  onRestart: () => void;
  onContinue: () => void;
  changedFiles?: string[];
}

/** The live update prompt shown before reloading the process. */
export function UpdateDialog({
  onRestart,
  onContinue,
  changedFiles = [],
}: UpdateDialogProps): React.JSX.Element {
  const descriptions = summarizeChangedFiles(changedFiles);
  useKeypress(
    (key) => {
      if (key.sequence === '1') {
        onContinue();
        return true;
      }
      if (key.sequence === '2') {
        onRestart();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.status.warning}
      flexDirection="column"
      paddingX={1}
      paddingY={1}
      width="100%"
    >
      <Text bold color={theme.status.warning}>
        A new update has been found.
      </Text>
      <Text>Here&apos;s what changed:</Text>
      <Box flexDirection="column" marginTop={1}>
        {(descriptions.length > 0
          ? descriptions
          : ['Updated the local Gemini CLI build.']
        ).map((description) => (
          <Text key={description}>• {description}</Text>
        ))}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text>1. Continue current session</Text>
        <Text>2. Restart now</Text>
      </Box>
      <Text color={theme.text.secondary}>Select 1 or 2</Text>
    </Box>
  );
}
