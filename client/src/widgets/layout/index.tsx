import { type ReactNode, useState } from 'react';
import { Box, Drawer, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { Menu as MenuIcon } from '@mui/icons-material';
import { Outlet } from 'react-router';
import Sidebar, { SIDEBAR_WIDTH } from '../sidebar';

interface LayoutProps {
  children?: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavClose = () => {
    if (isMobile) setMobileOpen(false);
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', minWidth: 0, overflow: 'hidden' }}>
      {isMobile ? (
        <>
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={{ '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, boxSizing: 'border-box' } }}
          >
            <Sidebar onNavigate={handleNavClose} />
          </Drawer>
        </>
      ) : (
        <Sidebar />
      )}
      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          p: { xs: 0, md: 3 },
          bgcolor: 'background.default',
          height: '100vh',
          overflowY: 'auto',
          position: 'relative',
          clipPath: 'inset(0)',
          '&::before': {
            content: '""',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            opacity: 0.08,
            pointerEvents: 'none',
            zIndex: 0,
          },
          '& > *': {
            position: 'relative',
            zIndex: 1,
          },
        }}
      >
        {isMobile && (
          <Box sx={{ position: 'fixed', top: 8, left: 8, zIndex: 1100 }}>
            <IconButton
              onClick={() => setMobileOpen(true)}
              sx={{
                bgcolor: theme.palette.sidebar.background,
                color: theme.palette.sidebar.text,
                boxShadow: 2,
                '&:hover': { bgcolor: theme.palette.sidebar.hover },
              }}
            >
              <MenuIcon />
            </IconButton>
          </Box>
        )}
        {children ?? <Outlet />}
      </Box>
    </Box>
  );
}
