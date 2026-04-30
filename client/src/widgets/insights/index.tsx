import { memo, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { OpenInNew, AttachMoney, BoltOutlined, ChatBubbleOutline, Build } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router';
import {
  useGetInsightsQuery,
  type InsightsResponse,
  type DailyBucket,
  type TopSession,
} from '../../entities/insights';
import { ModelIcon, resolveModelIcon } from '../../shared/ui';

/* -------------------------------------------------------------------------- */
/* Formatting helpers                                                          */
/* -------------------------------------------------------------------------- */

const numberFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const compactFmt = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function formatCost(usd: number | null | undefined): string {
  if (usd == null) return '—';
  if (usd === 0) return '$0';
  if (usd < 0.01) return '< $0.01';
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return '—';
  return n >= 10_000 ? compactFmt.format(n) : numberFmt.format(n);
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/* -------------------------------------------------------------------------- */
/* Summary cards                                                               */
/* -------------------------------------------------------------------------- */

interface MetricCardProps {
  label: string;
  primary: string;
  secondary?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'cost';
}

const MetricCard = memo(function MetricCard({
  label,
  primary,
  secondary,
  icon,
  tone = 'default',
}: MetricCardProps) {
  const theme = useTheme();
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        flex: '1 1 200px',
        minWidth: 0,
        borderRadius: 2,
        bgcolor:
          tone === 'cost'
            ? theme.palette.mode === 'dark'
              ? 'rgba(76,175,80,0.07)'
              : 'rgba(76,175,80,0.05)'
            : 'background.paper',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
        {icon ? (
          <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>
            {icon}
          </Box>
        ) : null}
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
      </Stack>
      <Typography
        variant="h5"
        sx={{ fontWeight: 600, lineHeight: 1.2, wordBreak: 'break-word' }}
      >
        {primary}
      </Typography>
      {secondary ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {secondary}
        </Typography>
      ) : null}
    </Paper>
  );
});

/* -------------------------------------------------------------------------- */
/* Hand-rolled SVG bar chart                                                   */
/* -------------------------------------------------------------------------- */

interface DailyChartProps {
  daily: DailyBucket[];
  /** Which metric to chart on the y-axis. */
  metric: 'cost' | 'tokens';
}

const DailyChart = memo(function DailyChart({ daily, metric }: DailyChartProps) {
  const theme = useTheme();
  const max = useMemo(
    () =>
      Math.max(
        0,
        ...daily.map((d) => (metric === 'cost' ? d.costUsd : d.totalTokens))
      ),
    [daily, metric]
  );

  const allZero = max === 0;
  // Reserve a baseline so even a "zero day" gets a visible 1-pixel bar
  // — otherwise the chart looks empty after `metric` is switched to a
  // dimension with no data yet (very common during the first week of
  // a new install).
  const chartHeight = 140;
  const barGap = 2;

  return (
    <Box sx={{ position: 'relative' }}>
      <Stack
        direction="row"
        alignItems="flex-end"
        sx={{
          height: chartHeight,
          gap: `${barGap}px`,
          px: 0.5,
        }}
      >
        {daily.map((d) => {
          const value = metric === 'cost' ? d.costUsd : d.totalTokens;
          const ratio = allZero ? 0 : value / max;
          const barHeight = allZero ? 1 : Math.max(1, Math.round(ratio * chartHeight));
          const tooltipMain =
            metric === 'cost'
              ? `${formatCost(value)} · ${formatTokens(d.totalTokens)} tokens`
              : `${formatTokens(d.totalTokens)} tokens · ${formatCost(d.costUsd)}`;
          return (
            <Tooltip
              key={d.date}
              title={
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {formatDateLabel(d.date)}
                  </Typography>
                  <br />
                  {tooltipMain}
                  <br />
                  {d.sessions} session{d.sessions === 1 ? '' : 's'}
                </Box>
              }
              arrow
            >
              <Box
                sx={{
                  flex: 1,
                  minWidth: 4,
                  height: `${barHeight}px`,
                  bgcolor: value > 0 ? 'primary.main' : theme.palette.action.disabledBackground,
                  borderRadius: '2px 2px 0 0',
                  cursor: 'default',
                  transition: 'background-color 120ms',
                  '&:hover': {
                    bgcolor: value > 0 ? 'primary.dark' : theme.palette.action.disabled,
                  },
                }}
              />
            </Tooltip>
          );
        })}
      </Stack>
      {/* X-axis labels: show first, middle and last day so we don't crowd the row. */}
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5, px: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {daily.length ? formatDateLabel(daily[0].date) : ''}
        </Typography>
        {daily.length > 2 ? (
          <Typography variant="caption" color="text.secondary">
            {formatDateLabel(daily[Math.floor(daily.length / 2)].date)}
          </Typography>
        ) : null}
        <Typography variant="caption" color="text.secondary">
          {daily.length ? formatDateLabel(daily[daily.length - 1].date) : ''}
        </Typography>
      </Stack>
      {allZero ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            fontStyle: 'italic',
          }}
        >
          No {metric === 'cost' ? 'spend' : 'token activity'} in this window
        </Typography>
      ) : null}
    </Box>
  );
});

