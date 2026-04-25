import { useRef, useState } from 'react';
import { Box, Typography, Chip, CircularProgress, Switch, IconButton, Tooltip } from '@mui/material';
import { Delete, Error as ErrorIcon } from '@mui/icons-material';
import { useToggleCronJobMutation, type CronJob } from '../api';

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
  return schedule.kind;
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

export default function CronRow({ job, onRemove }: CronRowProps) {
  const [toggleCron] = useToggleCronJobMutation();
  const [localEnabled, setLocalEnabled] = useState(job.enabled);
  const [toggling, setToggling] = useState(false);
  const busy = useRef(false);

  const handleToggle = async () => {
    if (busy.current) return;
    busy.current = true;
    const next = !localEnabled;
    setLocalEnabled(next);
    setToggling(true);
    try {
      await toggleCron({ id: job.id, enable: next }).unwrap();
    } catch {
      setLocalEnabled(!next);
    } finally {
      setToggling(false);
      busy.current = false;
    }
  };

  const hasError = job.state.lastRunStatus === 'error';

  return (
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
          {job.agentId && ` · agent: ${job.agentId}`}
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
  );
}
