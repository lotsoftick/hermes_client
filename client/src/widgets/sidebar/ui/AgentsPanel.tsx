import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, List, Typography, useTheme } from '@mui/material';
import { Add, KeyboardDoubleArrowUp, SwapVert } from '@mui/icons-material';
import { useGetAgentsQuery, useSyncAgentsMutation } from '../../../entities/agent';
import { useGetAllConversationsQuery } from '../../../entities/conversation';
import { CreateAgentForm } from '../../../features/agent/create';
import { AgentConfigDrawer } from '../../../features/agent/setup';
import AgentSection from './AgentSection';
import SyncProgressBar from './SyncProgressBar';

interface AgentsPanelProps {
  searchQuery: string;
  onNavigate?: () => void;
}

export default function AgentsPanel({ searchQuery, onNavigate }: AgentsPanelProps) {
  const { sidebar } = useTheme().palette;

  const [showNewAgent, setShowNewAgent] = useState(false);
  const [configureTarget, setConfigureTarget] = useState<{
    profile: string;
    name: string;
  } | null>(null);
  const [collapseKey, setCollapseKey] = useState(0);
  const [sortAlpha, setSortAlpha] = useState(false);
  const [deletingAgentId] = useState<string | null>(null);

  // Poll so the per-agent gateway status dot reflects the live daemon
  // state (auto-started on create, restarted via the config drawer,
  // killed externally, …). Backend caches `gateway status` per profile
  // for ~15s, so 15s polling roughly aligns with cache expiry.
  const { data: agentsData, isLoading: agentsLoading } = useGetAgentsQuery(undefined, {
    pollingInterval: 15000,
  });
  // Poll so sessions started in a standalone `hermes` REPL show up in
  // the sidebar without a manual refresh. The backend list endpoint
  // discovers new session JSON files on disk on each request.
  const { data: convData } = useGetAllConversationsQuery(undefined, {
    pollingInterval: 5000,
    refetchOnMountOrArgChange: true,
  });
  const [syncAgents, { isLoading: isSyncing }] = useSyncAgentsMutation();

  const [syncDone, setSyncDone] = useState(false);
  const syncDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncCalled = useRef(false);

  const allConversations = convData?.items ?? [];
  const agents = sortAlpha
    ? [...(agentsData?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    : (agentsData?.items ?? []);

  useEffect(() => {
    if (syncCalled.current) return;
    if (agentsLoading || !agentsData) return;
    syncCalled.current = true;
    syncAgents().then(() => {
      setSyncDone(true);
      syncDoneTimer.current = setTimeout(() => setSyncDone(false), 2500);
    });
    return () => {
      if (syncDoneTimer.current) clearTimeout(syncDoneTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentsLoading]);

  return (
    <Box
      sx={{
        px: 2,
        mt: 3,
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1,
          flexShrink: 0,
        }}
      >
        <Typography
          sx={{
            color: sidebar.text,
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
          }}
        >
          Agents
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {isSyncing && <CircularProgress size={11} sx={{ color: sidebar.text, opacity: 0.6 }} />}
          {!isSyncing && syncDone && (
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: 'success.main',
                opacity: 1,
                animation: 'fadeOut 2.5s ease-in forwards',
                '@keyframes fadeOut': {
                  '0%': { opacity: 1 },
                  '60%': { opacity: 1 },
                  '100%': { opacity: 0 },
                },
              }}
            />
          )}
          <IconButton
            size="small"
            onClick={() => setSortAlpha((v) => !v)}
            title={sortAlpha ? 'Unsort' : 'Sort A–Z'}
            sx={{
              color: sortAlpha ? 'primary.main' : sidebar.text,
              p: 0.3,
              '&:hover': { color: 'primary.main' },
            }}
          >
            <SwapVert sx={{ fontSize: 15 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => setCollapseKey((k) => k + 1)}
            title="Collapse all"
            sx={{ color: sidebar.text, p: 0.3, '&:hover': { color: sidebar.selectedText } }}
          >
            <KeyboardDoubleArrowUp sx={{ fontSize: 15 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => setShowNewAgent((prev) => !prev)}
            sx={{ color: sidebar.text, p: 0.3, '&:hover': { color: 'success.main' } }}
          >
            <Add sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </Box>

      {isSyncing && <SyncProgressBar />}

      {showNewAgent && (
        <CreateAgentForm
          onCreated={({ profile, name }) => {
            setShowNewAgent(false);
            setConfigureTarget({ profile, name });
          }}
          onCancel={() => setShowNewAgent(false)}
        />
      )}

      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: sidebar.border,
            borderRadius: 2,
            '&:hover': { bgcolor: sidebar.text },
          },
        }}
      >
        {agentsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={18} sx={{ color: sidebar.text }} />
          </Box>
        ) : (
          <List disablePadding>
            {agents.map((agent) => (
              <AgentSection
                key={agent._id}
                agent={{
                  _id: agent._id,
                  name: agent.name,
                  hermesProfile: agent.hermesProfile,
                  model: agent.model ?? null,
                  gatewayRunning: agent.gatewayRunning,
                }}
                conversations={allConversations.filter((c) => c.agentId === agent._id)}
                searchQuery={searchQuery || undefined}
                collapseKey={collapseKey}
                onNavigate={onNavigate}
                disabled={deletingAgentId === agent._id}
              />
            ))}
          </List>
        )}
      </Box>

      {configureTarget && (
        <AgentConfigDrawer
          open
          profile={configureTarget.profile}
          agentName={configureTarget.name}
          initialCmd="model"
          onClose={() => setConfigureTarget(null)}
        />
      )}
    </Box>
  );
}
