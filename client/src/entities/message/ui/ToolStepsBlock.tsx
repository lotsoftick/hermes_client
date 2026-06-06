import { useState } from 'react';
import { Box, Collapse, Stack, Typography } from '@mui/material';
import { ExpandMore, Build, ErrorOutline, CheckCircleOutline } from '@mui/icons-material';
import type { ToolCall } from '../api';
import { aggregateStatus } from '../lib/toolStepFormatting';
import ToolStepPair from './ToolStepPair';

interface ToolStepsBlockProps {
  calls: ToolCall[];
  asStandalone?: boolean;
}

export default function ToolStepsBlock({ calls, asStandalone }: ToolStepsBlockProps) {
  const [open, setOpen] = useState(false);
  if (!calls.length) return null;

  const status = aggregateStatus(calls);
  const trailing = (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {status === 'ok' && (
        <CheckCircleOutline sx={{ fontSize: 13, color: 'success.main', opacity: 0.7 }} />
      )}
      {status === 'error' && <ErrorOutline sx={{ fontSize: 13, color: 'error.main' }} />}
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
        {calls.length === 1 ? '1 call' : `${calls.length} calls`}
      </Typography>
    </Stack>
  );

  return (
    <Box sx={{ mt: asStandalone ? 0 : 0.5 }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'pointer',
          opacity: 0.75,
          '&:hover': { opacity: 1 },
          minWidth: 0,
        }}
      >
        <ExpandMore
          sx={{
            fontSize: 14,
            transition: 'transform 0.2s',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            flexShrink: 0,
          }}
        />
        {asStandalone && <Build sx={{ fontSize: 13, color: 'text.secondary', flexShrink: 0 }} />}
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.72rem', flexShrink: 0 }}>
          Tool execution
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0 }} />
        <Box sx={{ flexShrink: 0 }}>{trailing}</Box>
      </Box>
      <Collapse in={open}>
        <Box sx={{ pl: 2, mt: 0.25 }}>
          {calls.map((call, idx) => (
            <ToolStepPair key={`${call.id || call.name}-${idx}`} call={call} idx={idx} />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
