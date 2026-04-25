import { useMemo, useState } from 'react';
import { Box, CircularProgress, InputAdornment, TextField, Typography } from '@mui/material';
import { Search } from '@mui/icons-material';
import { PluginRow, useListPluginsQuery } from '../../entities/plugin';

export default function PluginsPanel() {
  const { data: plugins, isLoading } = useListPluginsQuery();
  const [search, setSearch] = useState('');

  const all = useMemo(() => plugins ?? [], [plugins]);
  const filtered = useMemo(() => {
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    );
  }, [all, search]);

  const enabledCount = useMemo(() => all.filter((p) => p.enabled).length, [all]);

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto', width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>
          Plugins
        </Typography>
        {!isLoading && (
          <Typography variant="body2" color="text.secondary">
            {enabledCount} of {all.length} enabled
          </Typography>
        )}
      </Box>

      <TextField
        fullWidth
        size="small"
        placeholder="Search plugins..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 18, color: 'text.secondary' }} />
              </InputAdornment>
            ),
          },
        }}
        sx={{
          mb: 2,
          '& .MuiOutlinedInput-root': {
            borderRadius: 1.5,
            '& input': { fontSize: '0.85rem', py: 1 },
          },
        }}
      />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box>
          {filtered.map((p) => (
            <PluginRow key={p.name} plugin={p} />
          ))}
          {filtered.length === 0 && (
            <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
              {search ? 'No plugins match your search' : 'No plugins found'}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
