import { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Delete,
  Error as ErrorIcon,
  ExpandLess,
  ExpandMore,
  History,
} from '@mui/icons-material';
import { useListCronRunsQuery, useToggleCronJobMutation, type CronJob, type CronRun } from '../api';

function formatMs(ms: number): string {
  if (ms >= 86400000) return `${Math.round(ms / 86400000)}d`;
  if (ms >= 3600000) return `${Math.round(ms / 3600000)}h`;
  if (ms >= 60000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

function scheduleLabel(job: CronJob): string {
  const { schedule } = job;
  if (schedule.kind === 'cron' && schedule.cron) return schedule.cron;
  if (schedule.kind === 'every') {
    const interval = schedule.everyMs ? formatMs(schedule.everyMs) : schedule.every;
    return interval ? `every ${interval}` : 'every';
  }
  if (schedule.kind === 'at' && schedule.at) {
    const d = new Date(schedule.at);
    return `once @ ${d.toLocaleString()}`;
  }
  return schedule.display || schedule.kind;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

interface CronRowProps {
  job: CronJob;
  onRemove: (id: string) => void;
}

interface RunsPanelProps {
  jobId: string;
  profile: string;
  open: boolean;
}

/**
 * Lazy-load runs only when the user expands the row. Cron sessions can
 * accumulate fast (one file per tick), so we cap at 25 most-recent and
 * poll at a relaxed cadence — this is browseable history, not a live
 * feed.
 */
function RunsPanel({ jobId, profile, open }: RunsPanelProps) {
  const { data, isLoading, isError, refetch } = useListCronRunsQuery(
    { id: jobId, profile, limit: 25 },
    { skip: !open, pollingInterval: open ? 30000 : 0, refetchOnMountOrArgChange: true }
  );
  const runs = data?.runs ?? [];

  if (!open) return null;

  if (isLoading) {
    return (
      <Box sx={{ py: 2, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={16} />
      </Box>
    );
  }

  if (isError) {
    return (
      <Alert severity="error" sx={{ my: 1 }} onClose={() => refetch()}>
        Failed to load runs.
      </Alert>
    );
  }

  if (!runs.length) {
    return (
      <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', py: 2, textAlign: 'center' }}>
        No runs yet — wait for the next scheduled tick.
      </Typography>
    );
  }

  return (
    <Stack spacing={1} sx={{ pl: 4, pr: 1, py: 1 }}>
      {runs.map((run: CronRun) => (
        <Box
          key={run.id}
          sx={{
            borderLeft: '2px solid',
            borderColor: run.error ? 'warning.main' : 'success.main',
            pl: 1.25,
            py: 0.5,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 600 }}>
              {new Date(run.ranAtMs).toLocaleString()}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>
              · {relativeTime(run.ranAtMs)}
            </Typography>
            {run.messageCount > 2 && (
              <Chip
                label={`${run.messageCount} msgs`}
                size="small"
                sx={{
                  height: 16,
                  fontSize: '0.6rem',
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            )}
          </Stack>
          <Typography
            sx={{
              fontSize: '0.78rem',
              color: run.response ? 'text.primary' : 'warning.main',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontStyle: run.response ? 'normal' : 'italic',
            }}
          >
            {run.response || run.error}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

export default function CronRow({ job, onRemove }: CronRowProps) {
  const [toggleCron] = useToggleCronJobMutation();
  const [localEnabled, setLocalEnabled] = useState(job.enabled);
  const [toggling, setToggling] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const busy = useRef(false);

  const handleToggle = async () => {
    if (busy.current) return;
    busy.current = true;
    const next = !localEnabled;
    setLocalEnabled(next);
    setToggling(true);
    try {
      await toggleCron({ id: job.id, enable: next, profile: job.profile }).unwrap();
    } catch {
      setLocalEnabled(!next);
    } finally {
      setToggling(false);
      busy.current = false;
    }
  };

  const hasError = job.state.lastRunStatus === 'error';
  const hasRuns = !!job.state.lastRunAtMs;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          py: 1,
          px: 2,
          borderRadius: 1.5,
          opacity: localEnabled ? 1 : 0.55,
          '&:hover': { bgcolor: 'action.hover', opacity: 1 },
          transition: 'opacity 0.15s',
        }}
      >
        {toggling ? (
          <CircularProgress size={8} thickness={6} sx={{ flexShrink: 0 }} />
        ) : (
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              bgcolor: !localEnabled
                ? 'error.main'
                : hasError
                  ? 'warning.main'
                  : 'success.main',
            }}
          />
        )}

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography
              sx={{
                fontSize: '0.85rem',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {job.name || job.payload.message?.slice(0, 40) || job.id.slice(0, 8)}
            </Typography>
            {hasError && (
              <Tooltip title={job.state.lastError || 'Last run failed'} placement="top">
                <ErrorIcon sx={{ fontSize: 14, color: 'warning.main' }} />
              </Tooltip>
            )}
          </Box>

          <Typography
            sx={{
              fontSize: '0.75rem',
              color: 'text.secondary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {scheduleLabel(job)}
            {job.profile && job.profile !== 'default' && ` · ${job.profile}`}
            {job.state.lastRunAtMs ? ` · last: ${relativeTime(job.state.lastRunAtMs)}` : ''}
          </Typography>
        </Box>

        {job.deleteAfterRun && (
          <Chip
            label="one-shot"
            size="small"
            sx={{
              height: 20,
              fontSize: '0.65rem',
              fontWeight: 600,
              '& .MuiChip-label': { px: 1 },
            }}
          />
        )}

        <Tooltip title={showRuns ? 'Hide runs' : 'Show runs'} placement="top">
          <span>
            <IconButton
              size="small"
              disabled={!hasRuns}
              onClick={() => setShowRuns((v) => !v)}
              sx={{
                opacity: hasRuns ? 0.6 : 0.25,
                '&:hover': { opacity: 1 },
              }}
            >
              {showRuns ? (
                <ExpandLess sx={{ fontSize: 18 }} />
              ) : hasRuns ? (
                <History sx={{ fontSize: 16 }} />
              ) : (
                <ExpandMore sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </span>
        </Tooltip>

        <Switch
          size="small"
          checked={localEnabled}
          onChange={handleToggle}
          sx={{
            width: 32,
            height: 18,
            p: 0,
            '& .MuiSwitch-switchBase': {
              p: '3px',
              '&.Mui-checked': { transform: 'translateX(14px)' },
            },
            '& .MuiSwitch-thumb': { width: 12, height: 12 },
            '& .MuiSwitch-track': { borderRadius: 9 },
          }}
        />

        <IconButton
          size="small"
          onClick={() => onRemove(job.id)}
          sx={{ opacity: 0.5, '&:hover': { opacity: 1, color: 'error.main' } }}
        >
          <Delete sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      <Collapse in={showRuns} unmountOnExit>
        <RunsPanel jobId={job.id} profile={job.profile} open={showRuns} />
      </Collapse>
    </Box>
  );
}
