import { memo, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { WarningAmberRounded } from '@mui/icons-material';
import { useGetAgentQuery, useUpdateAgentMutation } from '../../entities/agent';
import { useGetAgentsSpendQuery, type SpendWindows } from '../../entities/insights';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const ZERO_WINDOWS: SpendWindows = { dayUsd: 0, monthUsd: 0, allTimeUsd: 0 };

function formatUsd(usd: number, opts?: { compact?: boolean }): string {
  if (!Number.isFinite(usd)) return '$0';
  if (usd === 0) return '$0';
  if (usd < 0.01) return '< $0.01';
  if (opts?.compact && usd >= 1000) {
    return `$${(usd / 1000).toFixed(1)}k`;
  }
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Convert the controlled string value of an `<input type="number">` to the
 * numeric form we send to the API. Empty string becomes `null` (= clear).
 */
function parseCap(input: string): number | null {
 const t = input.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Stringify a cap value for the controlled input. */
function capToInput(value: number | null | undefined): string {
  if (value == null) return '';
  return String(value);
}

function pickProgressColor(
  ratio: number
): 'primary' | 'warning' | 'error' {
  if (ratio >= 1) return 'error';
  if (ratio >= 0.7) return 'warning';
  return 'primary';
}

function startOfMonthLabel(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* -------------------------------------------------------------------------- */
/* Single-cap row                                                              */
/* -------------------------------------------------------------------------- */

interface CapInputProps {
  label: string;
  resetText: string;
  spentText: string;
  value: string;
  onChange: (next: string) => void;
  spent: number;
  cap: number | null;
  disabled?: boolean;
}

const CapInput = memo(function CapInput({
  label,
  resetText,
  spentText,
  value,
  onChange,
  spent,
  cap,
  disabled,
}: CapInputProps) {
  const theme = useTheme();
  const ratio = cap && cap > 0 ? Math.max(0, Math.min(spent / cap, 1.5)) : 0;
  const showBar = cap != null && cap > 0;
  const color = pickProgressColor(ratio);
  // Clamp the visual bar to 100% — colour conveys overage.
  const visualValue = Math.min(ratio, 1) * 100;

  return (
    <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
      <Stack spacing={0.25}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}
        >
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
          {resetText}
        </Typography>
        <TextField
          size="small"
          type="number"
          placeholder="No limit"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
              inputProps: { min: 0, step: 0.5, inputMode: 'decimal' },
            },
          }}
          sx={{ mt: 0.5 }}
          fullWidth
        />
        {showBar ? (
          <LinearProgress
            variant="determinate"
            value={visualValue}
            color={color}
            sx={{
              mt: 1,
              height: 6,
              borderRadius: 3,
              bgcolor: theme.palette.action.hover,
            }}
          />
        ) : (
          <Box sx={{ height: 6, mt: 1 }} />
        )}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: '0.7rem', mt: showBar ? 0.5 : 0 }}
        >
          {spentText}
        </Typography>
      </Stack>
    </Box>
  );
});

/* -------------------------------------------------------------------------- */
/* Main card                                                                   */
/* -------------------------------------------------------------------------- */

export interface SpendCapsCardProps {
  agentId: string;
}

