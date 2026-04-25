import { Box, Typography, useTheme } from '@mui/material';

export default function SidebarHeader() {
  const { sidebar } = useTheme().palette;
  return (
    <Box
      sx={{
        p: 3,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 1,
        flexShrink: 0,
      }}
    >
      <Box component="img" src="/logo_256.png" alt="Hermes" sx={{ width: 32, height: 32 }} />
      <Typography
        variant="h6"
        component="span"
        sx={{ fontWeight: 700, letterSpacing: '1px', color: 'error.main' }}
      >
        Hermes
      </Typography>
      <Typography
        variant="h6"
        component="span"
        sx={{ fontWeight: 700, letterSpacing: '1px', color: sidebar.selectedText }}
      >
        Client
      </Typography>
    </Box>
  );
}
