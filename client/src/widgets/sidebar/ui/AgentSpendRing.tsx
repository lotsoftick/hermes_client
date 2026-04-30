import { memo, useMemo } from 'react';
import { Box, CircularProgress, Tooltip, Typography, useTheme } from '@mui/material';
import { HelpOutline } from '@mui/icons-material';
import { ModelIcon, resolveModelIcon } from '../../../shared/ui';
import { useGetAgentsSpendQuery, type AgentSpendRow } from '../../../entities/insights';

interface AgentSpendRingProps {
  agentId: string;
  hermesProfile: string;
  model?: string | null;
  /** Diameter of the outer ring in px. */
  size?: number;
  /** Whether the agent has *any* model configured yet. */
  configured?: boolean;
  onClickWhenUnconfigured?: () => void;
  /**
   * What to render inside the ring.
   *   - `icon`        — the model's provider icon (default; sidebar style).
   *   - `percentage`  — the spend-vs-cap %, falling back to the icon when
   *                     no cap is set. Used in the chat header.
   */
  display?: 'icon' | 'percentage';
}

function formatUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd === 0) return '$0';
  if (usd < 0.01) return '<$0.01';
  // Two decimals everywhere up to $10k so the popover columns line up
  // and the user can see the cents — matching how spend is displayed
  // on the rest of the page.
  if (usd < 10_000) return `$${usd.toFixed(2)}`;
  return `$${(usd / 1000).toFixed(1)}k`;
}

interface RingState {
  /** 0–1.5 — values > 1 are clamped to 1 visually but signal overage. */
  ratio: number;
  /** 'primary' | 'warning' | 'error' — drives the stroke colour. */
  color: 'primary' | 'warning' | 'error';
  /** Which cap window is being visualised (or `null` if no cap is set). */
  window: 'monthly' | 'daily' | 'allTime' | null;
}

function pickRingState(row: AgentSpendRow | undefined): RingState {
  if (!row) return { ratio: 0, color: 'primary', window: null };
  const { caps, spendWindows } = row;
  // Monthly is the most useful for routine watching, so it wins; we
  // fall back to daily and then all-time so a user who only set one
  // cap still sees a meaningful ring.
  let ratio = 0;
  let window: RingState['window'] = null;
  if (caps.monthlyCapUsd && caps.monthlyCapUsd > 0) {
    ratio = spendWindows.monthUsd / caps.monthlyCapUsd;
    window = 'monthly';
  } else if (caps.dailyCapUsd && caps.dailyCapUsd > 0) {
    ratio = spendWindows.dayUsd / caps.dailyCapUsd;
    window = 'daily';
  } else if (caps.allTimeCapUsd && caps.allTimeCapUsd > 0) {
    ratio = spendWindows.allTimeUsd / caps.allTimeCapUsd;
    window = 'allTime';
  }
  let color: RingState['color'] = 'primary';
  if (ratio >= 1) color = 'error';
  else if (ratio >= 0.7) color = 'warning';
  return { ratio, color, window };
}

/**
 * Visualises an agent's monthly (or fallback) spend-vs-cap as a
 * circular progress ring around the model icon. When no caps are
 * set we just render the icon as before — a faint grey track is
 * always drawn so the ring looks "armed but empty" rather than
 * "broken" in the no-cap case.
 *
 * Tooltip shows the relevant numbers so the sidebar stays uncluttered.
 */
