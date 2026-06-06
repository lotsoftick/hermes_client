import { Stack, Typography } from '@mui/material';
import { ErrorOutline, CheckCircleOutline } from '@mui/icons-material';
import type { ToolCall } from '../api';
import { callErrored } from '../lib/toolStepFormatting';

export default function ToolStepTrailing({ call }: { call: ToolCall }) {
  if (call.result === null) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', opacity: 0.6 }}>
        pending
      </Typography>
    );
  }

  const errored = callErrored(call);

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {errored ? (
        <ErrorOutline sx={{ fontSize: 13, color: 'error.main' }} />
      ) : (
        <CheckCircleOutline sx={{ fontSize: 13, color: 'success.main', opacity: 0.7 }} />
      )}
      {typeof call.exitCode === 'number' && call.exitCode !== 0 && (
        <Typography variant="caption" color="error.main" sx={{ fontSize: '0.65rem' }}>
          exit {call.exitCode}
        </Typography>
      )}
    </Stack>
  );
}
