import { useState } from 'react';
import { Box, useTheme } from '@mui/material';
import { UpdateBanner } from '../../features/update/install';
import { InstallAppBanner } from '../../features/pwa/install';
import { ThemePicker } from '../../features/theme';
import SidebarHeader from './ui/SidebarHeader';
import SidebarSearch from './ui/SidebarSearch';
import SidebarMenu from './ui/SidebarMenu';
import AgentsPanel from './ui/AgentsPanel';

export const SIDEBAR_WIDTH = 240;

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const { sidebar } = useTheme().palette;
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        height: '100vh',
        bgcolor: sidebar.background,
        borderRight: 'none',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
      }}
    >
      <SidebarHeader />
      <SidebarSearch value={searchQuery} onChange={setSearchQuery} />
      <SidebarMenu onNavigate={onNavigate} />
      <AgentsPanel searchQuery={searchQuery} onNavigate={onNavigate} />
      <InstallAppBanner />
      <UpdateBanner />
      <ThemePicker />
    </Box>
  );
}