const AgentSpendRing = memo(function AgentSpendRing({
  agentId,
  hermesProfile,
  model,
  size = 26,
  configured = true,
  onClickWhenUnconfigured,
  display = 'icon',
}: AgentSpendRingProps) {
  const theme = useTheme();
  const { sidebar } = theme.palette;
  const { data } = useGetAgentsSpendQuery(undefined, {
    pollingInterval: 60_000,
  });

  const row = data?.agents.find((r) => String(r.agentId) === String(agentId));
  const state = useMemo(() => pickRingState(row), [row]);

  // Inner icon size — keep a 5px breathing room around the icon for
  // the ring and the gap.
  const iconSize = Math.max(12, size - 10);
  const visualValue = Math.min(state.ratio, 1) * 100;
  const showRing = state.window !== null;
  // Show the percentage only when there's a cap to anchor it to;
  // otherwise fall back to the icon so the badge doesn't read "—%".
  const showPercentage = display === 'percentage' && showRing;
  const percentLabel = `${Math.round(state.ratio * 100)}%`;

  // Format `$spent / $cap (NN%)` — falls back to "no cap" when the
  // user hasn't set one for this window. Returning a structured tuple
  // lets us right-align the value column independent of label width.
  type Row = { label: string; spent: string; capPart: string; isOver: boolean };
  const buildRow = (
    label: string,
    spent: number,
    cap: number | null | undefined
  ): Row => {
    if (cap && cap > 0) {
      const pct = Math.round((spent / cap) * 100);
      return {
        label,
        spent: formatUsd(spent),
        capPart: `/ ${formatUsd(cap)} (${pct}%)`,
        isOver: spent > cap,
      };
    }
    return {
      label,
      spent: formatUsd(spent),
      capPart: '/ no cap',
      isOver: false,
    };
  };

  const rows: Row[] = row
    ? [
        buildRow('Daily', row.spendWindows.dayUsd, row.caps.dailyCapUsd),
        buildRow('Monthly', row.spendWindows.monthUsd, row.caps.monthlyCapUsd),
        buildRow('All-time', row.spendWindows.allTimeUsd, row.caps.allTimeCapUsd),
      ]
    : [];

  const modelLabel = model
    ? resolveModelIcon(model)?.label
      ? `${resolveModelIcon(model)?.label} · ${model}`
      : model
    : null;

  const tooltipNode = (
    <Box sx={{ minWidth: 220, py: 0.25 }}>
      <Typography
        sx={{
          fontWeight: 700,
          fontSize: '0.78rem',
          mb: 0.75,
          color: 'text.primary',
        }}
      >
        Spend vs. cap
      </Typography>
      {rows.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 1.5,
            rowGap: 0.4,
            alignItems: 'baseline',
          }}
        >
          {rows.map((r) => (
            <Box key={r.label} sx={{ display: 'contents' }}>
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  color: 'text.secondary',
                }}
              >
                {r.label}
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  color: r.isOver ? 'error.main' : 'text.primary',
                  fontWeight: r.isOver ? 600 : 500,
                }}
              >
                {r.spent}{' '}
                <Box
                  component="span"
                  sx={{ color: 'text.secondary', fontWeight: 400 }}
                >
                  {r.capPart}
                </Box>
              </Typography>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
          No usage data yet for this agent.
        </Typography>
      )}
      {(modelLabel || !model) && (
        <Box
          sx={{
            mt: 1,
            pt: 0.75,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          {modelLabel ? (
            <Typography
              sx={{
                fontSize: '0.7rem',
                color: 'text.secondary',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {modelLabel}
            </Typography>
          ) : (
            <Typography
              sx={{
                fontSize: '0.7rem',
                color: 'text.secondary',
                fontStyle: 'italic',
              }}
            >
              No model configured yet — click to set one up
            </Typography>
          )}
          <Typography
            sx={{
              fontSize: '0.65rem',
              color: 'text.disabled',
              fontFamily: 'monospace',
              mt: 0.25,
            }}
          >
            profile · {hermesProfile}
          </Typography>
        </Box>
      )}
    </Box>
  );

  return (
    <Tooltip
      title={tooltipNode}
      placement="bottom-start"
      arrow
      // Light, card-style popover: matches the rest of the app's
      // surfaces and gives the table-like number alignment enough
      // contrast to read clearly. The default dark MUI tooltip
      // squashed everything into a single line.
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: 'background.paper',
            color: 'text.primary',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 6,
            p: 1.25,
            maxWidth: 320,
            // Override the default tighter line-height so our grid
            // rows breathe.
            '& .MuiTooltip-arrow': { color: 'background.paper' },
          },
        },
        arrow: {
          sx: {
            color: 'background.paper',
            '&::before': {
              border: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'background.paper',
            },
          },
        },
      }}
    >
      <Box
        component="span"
        onClick={(e) => {
          if (!configured && onClickWhenUnconfigured) {
            e.stopPropagation();
            onClickWhenUnconfigured();
          }
        }}
        sx={{
          width: size,
          height: size,
          flexShrink: 0,
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: configured ? 'inherit' : 'pointer',
          color: configured ? sidebar.selectedText : sidebar.selectedBorder,
          opacity: configured ? 0.95 : 0.85,
          transition: 'opacity 120ms ease, transform 120ms ease',
          '&:hover': configured
            ? undefined
            : { opacity: 1, transform: 'scale(1.05)' },
        }}
      >
        {/* Track ring (faint, always present) */}
        <CircularProgress
          variant="determinate"
          value={100}
          size={size}
          thickness={3}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            color: theme.palette.action.hover,
          }}
        />
        {/* Foreground ring — only when there's a cap to track */}
        {showRing ? (
          <CircularProgress
            variant="determinate"
            value={visualValue}
            size={size}
            thickness={3}
            color={state.color}
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              // Spin the gradient so the ring opens at 12 o'clock —
              // matches the reference UI better than the MUI default.
              transform: 'rotate(-90deg)',
              '& .MuiCircularProgress-circle': {
                strokeLinecap: 'round',
              },
            }}
          />
        ) : null}
        {/* Inner content — either the model icon (sidebar) or the
            spend-vs-cap percentage (chat header). */}
        <Box
          sx={{
            width: iconSize,
            height: iconSize,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            border:
              configured || showPercentage
                ? 'none'
                : `1px dashed ${sidebar.selectedBorder}`,
          }}
        >
          {showPercentage ? (
            <Typography
              component="span"
              sx={{
                // Match the ring colour so the number reinforces the
                // status the ring is already showing.
                color: `${state.color}.main`,
                // Tighten letter spacing so 3-digit values (>=100%)
                // still fit in a small badge.
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                // Drop the % sign one tick smaller than the digits.
                fontSize: size <= 28 ? '0.62rem' : '0.7rem',
                whiteSpace: 'nowrap',
              }}
            >
              {percentLabel}
            </Typography>
          ) : resolveModelIcon(model) ? (
            <ModelIcon model={model} size={iconSize - 4} />
          ) : (
            <HelpOutline sx={{ fontSize: iconSize - 6 }} />
          )}
        </Box>
      </Box>
    </Tooltip>
  );
});

export default AgentSpendRing;
