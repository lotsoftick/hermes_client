import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
  Chip,
  Tooltip,
  useTheme,
} from '@mui/material';
import { Close, Refresh } from '@mui/icons-material';
import TerminalView, { type TerminalColors, type TerminalStatus } from './TerminalView';

export type HermesSubcommand =
  | 'model'
  | 'login'
  | 'auth'
  | 'config'
  | 'setup'
  | 'profile'
  | 'doctor'
  | 'status';

interface SetupTerminalProps {
  open: boolean;
  profile: string;
  /**
   * Hermes subcommand to run for this profile. Defaults to `model` — the
   * interactive provider/model picker which also walks the user through
   * authentication for the chosen provider.
   */
  cmd?: HermesSubcommand;
  title?: string;
  onClose: () => void;
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

export default function SetupTerminal({
  open,
  profile,
  cmd = 'model',
  title,
  onClose,
}: SetupTerminalProps) {
  const theme = useTheme();
  const { sidebar } = theme.palette;
  const [status, setStatus] = useState<TerminalStatus>('connecting');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [ready, setReady] = useState(false);

  const terminalColors = useMemo<TerminalColors>(
    () => ({
      background: sidebar.background,
      foreground: sidebar.selectedText,
      cursor: sidebar.selectedBorder,
      muted: sidebar.text,
    }),
    [sidebar.background, sidebar.selectedText, sidebar.selectedBorder, sidebar.text]
  );

  useEffect(() => {
    if (!open) setReady(false);
  }, [open]);

  useEffect(() => {
    setStatus('connecting');
    setExitCode(null);
  }, [cmd, runKey]);

  const onStatusChange = useCallback((s: TerminalStatus, code: number | null) => {
    setStatus(s);
    if (code !== null) setExitCode(code);
  }, []);

  // Auto-close on clean exit so the user doesn't need to dismiss the modal
  // manually after a successful setup.
  useEffect(() => {
    if (status !== 'closed' || exitCode !== 0) return undefined;
    const id = window.setTimeout(onClose, 900);
    return () => window.clearTimeout(id);
  }, [status, exitCode, onClose]);

  const onEntered = useCallback(() => setReady(true), []);

  const headerLabel = title || `hermes -p ${profile} ${cmd}`;
  const chip = STATUS_CHIP[status];
  const chipLabel = status === 'closed' && exitCode === 0 ? 'done' : chip.label;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      keepMounted={false}
      TransitionProps={{ onEntered }}
      PaperProps={{
        sx: {
          bgcolor: sidebar.background,
          color: sidebar.text,
          border: `1px solid ${sidebar.border}`,
        },
      }}
    >
      <DialogTitle sx={{ pr: 1.5, py: 1.25, borderBottom: `1px solid ${sidebar.border}` }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{ fontSize: '0.95rem', fontWeight: 600, color: sidebar.selectedText }}
              noWrap
            >
              {headerLabel}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: sidebar.text, opacity: 0.7 }}>
              Interactive terminal · profile: {profile}
            </Typography>
          </Box>
          <Chip label={chipLabel} color={chip.color} size="small" sx={{ height: 22 }} />
          {status !== 'connecting' && (
            <Tooltip title="Run again">
              <IconButton
                size="small"
                onClick={() => setRunKey((k) => k + 1)}
                sx={{ color: sidebar.text }}
              >
                <Refresh fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton size="small" onClick={onClose} sx={{ color: sidebar.text }}>
            <Close fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent
        sx={{ p: 0, bgcolor: terminalColors.background, height: { xs: '60vh', md: 480 } }}
      >
        <TerminalView
          profile={profile}
          cmd={cmd}
          enabled={ready}
          runKey={runKey}
          onStatusChange={onStatusChange}
          colors={terminalColors}
        />
      </DialogContent>
    </Dialog>
  );
}
