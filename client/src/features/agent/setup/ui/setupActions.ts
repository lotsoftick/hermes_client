import type { HermesSubcommand } from './SetupTerminal';

export interface SetupAction {
  cmd: HermesSubcommand;
  label: string;
  hint: string;
  description: string;
  recommended?: boolean;
}

/**
 * Per-profile configuration entry points exposed in the UI. Order matters —
 * the most useful step for a freshly-created profile is first.
 *
 * The list is intentionally narrow: the rest of Hermes's CLI surface
 * (`login`, `auth`, `config`, `doctor`, `setup`, …) is still accepted by
 * the PTY allowlist on the server, but exposing every subcommand here
 * overwhelms the operator. We keep the picks that map to dedicated UI
 * flows and surface everything else via a real terminal session.
 */
export const SETUP_ACTIONS: SetupAction[] = [
  {
    cmd: 'model',
    label: 'Pick provider & model',
    hint: 'hermes model',
    description: 'Choose an inference provider and default model. Walks you through login if needed.',
    recommended: true,
  },
  {
    cmd: 'gateway-setup',
    label: 'Configure channel',
    hint: 'hermes gateway setup',
    description:
      'Interactively connect a messenger (Telegram, Discord, WhatsApp, Slack, …) to this agent.',
  },
];
