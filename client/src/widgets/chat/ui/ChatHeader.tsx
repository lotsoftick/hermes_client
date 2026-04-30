import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
  Stack,
  Tooltip,
} from '@mui/material';
import { Edit, Check, TuneOutlined, SettingsOutlined } from '@mui/icons-material';
import { useGetAgentQuery, useUpdateAgentMutation } from '../../../entities/agent';
import AgentSpendRing from '../../sidebar/ui/AgentSpendRing';

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
  const navigate = useNavigate();
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
          {/* Spend ring + agent name. Clicking the ring opens settings,
              giving users a fast bridge from "I see I've spent a lot"
              to "let me adjust the cap" without scanning the icons. */}
          <Box
            onClick={() => navigate(`/agent/${agent._id}/settings/usage`)}
            sx={{
              display: 'inline-flex',
              cursor: 'pointer',
              borderRadius: '50%',
              transition: 'transform 120ms ease',
              '&:hover': { transform: 'scale(1.05)' },
            }}
          >
            <AgentSpendRing
              agentId={agent._id}
              hermesProfile={agent.hermesProfile}
              model={agent.model}
              size={36}
              display="percentage"
            />
          </Box>
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
          <Tooltip title="Session settings">
            <IconButton
              size="small"
              onClick={onToggleSessionSettings}
              aria-label="Session settings"
              sx={{ opacity: showSessionSettings ? 1 : 0.4, '&:hover': { opacity: 1 } }}
            >
              <TuneOutlined sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Agent settings">
            <IconButton
              size="small"
              onClick={() => navigate(`/agent/${agent._id}/settings/usage`)}
              aria-label="Agent settings"
              sx={{ opacity: 0.4, '&:hover': { opacity: 1 } }}
            >
              <SettingsOutlined sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Rename agent">
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
          </Tooltip>
        </>
      )}
    </Box>
  );
}
