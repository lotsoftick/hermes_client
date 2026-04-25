import { useState } from 'react';
import {
  Box,
  Popover,
  Typography,
  ButtonBase,
  useTheme,
} from '@mui/material';
import { Palette } from '@mui/icons-material';
import { themeConfigs, type ThemeId } from '../../app/theme';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { setTheme } from './slice';

const themeEntries = Object.entries(themeConfigs) as [ThemeId, typeof themeConfigs[ThemeId]][];

export default function ThemePicker() {
  const theme = useTheme();
  const { sidebar } = theme.palette;
  const dispatch = useAppDispatch();
  const currentThemeId = useAppSelector((s) => s.theme.themeId);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          width: '100%',
          px: 2,
          py: 1.2,
          justifyContent: 'flex-start',
          borderTop: `1px solid ${sidebar.border}`,
          '&:hover': { bgcolor: sidebar.hover },
        }}
      >
        <Palette sx={{ fontSize: 16, color: sidebar.text }} />
        <Typography sx={{ fontSize: '0.72rem', color: sidebar.text, fontWeight: 500 }}>
          {themeConfigs[currentThemeId].name}
        </Typography>
      </ButtonBase>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              ml: 1,
              borderRadius: 2,
              p: 1,
              minWidth: 180,
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            },
          },
        }}
      >
        <Typography
          sx={{ px: 1, pt: 0.5, pb: 1, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'text.secondary' }}
        >
          Theme
        </Typography>
        {themeEntries.map(([id, cfg]) => {
          const isActive = id === currentThemeId;
          return (
            <ButtonBase
              key={id}
              onClick={() => { dispatch(setTheme(id)); setAnchorEl(null); }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.2,
                width: '100%',
                px: 1,
                py: 0.8,
                borderRadius: 1.5,
                justifyContent: 'flex-start',
                bgcolor: isActive ? 'action.selected' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box sx={{ display: 'flex', gap: 0.4 }}>
                {[cfg.primary.main, cfg.sidebar.background, cfg.secondary.main].map((color, i) => (
                  <Box
                    key={i}
                    sx={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      bgcolor: color,
                      border: '1.5px solid',
                      borderColor: 'divider',
                    }}
                  />
                ))}
              </Box>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: isActive ? 600 : 400 }}>
                {cfg.name}
              </Typography>
            </ButtonBase>
          );
        })}
      </Popover>
    </>
  );
}
