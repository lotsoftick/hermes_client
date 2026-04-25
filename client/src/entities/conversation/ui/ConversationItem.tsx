import { useState } from 'react';
import {
  Box,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  IconButton,
  useTheme,
} from '@mui/material';
import { ChatBubbleOutline, DeleteOutline, Edit, Check } from '@mui/icons-material';
import { Link, useLocation, useNavigate } from 'react-router';
import { DeleteButton } from '../../../shared/ui';
import { useUpdateConversationMutation, useDeleteConversationMutation } from '../api';

interface ConversationItemProps {
  agentId: string;
  conversation: { _id: string; title: string | null; createdAt: string };
  onNavigate?: () => void;
}

export default function ConversationItem({
  agentId,
  conversation,
  onNavigate,
}: ConversationItemProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const { sidebar } = theme.palette;
  const isActive = location.pathname === `/agent/${agentId}/chat/${conversation._id}`;
  const title = conversation.title || 'New chat';
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [updateConversation] = useUpdateConversationMutation();
  const [deleteConversation] = useDeleteConversationMutation();

  const handleDelete = async () => {
    await deleteConversation({ id: conversation._id, agentId });
    if (isActive) navigate('/');
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditValue(title);
    setEditing(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) {
      updateConversation({ id: conversation._id, agentId, title: trimmed });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <ListItem disablePadding sx={{ mb: 0.2, px: 1.5, pl: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 0.3 }}>
          <TextField
            variant="standard"
            size="small"
            autoFocus
            fullWidth
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={handleSaveEdit}
            slotProps={{
              input: {
                disableUnderline: false,
                sx: { fontSize: '0.75rem', color: sidebar.selectedText, py: 0.3 },
              },
            }}
            sx={{ '& .MuiInput-underline:after': { borderColor: sidebar.selectedBorder } }}
          />
          <IconButton size="small" onClick={handleSaveEdit} sx={{ p: 0.2, color: 'success.main' }}>
            <Check sx={{ fontSize: 12 }} />
          </IconButton>
        </Box>
      </ListItem>
    );
  }

  return (
    <ListItem
      disablePadding
      sx={{ mb: 0.2 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <ListItemButton
        component={Link}
        to={`/agent/${agentId}/chat/${conversation._id}`}
        selected={isActive}
        onClick={onNavigate}
        sx={{
          borderRadius: 1.5,
          py: 0.5,
          px: 1.5,
          pl: 4,
          textDecoration: 'none',
          '&:hover': { bgcolor: sidebar.hover },
          '&.Mui-selected': {
            bgcolor: sidebar.hover,
            '&:hover': { bgcolor: sidebar.hover },
          },
        }}
      >
        <ListItemIcon
          sx={{ minWidth: 20, color: isActive ? sidebar.selectedBorder : sidebar.text }}
        >
          <ChatBubbleOutline sx={{ fontSize: 13 }} />
        </ListItemIcon>
        <ListItemText
          primary={title}
          sx={{
            '& .MuiListItemText-primary': {
              color: isActive ? sidebar.selectedText : sidebar.text,
              fontSize: '0.75rem',
              fontWeight: isActive ? 600 : 400,
              textTransform: 'capitalize',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          }}
        />
        {(hovered || isActive) && (
          <>
            <IconButton
              size="small"
              onClick={handleStartEdit}
              sx={{ p: 0.2, color: sidebar.text, opacity: 0.6, '&:hover': { opacity: 1 } }}
            >
              <Edit sx={{ fontSize: 12 }} />
            </IconButton>
            <DeleteButton
              onConfirm={handleDelete}
              message="Delete this conversation?"
              renderTrigger={(onClick) => (
                <IconButton
                  size="small"
                  onClick={onClick}
                  sx={{
                    p: 0.2,
                    color: sidebar.text,
                    opacity: 0.6,
                    '&:hover': { color: '#f44336', opacity: 1 },
                  }}
                >
                  <DeleteOutline sx={{ fontSize: 13 }} />
                </IconButton>
              )}
            />
          </>
        )}
      </ListItemButton>
    </ListItem>
  );
}