export default function SpendCapsCard({ agentId }: SpendCapsCardProps) {
  const { data: agent, isLoading: agentLoading } = useGetAgentQuery(agentId, {
    skip: !agentId,
  });
  const { data: spendData, isFetching: spendFetching } = useGetAgentsSpendQuery(undefined, {
    pollingInterval: 60_000,
  });
  const [updateAgent, { isLoading: saving, error: saveError }] = useUpdateAgentMutation();

  const spend: SpendWindows = useMemo(() => {
    if (!spendData) return ZERO_WINDOWS;
    const row = spendData.agents.find((r) => String(r.agentId) === String(agentId));
    return row?.spendWindows ?? ZERO_WINDOWS;
  }, [spendData, agentId]);

  // Local controlled inputs so the user can clear/replace caps without
  // hitting the backend on every keystroke. We only push to the server
  // when they click Save.
  //
  // We sync these from the agent record using the "store information
  // from previous renders" pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  // The `serverSnapshot` string acts as a fingerprint of the last
  // server-side cap state we've seen — if it changes, we re-seed the
  // form. This avoids the cascading-render trap of doing it in an
  // effect, while still picking up cap changes that happen elsewhere
  // (e.g. our own successful save) on the next render.
  const [daily, setDaily] = useState('');
  const [monthly, setMonthly] = useState('');
  const [allTime, setAllTime] = useState('');
  const [serverSnapshot, setServerSnapshot] = useState<string | null>(null);

  const liveSnapshot = agent
    ? `${agent._id}|${agent.dailyCapUsd ?? ''}|${agent.monthlyCapUsd ?? ''}|${agent.allTimeCapUsd ?? ''}`
    : null;
  if (liveSnapshot !== null && liveSnapshot !== serverSnapshot) {
    setServerSnapshot(liveSnapshot);
    setDaily(capToInput(agent!.dailyCapUsd));
    setMonthly(capToInput(agent!.monthlyCapUsd));
    setAllTime(capToInput(agent!.allTimeCapUsd));
  }

  const dirty = useMemo(() => {
    if (!agent) return false;
    return (
      capToInput(agent.dailyCapUsd) !== daily ||
      capToInput(agent.monthlyCapUsd) !== monthly ||
      capToInput(agent.allTimeCapUsd) !== allTime
    );
  }, [agent, daily, monthly, allTime]);

  const handleSave = async () => {
    if (!agent) return;
    try {
      await updateAgent({
        id: agent._id,
        dailyCapUsd: parseCap(daily),
        monthlyCapUsd: parseCap(monthly),
        allTimeCapUsd: parseCap(allTime),
      } as Parameters<typeof updateAgent>[0]).unwrap();
    } catch {
      /* error surfaced via the alert below */
    }
  };

  const dailyCap = agent?.dailyCapUsd ?? null;
  const monthlyCap = agent?.monthlyCapUsd ?? null;
  const allTimeCap = agent?.allTimeCapUsd ?? null;

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2.5, borderRadius: 2, position: 'relative', overflow: 'hidden' }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1}
        sx={{ mb: 1.5 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Spend limits
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Cap this agent's USD spend per window. Leave empty for no limit.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          disabled={!dirty || saving || agentLoading}
          onClick={handleSave}
        >
          {saving ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : 'Save'}
        </Button>
      </Stack>

      <Alert
        icon={<WarningAmberRounded fontSize="small" />}
        severity="warning"
        variant="outlined"
        sx={{ mb: 2, py: 0.5 }}
      >
        These limits do <strong>not</strong> stop the agent or throttle its performance —
        they're an advisory budget so you can watch your preferred spend per window. The
        agent will keep running even after a cap is reached.
      </Alert>

      {saveError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          Couldn't save the caps. Please retry.
        </Alert>
      ) : null}

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2.5}
        useFlexGap
        sx={{ alignItems: 'stretch' }}
      >
        <CapInput
          label="Daily cap"
          resetText={`Resets each day · today ${todayLabel()}`}
          spentText={
            dailyCap
              ? `${formatUsd(spend.dayUsd)} spent / ${formatUsd(dailyCap)} · ${
                  Math.round((spend.dayUsd / dailyCap) * 100)
                }%`
              : `${formatUsd(spend.dayUsd)} spent today`
          }
          value={daily}
          onChange={setDaily}
          spent={spend.dayUsd}
          cap={dailyCap}
          disabled={agentLoading || saving}
        />
        <CapInput
          label="Monthly cap"
          resetText={`Resets on the 1st · current bucket ${startOfMonthLabel()}`}
          spentText={
            monthlyCap
              ? `${formatUsd(spend.monthUsd)} spent / ${formatUsd(monthlyCap)} · ${
                  Math.round((spend.monthUsd / monthlyCap) * 100)
                }%`
              : `${formatUsd(spend.monthUsd)} spent this month`
          }
          value={monthly}
          onChange={setMonthly}
          spent={spend.monthUsd}
          cap={monthlyCap}
          disabled={agentLoading || saving}
        />
        <CapInput
          label="All-time cap"
          resetText="Lifetime spend; never resets"
          spentText={
            allTimeCap
              ? `${formatUsd(spend.allTimeUsd)} spent / ${formatUsd(allTimeCap)} · ${
                  Math.round((spend.allTimeUsd / allTimeCap) * 100)
                }%`
              : `${formatUsd(spend.allTimeUsd)} spent`
          }
          value={allTime}
          onChange={setAllTime}
          spent={spend.allTimeUsd}
          cap={allTimeCap}
          disabled={agentLoading || saving}
        />
      </Stack>

      {/* Subtle indicator that the spend numbers are live-polled */}
      {spendFetching ? (
        <CircularProgress
          size={12}
          thickness={5}
          sx={{ position: 'absolute', top: 12, right: 12, opacity: 0.5 }}
        />
      ) : null}
    </Paper>
  );
}
