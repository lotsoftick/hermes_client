import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { API_BASE_URL } from '../../../../shared/api';
import { formatHermesCmd, type HermesSubcommand } from './cmd';

export type TerminalStatus = 'connecting' | 'connected' | 'closed' | 'error';

export interface TerminalColors {
  background: string;
  foreground: string;
  cursor: string;
  /** Color used for the dim "$ hermes …" header and "[process exited]" line. */
  muted: string;
}

interface TerminalViewProps {
  /**
   * Hermes profile that the command runs against. Pairs with `cmd` and is
   * sent as `?profile=` to `/ws/pty`.
   */
  profile: string;
  cmd: HermesSubcommand;
  /**
   * The terminal is only mounted/connected when `enabled` is true. The
   * caller should flip this AFTER the surrounding container (drawer, modal,
   * panel) has finished its enter transition so xterm doesn't render into
   * a 0×0 box.
   */
  enabled: boolean;
  /**
   * Bumped by the parent to force a fresh PTY connection (re-run the
   * command). Restarts the effect.
   */
  runKey?: number;
  onStatusChange?: (status: TerminalStatus, exitCode: number | null) => void;
  /**
   * Optional minimum height for the terminal box. Default is responsive.
   */
  minHeight?: number | string;
  /**
   * Optional theme colors for the terminal surface. Defaults to a dark
   * palette so the component still looks reasonable when used standalone.
   */
  colors?: TerminalColors;
}

const DEFAULT_COLORS: TerminalColors = {
  background: '#0b0b0b',
  foreground: '#e6e6e6',
  cursor: '#ff5252',
  muted: '#888888',
};

/**
 * Detect whether a CSS color is "light" (so we can flip ANSI accent colors and
 * the cursor to remain visible). Falls back to dark assumption on parse error.
 */
function isLightColor(hex: string): boolean {
  const m = hex.replace('#', '');
  if (m.length !== 3 && m.length !== 6) return false;
  const expand = (s: string): number => parseInt(s.length === 1 ? s + s : s, 16);
  const r = expand(m.length === 3 ? m[0] : m.slice(0, 2));
  const g = expand(m.length === 3 ? m[1] : m.slice(2, 4));
  const b = expand(m.length === 3 ? m[2] : m.slice(4, 6));
  // Perceived luminance — the standard (Rec. 601) formula.
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

function buildWsUrl(profile: string, cmd: string, cols: number, rows: number): string | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  const apiUrl = new URL(API_BASE_URL);
  const proto = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const u = new URL(`${proto}//${apiUrl.host}/ws/pty`);
  u.searchParams.set('token', token);
  u.searchParams.set('profile', profile);
  u.searchParams.set('cmd', cmd);
  u.searchParams.set('cols', String(cols));
  u.searchParams.set('rows', String(rows));
  return u.toString();
}

export default function TerminalView({
  profile,
  cmd,
  enabled,
  runKey = 0,
  onStatusChange,
  minHeight,
  colors = DEFAULT_COLORS,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onStatusRef = useRef(onStatusChange);
  onStatusRef.current = onStatusChange;
  const [, forceTick] = useState(0);
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  useEffect(() => {
    if (!enabled) return undefined;
    const container = containerRef.current;
    if (!container) {
      // Container ref hasn't attached yet (e.g. parent just rendered); try
      // again on the next paint.
      const id = requestAnimationFrame(() => forceTick((n) => n + 1));
      return () => cancelAnimationFrame(id);
    }

    const emit = (status: TerminalStatus, exitCode: number | null = null): void => {
      queueMicrotask(() => onStatusRef.current?.(status, exitCode));
    };

    const c = colorsRef.current;
    // Pick an ANSI accent color for the "running" header line and "exited"
    // footer that stays legible against the chosen background.
    const lightBg = isLightColor(c.background);

    const term = new Terminal({
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
      theme: {
        background: c.background,
        foreground: c.foreground,
        cursor: c.cursor,
        cursorAccent: c.background,
        selectionBackground: lightBg ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)',
      },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);

    const safeFit = (): { cols: number; rows: number } => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
      return { cols: term.cols, rows: term.rows };
    };
    safeFit();
    requestAnimationFrame(() => {
      safeFit();
      // Hand keyboard focus to the terminal as soon as it has real layout so
      // the user can start typing immediately without an extra click.
      try {
        term.focus();
      } catch {
        /* ignore */
      }
    });

    // We can't easily restyle xterm's existing renderer mid-line, so use
    // truecolor SGR sequences derived from the supplied palette to emulate
    // "muted" and "error" lines that contrast properly against the bg.
    const rgbFromHex = (hex: string): [number, number, number] => {
      const m = hex.replace('#', '');
      const expand = (s: string): number =>
        parseInt(s.length === 1 ? s + s : s, 16);
      if (m.length === 3) return [expand(m[0]), expand(m[1]), expand(m[2])];
      if (m.length === 6) return [expand(m.slice(0, 2)), expand(m.slice(2, 4)), expand(m.slice(4, 6))];
      return [136, 136, 136];
    };
    const sgrTrueColor = (rgb: [number, number, number]): string =>
      `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
    const muted = sgrTrueColor(rgbFromHex(c.muted));
    const errorColor = sgrTrueColor(lightBg ? [183, 28, 28] : [255, 99, 99]);
    const reset = '\x1b[0m';

    const url = buildWsUrl(profile, cmd, term.cols || 100, term.rows || 30);
    if (!url) {
      term.writeln(`${errorColor}Not signed in. Cannot open terminal.${reset}`);
      emit('error');
      return () => {
        term.dispose();
      };
    }

    emit('connecting');
    term.writeln(`${muted}$ hermes -p ${profile} ${formatHermesCmd(cmd)}${reset}\r\n`);

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      emit('connected');
      try {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      } catch {
        /* ignore */
      }
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'exit') {
            const code = typeof msg.exitCode === 'number' ? msg.exitCode : null;
            emit('closed', code);
            term.writeln(
              `\r\n${muted}[process exited${code !== null ? ` with code ${code}` : ''}]${reset}`
            );
            return;
          }
          if (msg.type === 'error') {
            term.writeln(`\r\n${errorColor}${msg.error}${reset}`);
            emit('error');
            return;
          }
        } catch {
          term.write(ev.data);
        }
        return;
      }
      term.write(new Uint8Array(ev.data));
    };
    ws.onclose = (ev) => {
      // ws.onclose may fire after we already saw an explicit `exit` event;
      // distinguish refused connections from clean closes by inspecting the
      // ready state path.
      if (ev.code === 1000) return;
      term.writeln(
        `\r\n${errorColor}Connection closed (code ${ev.code}). The API may not be running, or your session expired.${reset}`
      );
      emit('error');
    };
    ws.onerror = () => emit('error');

    const onData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const sendResize = (): void => {
      try {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      } catch {
        /* ignore */
      }
    };
    const ro = new ResizeObserver(sendResize);
    ro.observe(container);

    return () => {
      onData.dispose();
      ro.disconnect();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, profile, cmd, runKey]);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: '100%',
        minHeight: minHeight ?? 0,
        bgcolor: colors.background,
        px: 1,
        py: 1,
        '& .xterm': { height: '100%' },
        '& .xterm-viewport': { backgroundColor: `${colors.background} !important` },
      }}
    />
  );
}
