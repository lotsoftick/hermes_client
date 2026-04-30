import { useEffect, useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Box,
  IconButton,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { ArrowBackOutlined, BarChartOutlined } from '@mui/icons-material';
import { useGetAgentQuery } from '../../entities/agent';
import InsightsPanel from '../../widgets/insights';
import { SpendCapsCard } from '../../widgets/spendCaps';

const TABS = [
  { id: 'usage', label: 'Usage', icon: <BarChartOutlined sx={{ fontSize: 18 }} /> },
] as const;

type TabId = (typeof TABS)[number]['id'];

function isTabId(value: string | undefined): value is TabId {
  return value === 'usage';
}

export default function AgentSettingsPage() {
  const navigate = useNavigate();
  const { agentId, tab } = useParams<{ agentId: string; tab?: string }>();
  const { data: agent, isLoading, isError } = useGetAgentQuery(agentId ?? '', {
    skip: !agentId,
  });

  const activeTab: TabId = useMemo(() => (isTabId(tab) ? tab : 'usage'), [tab]);

  // Normalise the URL — `/agent/:id/settings` should land on the
  // default tab in a single redirect so refresh / direct-link both
  // hit a stable route.
  useEffect(() => {
    if (!agentId) return;
    if (tab === undefined) {
      navigate(`/agent/${agentId}/settings/usage`, { replace: true });
    } else if (!isTabId(tab)) {
      navigate(`/agent/${agentId}/settings/usage`, { replace: true });
    }
  }, [agentId, tab, navigate]);

  if (!agentId) return <Navigate to="/" replace />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <Box
        sx={{
          px: { xs: 1.5, md: 3 },
          py: 1.5,
          pl: { xs: 7, md: 3 },
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        <IconButton size="small" onClick={() => navigate(-1)} aria-label="Go back">
          <ArrowBackOutlined fontSize="small" />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {isLoading || !agent ? (
            <Skeleton width={180} height={28} />
          ) : (
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                lineHeight: 1.2,
                textTransform: 'capitalize',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {agent.name}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Settings · token usage and cost across this agent
          </Typography>
        </Box>
      </Box>

      {/* Tab bar */}
      <Box
        sx={{
          px: { xs: 1.5, md: 3 },
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_, v: TabId) => navigate(`/agent/${agentId}/settings/${v}`)}
          variant="scrollable"
          scrollButtons={false}
          sx={{ minHeight: 40 }}
        >
          {TABS.map((t) => (
            <Tab
              key={t.id}
              value={t.id}
              icon={t.icon}
              iconPosition="start"
              label={t.label}
              sx={{ minHeight: 40, textTransform: 'none', fontSize: '0.85rem' }}
            />
          ))}
        </Tabs>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: { xs: 1.5, md: 3 }, py: 2.5 }}>
        {isError ? (
          <Alert severity="error">Couldn't load this agent.</Alert>
        ) : agent ? (
          activeTab === 'usage' ? (
            <Stack spacing={3} sx={{ maxWidth: 1100, mx: 'auto' }}>
              <SpendCapsCard agentId={agent._id} />
              <InsightsPanel agentId={agent._id} hideHeader />
            </Stack>
          ) : null
        ) : (
          <Stack spacing={2} sx={{ maxWidth: 900, mx: 'auto' }}>
            <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
            <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
          </Stack>
        )}
      </Box>
    </Box>
  );
}
