import { useState, useCallback, useRef } from 'react';
import { Box, useTheme } from '@mui/material';
import { UpdateBanner } from '../../features/update/install';
import { InstallAppBanner } from '../../features/pwa/install';
import { ThemePicker } from '../../features/theme';
import SidebarHeader from './ui/SidebarHeader';
import SidebarSearch from './ui/SidebarSearch';
import SidebarMenu from './ui/SidebarMenu';
import AgentsPanel from './ui/AgentsPanel';

export const SIDEBAR_WIDTH = 240;
const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const STORAGE_KEY = 'hermes_sidebar_width';

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const { sidebar } = useTheme().palette;
  const [searchQuery, setSearchQuery] = useState('');
  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : SIDEBAR_WIDTH;
  });
  const widthRef = useRef(width);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const startX = e.clientX;
    const startWidth = widthRef.current;
    e.preventDefault();

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + e.clientX - startX));
      widthRef.current = newWidth;
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      localStorage.setItem(STORAGE_KEY, String(widthRef.current));
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <Box
      sx={{
        width,
        height: '100vh',
        bgcolor: sidebar.background,
        borderRight: 'none',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        flexShrink: 0,
      }}
    >
      <SidebarHeader />
      <SidebarSearch value={searchQuery} onChange={setSearchQuery} />
      <SidebarMenu onNavigate={onNavigate} />
      <AgentsPanel searchQuery={searchQuery} onNavigate={onNavigate} />
      <InstallAppBanner />
      <UpdateBanner />
      <ThemePicker />
      <Box
        onMouseDown={handleMouseDown}
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 2,
          height: '100%',
          cursor: 'col-resize',
          zIndex: 10,
          '&:hover': {
            bgcolor: 'primary.main',
            opacity: 0.4,
          },
          transition: 'background-color 0.15s',
        }}
      />
    </Box>
  );
}
