import { Box, Typography, Chip } from '@mui/material';
import type { SkillInfo, SkillSource } from '../api';

const SOURCE_LABEL: Record<SkillSource, string> = {
  hub: 'hub',
  builtin: 'built-in',
  local: 'local',
  unknown: 'unknown',
};

const SOURCE_COLOR: Record<SkillSource, 'default' | 'info' | 'success' | 'warning'> = {
  builtin: 'default',
  hub: 'info',
  local: 'success',
  unknown: 'warning',
};

export default function SkillRow({ skill }: { skill: SkillInfo }) {
  const showTrust = skill.trust && skill.trust.toLowerCase() !== skill.source.toLowerCase();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 1.25,
        px: 1.5,
        borderRadius: 1.5,
        '&:hover': { bgcolor: 'action.hover' },
        transition: 'background-color 0.15s',
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          sx={{
            fontSize: '0.85rem',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flexShrink: 1,
          }}
        >
          {skill.name}
        </Typography>
        {skill.category && (
          <Typography
            sx={{
              fontSize: '0.7rem',
              color: 'text.secondary',
              flexShrink: 0,
              fontFamily: 'monospace',
            }}
          >
            {skill.category}
          </Typography>
        )}
      </Box>

      {showTrust && (
        <Chip
          label={`trust: ${skill.trust}`}
          size="small"
          variant="outlined"
          sx={{
            height: 20,
            fontSize: '0.65rem',
            '& .MuiChip-label': { px: 1 },
          }}
        />
      )}

      <Chip
        label={SOURCE_LABEL[skill.source] ?? skill.source}
        size="small"
        color={SOURCE_COLOR[skill.source]}
        variant="outlined"
        sx={{
          height: 20,
          fontSize: '0.65rem',
          fontWeight: 600,
          minWidth: 70,
          '& .MuiChip-label': { px: 1 },
        }}
      />
    </Box>
  );
}
