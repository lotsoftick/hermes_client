import { useRef, useState } from 'react';
import { Box, Typography, Chip, CircularProgress, Switch } from '@mui/material';
import { useTogglePluginMutation, type PluginInfo } from '../api';

function sourceLabel(source: string): string {
  if (!source) return 'unknown';
  if (source === 'bundled' || source === 'builtin') return 'built-in';
  if (source === 'installed' || source === 'npm') return 'installed';
  return source;
}

function statusColor(status: string): 'success.main' | 'warning.main' | 'text.disabled' {
  const s = status.toLowerCase();
  if (s.includes('loaded') || s.includes('enabled') || s.includes('active')) return 'success.main';
  if (s.includes('not enabled') || s.includes('disabled')) return 'text.disabled';
  return 'warning.main';
}

export default function PluginRow({ plugin }: { plugin: PluginInfo }) {
  const [togglePlugin] = useTogglePluginMutation();
  const [localEnabled, setLocalEnabled] = useState(plugin.enabled);
  const [toggling, setToggling] = useState(false);
  const busy = useRef(false);

  const handleChange = async () => {
    if (busy.current) return;
    busy.current = true;
    const next = !localEnabled;
    setLocalEnabled(next);
    setToggling(true);
    try {
      await togglePlugin({ name: plugin.name, enable: next }).unwrap();
    } catch {
      setLocalEnabled(!next);
    } finally {
      setToggling(false);
      busy.current = false;
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 1,
        px: 2,
        borderRadius: 1.5,
        opacity: localEnabled ? 1 : 0.55,
        '&:hover': { bgcolor: 'action.hover', opacity: 1 },
        transition: 'opacity 0.15s',
      }}
    >
      {toggling ? (
        <CircularProgress size={8} thickness={6} sx={{ flexShrink: 0 }} />
      ) : (
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            flexShrink: 0,
            bgcolor: !localEnabled ? 'text.disabled' : statusColor(plugin.status),
          }}
        />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography
            sx={{
              fontSize: '0.85rem',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {plugin.name}
          </Typography>
          {plugin.version && (
            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', flexShrink: 0 }}>
              {plugin.version}
            </Typography>
          )}
        </Box>
        {plugin.description && (
          <Typography
            sx={{
              fontSize: '0.75rem',
              color: 'text.secondary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {plugin.description}
          </Typography>
        )}
      </Box>
      <Chip
        label={sourceLabel(plugin.source)}
        size="small"
        sx={{
          height: 20,
          fontSize: '0.65rem',
          fontWeight: 600,
          '& .MuiChip-label': { px: 1 },
        }}
      />
      <Switch
        size="small"
        checked={localEnabled}
        onChange={handleChange}
        sx={{
          width: 32,
          height: 18,
          p: 0,
          '& .MuiSwitch-switchBase': {
            p: '3px',
            '&.Mui-checked': { transform: 'translateX(14px)' },
          },
          '& .MuiSwitch-thumb': { width: 12, height: 12 },
          '& .MuiSwitch-track': { borderRadius: 9 },
        }}
      />
    </Box>
  );
}