/* -------------------------------------------------------------------------- */
/* Top sessions list                                                           */
/* -------------------------------------------------------------------------- */

interface TopSessionRowProps {
  session: TopSession;
}

const TopSessionRow = memo(function TopSessionRow({ session }: TopSessionRowProps) {
  const linkable =
    session.conversationId != null && session.conversationAgentId != null;
  const target = linkable
    ? `/agent/${session.conversationAgentId}/chat/${session.conversationId}`
    : null;
  const titleText = session.title || session.hermesSessionId;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        opacity: linkable ? 1 : 0.95,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.25 }}>
          {session.model ? (
            resolveModelIcon(session.model) ? (
              <ModelIcon model={session.model} size={14} />
            ) : null
          ) : null}
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {titleText}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
          <Chip
            label={session.profile}
            size="small"
            sx={{ height: 18, fontSize: '0.65rem' }}
          />
          <Chip
            label={session.source}
            size="small"
            variant="outlined"
            sx={{ height: 18, fontSize: '0.65rem' }}
          />
          <Typography variant="caption" color="text.secondary">
            {formatDateTime(session.startedAtMs)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            · {session.messageCount} msg{session.messageCount === 1 ? '' : 's'}
          </Typography>
          {session.toolCallCount > 0 ? (
            <Typography variant="caption" color="text.secondary">
              · {session.toolCallCount} tool call{session.toolCallCount === 1 ? '' : 's'}
            </Typography>
          ) : null}
        </Stack>
      </Box>
      <Stack alignItems="flex-end" sx={{ minWidth: 90 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {formatCost(session.costUsd)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatTokens(session.totalTokens)} tok
        </Typography>
        {session.costStatus && session.costStatus !== 'final' ? (
          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            ({session.costStatus})
          </Typography>
        ) : null}
      </Stack>
      {target ? (
        <Tooltip title="Open conversation">
          <RouterLink to={target} style={{ display: 'flex', alignItems: 'center' }}>
            <OpenInNew fontSize="small" sx={{ color: 'text.secondary' }} />
          </RouterLink>
        </Tooltip>
      ) : (
        <Tooltip title="Started outside the client (CLI / cron / gateway) — no in-app link">
          <Box sx={{ display: 'flex', alignItems: 'center', opacity: 0.3 }}>
            <OpenInNew fontSize="small" />
          </Box>
        </Tooltip>
      )}
    </Paper>
  );
});

/* -------------------------------------------------------------------------- */
/* Main panel                                                                  */
/* -------------------------------------------------------------------------- */

export interface InsightsPanelProps {
  /**
   * When set, scope every query and breakdown to a single Hermes
   * profile. The cross-profile table is hidden in that mode. Ignored
   * when `agentId` is also set (agent scope wins).
   */
  profile?: string | null;
  /**
   * When set, scope to a specific agent. The server resolves this
   * to its `hermesProfile` and additionally returns the agent's
   * spend caps. Use this for the agent settings page.
   */
  agentId?: string | number | null;
  /**
   * Hide the panel header (title + window picker). Useful when the
   * page already has its own framing chrome above the panel.
   */
  hideHeader?: boolean;
}

const WINDOW_OPTIONS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 365, label: '1y' },
] as const;

