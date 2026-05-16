import type { ReactNode } from 'react';
import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, useTheme } from '@mui/material';
import { Extension, Psychology, Schedule, Person, People } from '@mui/icons-material';
import { Link, useLocation } from 'react-router';
import { useGetMeQuery } from '../../../features/auth/api';

interface MenuItem {
  text: string;
  icon: ReactNode;
  path: string;
}

const ACCOUNT_ITEM: MenuItem = {
  text: 'ACCOUNT',
  icon: <Person sx={{ fontSize: 18 }} />,
  path: '/account',
};

const USERS_ITEM: MenuItem = {
  text: 'USERS',
  icon: <People sx={{ fontSize: 18 }} />,
  path: '/users',
};

const STATIC_ITEMS: MenuItem[] = [
  { text: 'PLUGINS', icon: <Extension sx={{ fontSize: 18 }} />, path: '/plugins' },
  { text: 'SKILLS', icon: <Psychology sx={{ fontSize: 18 }} />, path: '/skills' },
  { text: 'CRON', icon: <Schedule sx={{ fontSize: 18 }} />, path: '/cron' },
];

interface SidebarMenuProps {
  onNavigate?: () => void;
}

export default function SidebarMenu({ onNavigate }: SidebarMenuProps) {
  const location = useLocation();
  const { sidebar } = useTheme().palette;
  // `useGetMeQuery` is also called by `PrivateRoute`, so this hits the
  // RTK Query cache instead of firing a second request. While the value
  // is loading we surface neither entry — flipping a label mid-render
  // would be jumpier than a one-tick gap.
  const { data: me } = useGetMeQuery();
  const accountEntry: MenuItem | null =
    me?.singleUserMode === true
      ? ACCOUNT_ITEM
      : me?.singleUserMode === false
        ? USERS_ITEM
        : null;
  const items: MenuItem[] = accountEntry ? [accountEntry, ...STATIC_ITEMS] : STATIC_ITEMS;

  return (
    <List sx={{ px: 2, py: 0, flexShrink: 0 }}>
      {items.map((item) => {
        const isSelected =
          location.pathname === item.path || location.pathname.startsWith(item.path + '/');
        return (
          <ListItem key={item.text} disablePadding sx={{ mb: 0.2 }}>
            <ListItemButton
              component={Link}
              to={item.path}
              onClick={onNavigate}
              selected={isSelected}
              sx={{
                borderRadius: 1.5,
                py: 0.6,
                px: 1.5,
                textDecoration: 'none',
                position: 'relative',
                '&:hover': {
                  bgcolor: sidebar.hover,
                  '& .MuiListItemText-primary': { color: sidebar.selectedText },
                  '& .MuiListItemIcon-root': { color: sidebar.selectedText },
                },
                '&.Mui-selected': {
                  bgcolor: sidebar.selectedBg,
                  boxShadow: '0 2px 8px rgba(44, 44, 40, 0.06)',
                  '&:hover': { bgcolor: sidebar.selectedBg },
                  '& .MuiListItemText-primary': { color: sidebar.selectedText },
                  '& .MuiListItemIcon-root': { color: sidebar.selectedBorder },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 28, color: sidebar.text }}>{item.icon}</ListItemIcon>
              <ListItemText
                primary={item.text}
                sx={{
                  '& .MuiListItemText-primary': {
                    color: sidebar.text,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    letterSpacing: '1px',
                  },
                }}
              />
              {isSelected && (
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: sidebar.selectedBorder,
                    ml: 1,
                  }}
                />
              )}
            </ListItemButton>
          </ListItem>
        );
      })}
    </List>
  );
}
