/**
 * Hermes subcommand identifiers we can spawn via the PTY bridge. The
 * server's `ALLOWED_SUBCOMMANDS` allowlist must stay in sync.
 *
 * `gateway-setup` is a hyphenated alias for the two-token argv
 * `gateway setup`; the server expands it back to those tokens before
 * spawning hermes.
 */
export type HermesSubcommand =
  | 'model'
  | 'login'
  | 'auth'
  | 'config'
  | 'setup'
  | 'profile'
  | 'doctor'
  | 'status'
  | 'gateway-setup';

/**
 * Friendly rendering of a subcommand for the terminal header. Hyphenated
 * aliases (e.g. `gateway-setup`) are split into their real argv tokens
 * so the displayed command line matches what would be typed in a shell:
 *
 *   `gateway-setup`  →  `gateway setup`
 *   `model`          →  `model`
 */
export function formatHermesCmd(cmd: HermesSubcommand): string {
  if (cmd === 'gateway-setup') return 'gateway setup';
  return cmd;
}
