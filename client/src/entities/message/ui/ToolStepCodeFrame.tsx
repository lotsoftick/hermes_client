import { Box } from '@mui/material';

export default function ToolStepCodeFrame({ children }: { children: string }) {
  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        mt: 0.5,
        p: 1,
        bgcolor: 'action.hover',
        borderRadius: 1,
        fontSize: '0.72rem',
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: 320,
        overflow: 'auto',
        color: 'text.secondary',
      }}
    >
      {children}
    </Box>
  );
}
