import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Drawer,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { Close, Refresh } from '@mui/icons-material';
import TerminalView, { type TerminalColors, type TerminalStatus } from './TerminalView';
import type { HermesSubcommand } from './SetupTerminal';
import { SETUP_ACTIONS, type SetupAction } from './setupActions';
import { useAppDispatch } from '../../../../app/store/hooks';
import { agentsApi } from '../../../../entities/agent/api';

interface AgentConfigDrawerProps {
  open: boolean;
  /** Hermes profile name to scope the configuration commands to. */
  profile: string;
  /** Display name shown in the header (defaults to the profile name). */
  agentName?: string;
  onClose: () => void;
  /**
   * Subcommand to launch first. Defaults to `model` — the per-profile
   * provider/model picker, which also walks the user through auth.
   */
  initialCmd?: HermesSubcommand;
}

const STATUS_CHIP: Record<
  TerminalStatus,
  { label: string; color: 'success' | 'warning' | 'error' | 'default' }
> = {
  connecting: { label: 'connecting…', color: 'warning' },
  connected: { label: 'live', color: 'success' },
  closed: { label: 'done', color: 'default' },
  error: { label: 'error', color: 'error' },
};

export default function AgentConfigDrawer({
  open,
  profile,
  agentName,
  onClose,
  initialCmd = 'model',
}: AgentConfigDrawerProps) {
  const theme = useTheme();
  const { sidebar } = theme.palette;
  const dispatch = useAppDispatch();
  const [cmd, setCmd] = useState<HermesSubcommand>(initialCmd);
  const [status, setStatus] = useState<TerminalStatus>('connecting');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [runKey, setRunKey] = useState(0);
  // Defer mounting xterm until the drawer's enter transition has finished —
  // otherwise xterm renders into a 0×0 box and shows nothing.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    // Drawer doesn't expose a clean "entered" callback like Dialog. Wait one
    // animation frame past the default Drawer transition (~225ms) so xterm
    // can fit() the fully-laid-out container.
    const id = window.setTimeout(() => setReady(true), 260);
    return () => window.clearTimeout(id);
  }, [open]);

  // Reset status on rerun / cmd switch so the chip reflects reality.
  useEffect(() => {
    setStatus('connecting');
    setExitCode(null);
  }, [cmd, runKey]);

  const onStatusChange = useCallback((s: TerminalStatus, code: number | null) => {
    setStatus(s);
    if (code !== null) setExitCode(code);
  }, []);

  // Wrap parent's onClose to also invalidate the cached agent list. The
  // setup commands here (`model`, `auth`, `login`, `cron`, …) all mutate
  // Hermes-side profile state that the API decorates onto each Agent
  // record — most visibly the `model` field, which drives the provider
  // icon in the sidebar. Refetching here means the icon updates the
  // moment the drawer closes, whether the close was triggered by a
  // successful auto-close or a manual click on the X / backdrop.
  const handleClose = useCallback(() => {
    dispatch(agentsApi.util.invalidateTags(['Agent']));
    onClose();
  }, [dispatch, onClose]);

  // Auto-close the drawer when the underlying command finished successfully.
  // Errors keep the drawer open so the user can read what went wrong.
  useEffect(() => {
    if (status !== 'closed' || exitCode !== 0) return undefined;
    const id = window.setTimeout(handleClose, 900);
    return () => window.clearTimeout(id);
  }, [status, exitCode, handleClose]);

  const displayName = agentName || profile;
  const chip = STATUS_CHIP[status];
  const chipLabel = status === 'closed' && exitCode === 0 ? 'done' : chip.label;
  const activeAction: SetupAction =
    SETUP_ACTIONS.find((a) => a.cmd === cmd) || SETUP_ACTIONS[0];

  // Drive the terminal palette from the active sidebar theme so the surface
  // blends with the rest of the drawer instead of being a black slab.
  const terminalColors = useMemo<TerminalColors>(
    () => ({
      background: sidebar.background,
      foreground: sidebar.selectedText,
      cursor: sidebar.selectedBorder,
      muted: sidebar.text,
    }),
    [sidebar.background, sidebar.selectedText, sidebar.selectedBorder, sidebar.text]
  );

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={handleClose}
      ModalProps={{ keepMounted: false }}
      PaperProps={{
        sx: {
          width: { xs: '94vw', sm: 520, md: 620 },
          bgcolor: sidebar.background,
          color: sidebar.text,
          borderRight: `1px solid ${sidebar.border}`,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${sidebar.border}` }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: '0.95rem',
              fontWeight: 600,
              color: sidebar.selectedText,
              textTransform: 'capitalize',
            }}
            noWrap
          >
            Configure {displayName}
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', color: sidebar.text, opacity: 0.7 }} noWrap>
            hermes profile · {profile}
          </Typography>
        </Box>
        <Chip label={chipLabel} color={chip.color} size="small" sx={{ height: 22 }} />
        <Tooltip title="Run again">
          <span>
            <IconButton
              size="small"
              disabled={status === 'connecting'}
              onClick={() => setRunKey((k) => k + 1)}
              sx={{ color: sidebar.text }}
            >
              <Refresh fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <IconButton size="small" onClick={handleClose} sx={{ color: sidebar.text }}>
          <Close fontSize="small" />
        </IconButton>
      </Stack>

      {/* Command selector */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${sidebar.border}` }}
      >
        <Typography sx={{ fontSize: '0.7rem', color: sidebar.text, opacity: 0.7 }}>
          Action
        </Typography>
        <Select<HermesSubcommand>
          value={cmd}
          size="small"
          onChange={(e) => setCmd(e.target.value as HermesSubcommand)}
          sx={{
            minWidth: 220,
            color: sidebar.selectedText,
            bgcolor: sidebar.hover,
            borderRadius: 1.5,
            fontSize: '0.8rem',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: sidebar.border },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: sidebar.selectedBorder,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: sidebar.selectedBorder,
            },
            '& .MuiSelect-icon': { color: sidebar.text },
          }}
        >
          {SETUP_ACTIONS.map((action) => (
            <MenuItem key={action.cmd} value={action.cmd} sx={{ display: 'block', py: 0.75 }}>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 500 }}>{action.label}</Typography>
              <Typography sx={{ fontSize: '0.66rem', color: 'text.secondary' }}>
                {action.hint}
              </Typography>
            </MenuItem>
          ))}
        </Select>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{ fontSize: '0.7rem', color: sidebar.text, opacity: 0.75, lineHeight: 1.3 }}
            noWrap
          >
            {activeAction.description}
          </Typography>
        </Box>
      </Stack>

      {/* Terminal */}
      <Box sx={{ flex: 1, minHeight: 0, bgcolor: terminalColors.background }}>
        <TerminalView
          profile={profile}
          cmd={cmd}
          enabled={ready}
          runKey={runKey}
          onStatusChange={onStatusChange}
          colors={terminalColors}
        />
      </Box>
    </Drawer>
  );
}
