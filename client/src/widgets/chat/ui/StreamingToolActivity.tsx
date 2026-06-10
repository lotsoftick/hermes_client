import { Box, CircularProgress, Paper, Stack, Typography, useTheme } from '@mui/material';
import { Build, CheckCircleOutline } from '@mui/icons-material';
import type { StreamingToolCall } from '../../../features/message/send';

interface StreamingToolActivityProps {
  tools: StreamingToolCall[];
}

/**
 * Live tool activity for the in-flight turn — one row per tool call,
 * spinner while running, check when finished. Once the turn completes the
 * persisted message renders its own expandable ToolStepsBlock; this block
 * only exists so the user sees progress instead of a silent gap.
 */
export default function StreamingToolActivity({ tools }: StreamingToolActivityProps) {
  const theme = useTheme();
  if (tools.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 1.5, width: '100%' }}>
      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 1,
          maxWidth: { xs: '90%', sm: '80%', md: 'min(70%, 100%)' },
          bgcolor: theme.palette.chat.assistantBubble,
          borderRadius: 3,
          borderTopLeftRadius: 4,
        }}
      >
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5, opacity: 0.75 }}>
          <Build sx={{ fontSize: 13, color: 'text.secondary' }} />
          <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
            Working…
          </Typography>
        </Stack>
        <Stack spacing={0.4}>
          {tools.map((tool) => (
            <Stack key={tool.id} direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
              {tool.status === 'running' ? (
                <CircularProgress size={11} thickness={5} sx={{ flexShrink: 0 }} />
              ) : (
                <CheckCircleOutline
                  sx={{ fontSize: 13, color: 'success.main', opacity: 0.8, flexShrink: 0 }}
                />
              )}
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, fontSize: '0.7rem', flexShrink: 0 }}
              >
                {tool.name}
              </Typography>
              {(tool.summary || tool.label) && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontSize: '0.68rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minWidth: 0,
                  }}
                >
                  {tool.summary || tool.label}
                </Typography>
              )}
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}
