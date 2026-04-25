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
    cmd: 'login',
    label: 'Sign in to provider',
    hint: 'hermes login',
    description: 'Run an OAuth login for the selected inference provider.',
  },
  {
    cmd: 'auth',
    label: 'Manage credentials',
    hint: 'hermes auth',
    description: 'Add, list, or remove pooled credentials for this profile.',
  },
  {
    cmd: 'config',
    label: 'Edit profile config',
    hint: 'hermes config',
    description: 'View or edit the profile’s config.yaml from a guided prompt.',
  },
  {
    cmd: 'doctor',
    label: 'Run doctor',
    hint: 'hermes doctor',
    description: 'Check that everything is wired up correctly for this profile.',
  },
  {
    cmd: 'setup',
    label: 'Full setup wizard',
    hint: 'hermes setup',
    description: 'Run the complete Hermes setup wizard. Affects global Hermes state.',
  },
];
