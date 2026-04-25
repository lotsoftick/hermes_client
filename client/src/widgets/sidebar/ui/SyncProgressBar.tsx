import { Box, useTheme } from '@mui/material';

export default function SyncProgressBar() {
  const { sidebar } = useTheme().palette;

  return (
    <Box
      sx={{
        mb: 1,
        px: 0.5,
        overflow: 'hidden',
        height: 2,
        borderRadius: 1,
        bgcolor: sidebar.border,
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          height: '100%',
          borderRadius: 1,
          bgcolor: sidebar.selectedBorder,
          animation: 'indeterminate 1.4s ease-in-out infinite',
          '@keyframes indeterminate': {
            '0%': { width: '0%', marginLeft: '0%' },
            '50%': { width: '60%', marginLeft: '20%' },
            '100%': { width: '0%', marginLeft: '100%' },
          },
        }}
      />
    </Box>
  );
}
