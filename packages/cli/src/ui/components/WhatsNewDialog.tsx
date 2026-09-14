/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import type { LocalChangeSummary } from '../utils/updateCheck.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';

interface WhatsNewDialogProps {
  summary: LocalChangeSummary;
  onDismiss: () => void;
}

/** Shows the post-restart What's New summary for the local build. */
export function WhatsNewDialog({
  summary,
  onDismiss,
}: WhatsNewDialogProps): React.JSX.Element {
  useKeypress(
    (key) => {
      if (
        key.sequence === '1' ||
        key.sequence === '2' ||
        key.name === 'escape'
      ) {
        onDismiss();
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
      width="100%"
    >
      <Text bold color={theme.status.warning}>
        What&apos;s New
      </Text>
      <Text>The update is now active. Here&apos;s what changed:</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Changed:</Text>
        {summary.descriptions.map((description) => (
          <Text key={description}>• {description}</Text>
        ))}
      </Box>
      <Text color={theme.text.secondary}>Press 1 or 2 to dismiss</Text>
    </Box>
  );
}
