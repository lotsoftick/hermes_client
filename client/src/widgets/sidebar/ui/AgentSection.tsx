import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Collapse,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  Add,
  ExpandMore,
  ExpandLess,
  DeleteOutline,
  TerminalOutlined,
  HelpOutline,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router';
import { useDeleteAgentMutation } from '../../../entities/agent';
import { useCreateConversationMutation, ConversationItem } from '../../../entities/conversation';
import { AgentConfigDrawer } from '../../../features/agent/setup';
import { DeleteButton, ModelIcon, resolveModelIcon } from '../../../shared/ui';

interface AgentSectionProps {
  agent: { _id: string; name: string; hermesProfile: string; model?: string | null };
  conversations: { _id: string; title: string | null; createdAt: string }[];
  searchQuery?: string;
  collapseKey?: number;
  onNavigate?: () => void;
  disabled?: boolean;
}

export default function AgentSection({
  agent,
  conversations,
  searchQuery,
  collapseKey,
  onNavigate,
  disabled,
}: AgentSectionProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const { sidebar } = theme.palette;
  const isAgentActive = location.pathname.startsWith(`/agent/${agent._id}/`);
  const [expanded, setExpanded] = useState(isAgentActive);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (collapseKey && !isAgentActive) setExpanded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseKey]);
  const [hovered, setHovered] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [createConversation] = useCreateConversationMutation();
  const [deleteAgent] = useDeleteAgentMutation();

  const isSearchActive = Boolean(searchQuery);
  const agentNameMatches = searchQuery
    ? agent.name.toLowerCase().includes(searchQuery.toLowerCase())
    : true;

  if (isSearchActive && !agentNameMatches) {
    return null;
  }

  const handleNewChat = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const result = await createConversation({ agentId: agent._id });
    if ('data' in result && result.data) {
      setExpanded(true);
      navigate(`/agent/${agent._id}/chat/${result.data._id}`);
      onNavigate?.();
    }
  };

  const handleDeleteAgent = async () => {
    await deleteAgent(agent._id);
    if (location.pathname.startsWith(`/agent/${agent._id}`)) {
      navigate('/');
    }
  };

  return (
    <>
      <ListItem
        disablePadding
        sx={{
          mb: 0.2,
          opacity: disabled ? 0.4 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <ListItemButton
          onClick={() => setExpanded(!expanded)}
          sx={{
            borderRadius: 1.5,
            py: 0.6,
            px: 1.5,
            gap: 1,
            '&:hover': { bgcolor: sidebar.hover },
          }}
        >
          {(() => {
            const resolved = resolveModelIcon(agent.model);
            const tooltip = agent.model
              ? resolved
                ? `${resolved.label} · ${agent.model}`
                : agent.model
              : 'No model configured yet — click to set one up';
            return (
              <Tooltip title={tooltip} placement="right" arrow>
                <Box
                  component="span"
                  onClick={(e) => {
                    if (!agent.model) {
                      e.stopPropagation();
                      setDrawerOpen(true);
                    }
                  }}
                  sx={{
                    width: 22,
                    height: 22,
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    color: agent.model ? sidebar.selectedText : sidebar.selectedBorder,
                    border: agent.model ? 'none' : `1px dashed ${sidebar.selectedBorder}`,
                    cursor: agent.model ? 'inherit' : 'pointer',
                    transition: 'transform 120ms ease, opacity 120ms ease',
                    opacity: agent.model ? 0.95 : 0.85,
                    '&:hover': agent.model
                      ? undefined
                      : { opacity: 1, transform: 'scale(1.05)' },
                  }}
                >
                  {resolved ? (
                    <ModelIcon model={agent.model} size={16} />
                  ) : (
                    <HelpOutline sx={{ fontSize: 14 }} />
                  )}
                </Box>
              </Tooltip>
            );
          })()}
          <ListItemText
            primary={agent.name}
            sx={{
              my: 0,
              '& .MuiListItemText-primary': {
                color: isAgentActive ? sidebar.selectedText : sidebar.text,
                fontSize: '0.82rem',
                fontWeight: isAgentActive ? 600 : 500,
                textTransform: 'capitalize',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              },
            }}
          />
          {hovered && (
            <>
              <Tooltip title="Configure profile">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDrawerOpen(true);
                  }}
                  sx={{
                    p: 0.2,
                    mr: 0.2,
                    color: sidebar.text,
                    opacity: 0.6,
                    '&:hover': { color: 'primary.main', opacity: 1 },
                  }}
                >
                  <TerminalOutlined sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
              <DeleteButton
                onConfirm={handleDeleteAgent}
                message="Delete this agent and all its conversations?"
                renderTrigger={(onClick) => (
                  <IconButton
                    size="small"
                    onClick={onClick}
                    sx={{
                      p: 0.2,
                      mr: 0.2,
                      color: sidebar.text,
                      opacity: 0.6,
                      '&:hover': { color: '#f44336', opacity: 1 },
                    }}
                  >
                    <DeleteOutline sx={{ fontSize: 14 }} />
                  </IconButton>
                )}
              />
            </>
          )}
          <IconButton
            size="small"
            onClick={handleNewChat}
            sx={{ color: sidebar.text, p: 0.3, mr: 0.3, '&:hover': { color: 'success.main' } }}
          >
            <Add sx={{ fontSize: 14 }} />
          </IconButton>
          {expanded ? (
            <ExpandLess sx={{ fontSize: 16, color: sidebar.text }} />
          ) : (
            <ExpandMore sx={{ fontSize: 16, color: sidebar.text }} />
          )}
        </ListItemButton>
      </ListItem>
      <Collapse in={isSearchActive ? true : expanded} timeout="auto" unmountOnExit>
        <List disablePadding>
          {conversations.length === 0 && !isSearchActive ? (
            <Typography
              sx={{
                pl: 5,
                py: 0.5,
                color: sidebar.text,
                fontSize: '0.7rem',
                fontStyle: 'italic',
                opacity: 0.7,
              }}
            >
              No chats yet
            </Typography>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv._id}
                agentId={agent._id}
                conversation={conv}
                onNavigate={onNavigate}
              />
            ))
          )}
        </List>
      </Collapse>
      {drawerOpen && (
        <AgentConfigDrawer
          open={drawerOpen}
          profile={agent.hermesProfile}
          agentName={agent.name}
          initialCmd="model"
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}
