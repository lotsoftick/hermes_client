import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Popover,
  Stack,
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
  MoreVert,
  PlayArrow,
  Replay,
  Stop,
  TerminalOutlined,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router';
import {
  useDeleteAgentMutation,
  useStartGatewayMutation,
  useStopGatewayMutation,
  useRestartGatewayMutation,
} from '../../../entities/agent';
import { useCreateConversationMutation, ConversationItem } from '../../../entities/conversation';
import { AgentConfigDrawer } from '../../../features/agent/setup';
import AgentSpendRing from './AgentSpendRing';

interface AgentSectionProps {
  agent: {
    _id: string;
    name: string;
    hermesProfile: string;
    model?: string | null;
    /**
     * Live hermes-gateway daemon status for this profile. Drives the
     * red/green status dot rendered before the agent name. Defaults to
     * `false` when undefined so first paint doesn't lie about uptime.
     */
    gatewayRunning?: boolean;
  };
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
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  /**
   * Element that the delete-confirm popover is anchored to. We snapshot
   * the MoreVert button from `menuAnchor` so the popover can stay open
   * after the Menu closes and the user's mouse leaves the row.
   */
  const [confirmAnchor, setConfirmAnchor] = useState<HTMLElement | null>(null);
  const menuOpen = Boolean(menuAnchor);
  const confirmOpen = Boolean(confirmAnchor);

  const [createConversation] = useCreateConversationMutation();
  const [deleteAgent, { isLoading: deleting }] = useDeleteAgentMutation();
  const [startGateway] = useStartGatewayMutation();
  const [stopGateway] = useStopGatewayMutation();
  const [restartGateway] = useRestartGatewayMutation();

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
    setConfirmAnchor(null);
    if (location.pathname.startsWith(`/agent/${agent._id}`)) {
      navigate('/');
    }
  };

  const openMenu = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
  };
  const closeMenu = () => setMenuAnchor(null);

  const runFromMenu = (fn: () => void) => () => {
    closeMenu();
    fn();
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
          <AgentSpendRing
            agentId={agent._id}
            hermesProfile={agent.hermesProfile}
            model={agent.model}
            configured={Boolean(agent.model)}
            onClickWhenUnconfigured={() => setDrawerOpen(true)}
          />
          <Tooltip
            title={agent.gatewayRunning ? 'Gateway running' : 'Gateway stopped'}
            placement="right"
          >
            <Box
              component="span"
              sx={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                flexShrink: 0,
                bgcolor: agent.gatewayRunning ? 'success.main' : 'error.main',
                opacity: agent.gatewayRunning ? 1 : 0.55,
                boxShadow: agent.gatewayRunning ? '0 0 5px rgba(76,175,80,0.55)' : 'none',
                transition: 'background-color 0.2s, opacity 0.2s, box-shadow 0.2s',
                ml: -0.25,
              }}
            />
          </Tooltip>
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
          {(hovered || menuOpen || confirmOpen) && (
            <Tooltip title="Agent actions">
              <IconButton
                size="small"
                onClick={openMenu}
                sx={{
                  p: 0.2,
                  mr: 0.2,
                  color: sidebar.text,
                  opacity: menuOpen || confirmOpen ? 1 : 0.6,
                  '&:hover': { color: 'primary.main', opacity: 1 },
                }}
              >
                <MoreVert sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
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
      <Menu
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={closeMenu}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 180,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              '& .MuiMenuItem-root': { fontSize: '0.8rem', py: 0.6 },
              '& .MuiListItemIcon-root': { minWidth: 28, color: 'inherit' },
              '& .MuiSvgIcon-root': { fontSize: 16 },
            },
          },
        }}
      >
        <MenuItem onClick={runFromMenu(() => setDrawerOpen(true))}>
          <ListItemIcon>
            <TerminalOutlined />
          </ListItemIcon>
          Configure profile
        </MenuItem>
        <Divider sx={{ my: 0.3 }} />
        <MenuItem
          disabled={agent.gatewayRunning === true}
          onClick={runFromMenu(() => {
            startGateway(agent._id);
          })}
        >
          <ListItemIcon>
            <PlayArrow sx={{ color: 'success.main' }} />
          </ListItemIcon>
          Start gateway
        </MenuItem>
        <MenuItem
          onClick={runFromMenu(() => {
            restartGateway(agent._id);
          })}
        >
          <ListItemIcon>
            <Replay />
          </ListItemIcon>
          Restart gateway
        </MenuItem>
        <MenuItem
          disabled={agent.gatewayRunning !== true}
          onClick={runFromMenu(() => {
            stopGateway(agent._id);
          })}
        >
          <ListItemIcon>
            <Stop sx={{ color: 'warning.main' }} />
          </ListItemIcon>
          Stop gateway
        </MenuItem>
        <Divider sx={{ my: 0.3 }} />
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            // Snapshot the MoreVert button as the popover anchor BEFORE
            // closing the menu — closeMenu clears `menuAnchor` itself.
            setConfirmAnchor(menuAnchor);
            closeMenu();
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'error.main' }}>
            <DeleteOutline />
          </ListItemIcon>
          Delete profile
        </MenuItem>
      </Menu>
      <Popover
        open={confirmOpen}
        anchorEl={confirmAnchor}
        onClose={() => !deleting && setConfirmAnchor(null)}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              py: 0.8,
              px: 1.5,
              ml: 1.5,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
              overflow: 'visible',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: '50%',
                left: -5,
                transform: 'translateY(-50%)',
                width: 0,
                height: 0,
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
                borderRight: '6px solid',
                borderRightColor: 'background.paper',
              },
            },
          },
        }}
      >
        <Typography variant="caption" sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
          Delete this agent and its hermes profile?
        </Typography>
        <Stack direction="row" spacing={0.5}>
          <Button
            size="small"
            onClick={() => setConfirmAnchor(null)}
            disabled={deleting}
            sx={{ minWidth: 0, px: 1, py: 0.2, fontSize: '0.7rem' }}
          >
            No
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={handleDeleteAgent}
            disabled={deleting}
            sx={{ minWidth: 0, px: 1, py: 0.2, fontSize: '0.7rem' }}
          >
            {deleting ? <CircularProgress size={12} color="inherit" /> : 'Yes'}
          </Button>
        </Stack>
      </Popover>
    </>
  );
}
