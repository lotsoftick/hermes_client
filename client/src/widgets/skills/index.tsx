import { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { SkillRow, useListSkillsQuery, type SkillInfo } from '../../entities/skill';

const ALL = '__all__';

function groupByCategory(skills: SkillInfo[]): Record<string, SkillInfo[]> {
  return skills.reduce<Record<string, SkillInfo[]>>((acc, s) => {
    const key = s.category || 'uncategorized';
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});
}

export default function SkillsPanel() {
  const { data: skills, isLoading } = useListSkillsQuery();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>(ALL);

  const all = useMemo(() => skills ?? [], [skills]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    all.forEach((s) => set.add(s.category || 'uncategorized'));
    return Array.from(set).sort();
  }, [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((s) => {
      if (category !== ALL && (s.category || 'uncategorized') !== category) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.source.toLowerCase().includes(q)
      );
    });
  }, [all, search, category]);

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);
  const groupKeys = Object.keys(grouped).sort();

  return (
    <Box sx={{ p: 3, maxWidth: 880, mx: 'auto', width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mb: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>
          Skills
        </Typography>
        {!isLoading && (
          <Typography variant="body2" color="text.secondary">
            {filtered.length} of {all.length}
          </Typography>
        )}
      </Box>

      <TextField
        fullWidth
        size="small"
        placeholder="Search skills..."
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

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
        <Chip
          label="all"
          size="small"
          variant={category === ALL ? 'filled' : 'outlined'}
          color={category === ALL ? 'primary' : 'default'}
          onClick={() => setCategory(ALL)}
          sx={{ height: 24, fontSize: '0.7rem' }}
        />
        {categories.map((cat) => (
          <Chip
            key={cat}
            label={cat}
            size="small"
            variant={category === cat ? 'filled' : 'outlined'}
            color={category === cat ? 'primary' : 'default'}
            onClick={() => setCategory(cat)}
            sx={{ height: 24, fontSize: '0.7rem' }}
          />
        ))}
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={24} />
        </Box>
      ) : filtered.length === 0 ? (
        <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
          {search ? 'No skills match your search' : 'No skills found'}
        </Typography>
      ) : (
        <Box>
          {groupKeys.map((cat) => (
            <Box key={cat} sx={{ mb: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  pb: 0.5,
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                  }}
                >
                  {cat}
                </Typography>
                <Typography
                  sx={{ fontSize: '0.65rem', color: 'text.disabled' }}
                >
                  · {grouped[cat].length}
                </Typography>
                <Divider sx={{ flex: 1, ml: 1 }} />
              </Box>
              {grouped[cat].map((s) => (
                <SkillRow key={s.name} skill={s} />
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