export default function InsightsPanel({
  profile = null,
  agentId = null,
  hideHeader = false,
}: InsightsPanelProps) {
  const [days, setDays] = useState(30);
  const [chartMetric, setChartMetric] = useState<'cost' | 'tokens'>('cost');

  // Agent scope takes precedence over profile scope: the server
  // resolves the agent → profile mapping, so passing both at once
  // would be redundant.
  const scopedToAgent = agentId != null && agentId !== '';

  const { data, isLoading, isFetching, error } = useGetInsightsQuery(
    {
      days,
      profile: scopedToAgent ? null : profile,
      agentId: scopedToAgent ? agentId : null,
      topN: 10,
    },
    { refetchOnMountOrArgChange: true }
  );

  const summary = data?.summary;
  const isScoped = scopedToAgent || Boolean(profile);

  return (
    <Stack spacing={2.5} sx={{ minWidth: 0 }}>
      {/* Header: window selector + scope chip + refetch indicator */}
      {hideHeader ? (
        <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={days}
            onChange={(_, v) => {
              if (v != null) setDays(v);
            }}
          >
            {WINDOW_OPTIONS.map((opt) => (
              <ToggleButton key={opt.value} value={opt.value} sx={{ px: 1.25, py: 0.25 }}>
                {opt.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {isFetching && !isLoading ? (
            <CircularProgress size={16} sx={{ ml: 0.5 }} />
          ) : null}
        </Stack>
      ) : (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={1.5}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Usage & spending
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {data?.profile
                ? `Profile · ${data.profile}`
                : profile
                  ? `Profile · ${profile}`
                  : 'All Hermes profiles, including default'}
            </Typography>
          </Box>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={days}
            onChange={(_, v) => {
              if (v != null) setDays(v);
            }}
          >
            {WINDOW_OPTIONS.map((opt) => (
              <ToggleButton key={opt.value} value={opt.value} sx={{ px: 1.25, py: 0.25 }}>
                {opt.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {isFetching && !isLoading ? (
            <CircularProgress size={16} sx={{ ml: 0.5 }} />
          ) : null}
        </Stack>
      )}

      {/* Error state */}
      {error ? (
        <Alert severity="error">
          Couldn’t load insights. The Hermes <code>state.db</code> may be locked or in an
          unexpected schema. Try again in a moment.
        </Alert>
      ) : null}

      {/* Partial-data warning (some profile's state.db missing) */}
      {data?.partial && data.byProfile.some((p) => !p.hasData) ? (
        <Alert severity="info" variant="outlined">
          Some profiles haven’t logged any sessions yet, so their numbers are zero. Run{' '}
          <code>hermes -p &lt;profile&gt; chat</code> at least once to materialise their
          analytics database.
        </Alert>
      ) : null}

      {/* Summary cards */}
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        {isLoading || !summary ? (
          <>
            {[0, 1, 2, 3].map((k) => (
              <Skeleton
                key={k}
                variant="rectangular"
                width={200}
                height={96}
                sx={{ borderRadius: 2, flex: '1 1 200px' }}
              />
            ))}
          </>
        ) : (
          <>
            <MetricCard
              label="Spend"
              primary={formatCost(summary.costUsd)}
              secondary={
                summary.actualCostUsd > 0
                  ? `${formatCost(summary.actualCostUsd)} settled · ${formatCost(summary.estimatedCostUsd)} estimated`
                  : summary.estimatedCostUsd > 0
                    ? `${formatCost(summary.estimatedCostUsd)} estimated (no final invoice)`
                    : 'No billable usage yet'
              }
              icon={<AttachMoney fontSize="small" />}
              tone="cost"
            />
            <MetricCard
              label="Total tokens"
              primary={formatTokens(summary.totalTokens)}
              secondary={`${formatTokens(summary.inputTokens)} in · ${formatTokens(summary.outputTokens)} out${summary.cacheWriteTokens > 0 ? ` · ${formatTokens(summary.cacheWriteTokens)} cache write` : ''}`}
              icon={<BoltOutlined fontSize="small" />}
            />
            <MetricCard
              label="Sessions"
              primary={numberFmt.format(summary.sessions)}
              secondary={`${numberFmt.format(summary.messages)} message${summary.messages === 1 ? '' : 's'} total`}
              icon={<ChatBubbleOutline fontSize="small" />}
            />
            <MetricCard
              label="Tool calls"
              primary={numberFmt.format(summary.toolCalls)}
              secondary={`${numberFmt.format(summary.apiCalls)} API call${summary.apiCalls === 1 ? '' : 's'}`}
              icon={<Build fontSize="small" />}
            />
          </>
        )}
      </Stack>

      {/* Daily chart */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>
            Daily activity
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={chartMetric}
            onChange={(_, v) => {
              if (v != null) setChartMetric(v);
            }}
          >
            <ToggleButton value="cost" sx={{ px: 1.25, py: 0.25 }}>
              Cost
            </ToggleButton>
            <ToggleButton value="tokens" sx={{ px: 1.25, py: 0.25 }}>
              Tokens
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        {isLoading || !data ? (
          <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 1 }} />
        ) : (
          <DailyChart daily={data.daily} metric={chartMetric} />
        )}
      </Paper>

      {/* Per-profile (only when not scoped) */}
      {!isScoped && data && data.byProfile.length > 1 ? (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ p: 2, pb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              By profile
            </Typography>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Profile</TableCell>
                <TableCell align="right">Sessions</TableCell>
                <TableCell align="right">Messages</TableCell>
                <TableCell align="right">Tokens</TableCell>
                <TableCell align="right">Spend</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.byProfile.map((p) => (
                <TableRow key={p.profile} sx={{ opacity: p.hasData ? 1 : 0.55 }}>
                  <TableCell>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Typography variant="body2">{p.profile}</Typography>
                      {!p.hasData ? (
                        <Chip label="no data" size="small" sx={{ height: 16, fontSize: '0.6rem' }} />
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{numberFmt.format(p.sessions)}</TableCell>
                  <TableCell align="right">{numberFmt.format(p.messages)}</TableCell>
                  <TableCell align="right">{formatTokens(p.totalTokens)}</TableCell>
                  <TableCell align="right">{formatCost(p.costUsd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}

      {/* Per-model */}
      {data && data.byModel.length > 0 ? (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ p: 2, pb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              By model
            </Typography>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Model</TableCell>
                <TableCell align="right">Sessions</TableCell>
                <TableCell align="right">In</TableCell>
                <TableCell align="right">Out</TableCell>
                <TableCell align="right">Tokens</TableCell>
                <TableCell align="right">Spend</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.byModel.map((m) => (
                <TableRow key={m.model}>
                  <TableCell>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      {resolveModelIcon(m.model) ? (
                        <ModelIcon model={m.model} size={14} />
                      ) : null}
                      <Typography variant="body2" sx={{ minWidth: 0, wordBreak: 'break-all' }}>
                        {m.model}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{numberFmt.format(m.sessions)}</TableCell>
                  <TableCell align="right">{formatTokens(m.inputTokens)}</TableCell>
                  <TableCell align="right">{formatTokens(m.outputTokens)}</TableCell>
                  <TableCell align="right">{formatTokens(m.totalTokens)}</TableCell>
                  <TableCell align="right">{formatCost(m.costUsd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}

      {/* Per-source */}
      {data && data.bySource.length > 1 ? (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ p: 2, pb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              By platform
            </Typography>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Source</TableCell>
                <TableCell align="right">Sessions</TableCell>
                <TableCell align="right">Messages</TableCell>
                <TableCell align="right">Tokens</TableCell>
                <TableCell align="right">Spend</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.bySource.map((s) => (
                <TableRow key={s.source}>
                  <TableCell>
                    <Chip
                      label={s.source}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell align="right">{numberFmt.format(s.sessions)}</TableCell>
                  <TableCell align="right">{numberFmt.format(s.messages)}</TableCell>
                  <TableCell align="right">{formatTokens(s.totalTokens)}</TableCell>
                  <TableCell align="right">{formatCost(s.costUsd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}

      {/* Top sessions */}
      {data && data.topSessions.length > 0 ? (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Top sessions
          </Typography>
          <Stack spacing={1}>
            {data.topSessions.map((s) => (
              <TopSessionRow
                key={`${s.profile}:${s.hermesSessionId}`}
                session={s}
              />
            ))}
          </Stack>
        </Box>
      ) : null}

      {/* Empty state */}
      {!isLoading && data && data.summary.sessions === 0 ? (
        <EmptyState />
      ) : null}

      {/* Footer: schema version + window dates */}
      {data ? <FooterMeta data={data} /> : null}
    </Stack>
  );
}

const EmptyState = memo(function EmptyState() {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 4,
        textAlign: 'center',
        borderRadius: 2,
        borderStyle: 'dashed',
      }}
    >
      <Typography variant="body2" color="text.secondary">
        No sessions in this window yet. Start a chat — usage and spending will be
        attributed automatically.
      </Typography>
    </Paper>
  );
});

const FooterMeta = memo(function FooterMeta({ data }: { data: InsightsResponse }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
      Window {new Date(data.fromIso).toLocaleDateString()} →{' '}
      {new Date(data.toIso).toLocaleDateString()} · Hermes schema v{data.schemaVersion ?? '?'} ·
      Source: <code>state.db</code>
    </Typography>
  );
});
