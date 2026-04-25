import { Box, Typography, IconButton, Chip } from '@mui/material';
import { Edit, Delete } from '@mui/icons-material';
import type { User } from '../api';

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 86400000) return 'today';
  if (diff < 172800000) return 'yesterday';
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface UserRowProps {
  user: User;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function UserRow({ user, onEdit, onDelete }: UserRowProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 1,
        px: 2,
        borderRadius: 1.5,
        '&:hover': { bgcolor: 'action.hover' },
        transition: 'background 0.15s',
      }}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          flexShrink: 0,
          bgcolor: user.active ? 'success.main' : 'error.main',
        }}
      />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: '0.85rem',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {user.name} {user.lastName}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.75rem',
            color: 'text.secondary',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {user.email}
          {user.phone && ` · ${user.phone}`}
          {` · joined ${relativeDate(user.createdAt)}`}
        </Typography>
      </Box>

      {!user.active && (
        <Chip
          label="inactive"
          size="small"
          color="error"
          variant="outlined"
          sx={{
            height: 20,
            fontSize: '0.65rem',
            fontWeight: 600,
            '& .MuiChip-label': { px: 1 },
          }}
        />
      )}

      <IconButton
        size="small"
        onClick={() => onEdit(String(user._id))}
        sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
      >
        <Edit sx={{ fontSize: 16 }} />
      </IconButton>

      <IconButton
        size="small"
        onClick={() => onDelete(String(user._id))}
        sx={{ opacity: 0.5, '&:hover': { opacity: 1, color: 'error.main' } }}
      >
        <Delete sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  );
}
