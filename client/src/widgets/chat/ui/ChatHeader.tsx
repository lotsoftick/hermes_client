import { useState } from 'react';
import { Box, TextField, IconButton, Typography, CircularProgress, Stack } from '@mui/material';
import { Edit, Check, TuneOutlined } from '@mui/icons-material';
import { useGetAgentQuery, useUpdateAgentMutation } from '../../../entities/agent';

interface ChatHeaderProps {
  agentId: string;
  conversationId: string;
  showSessionSettings: boolean;
  onToggleSessionSettings: () => void;
}

export default function ChatHeader({
  agentId,
  showSessionSettings,
  onToggleSessionSettings,
}: ChatHeaderProps) {
  const { data: agent } = useGetAgentQuery(agentId, { skip: !agentId });
  const [updateAgent, { isLoading: isUpdatingName }] = useUpdateAgentMutation();
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState('');

  if (!agent) return null;

  const handleSave = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      setEditing(false);
      return;
    }
    if (trimmed === agent.name) {
      setEditing(false);
      return;
    }
    try {
      await updateAgent({ id: agent._id, name: trimmed }).unwrap();
      setEditing(false);
    } catch {
      /* stay in edit mode; request failed */
    }
  };

  return (
    <Box
      sx={{
        px: { xs: 1.5, md: 2 },
        py: 1.5,
        pl: { xs: 7, md: 2 },
        borderBottom: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minWidth: 0,
        flexShrink: 0,
      }}
    >
      {editing ? (
        <>
          <TextField
            variant="standard"
            size="small"
            autoFocus
            disabled={isUpdatingName}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => {
              if (isUpdatingName) return;
              if (e.key === 'Enter') void handleSave();
              if (e.key === 'Escape') setEditing(false);
            }}
            slotProps={{
              input: { disableUnderline: false, sx: { fontSize: '1.15rem', fontWeight: 600 } },
            }}
            sx={{ flex: 1 }}
          />
          <IconButton
            size="small"
            onClick={() => void handleSave()}
            disabled={isUpdatingName}
            sx={{ color: 'success.main' }}
            aria-label={isUpdatingName ? 'Saving name' : 'Save name'}
          >
            {isUpdatingName ? (
              <CircularProgress size={18} thickness={5} sx={{ color: 'success.main' }} />
            ) : (
              <Check sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </>
      ) : (
        <>
          <Stack sx={{ flex: 1, minWidth: 0 }} spacing={0.25}>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.2,
              }}
            >
              {agent.name}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.7rem' }}
            >
              hermes profile: {agent.hermesProfile}
            </Typography>
          </Stack>
          <IconButton
            size="small"
            onClick={onToggleSessionSettings}
            aria-label="Session settings"
            sx={{ opacity: showSessionSettings ? 1 : 0.4, '&:hover': { opacity: 1 } }}
          >
            <TuneOutlined sx={{ fontSize: 18 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
              setNameValue(agent.name);
              setEditing(true);
            }}
            sx={{ opacity: 0.4, '&:hover': { opacity: 1 } }}
          >
            <Edit sx={{ fontSize: 16 }} />
          </IconButton>
        </>
      )}
    </Box>
  );
}
