import fs from 'fs';
import path from 'path';
import { hermesExec, stripAnsi } from './cli';
import { HERMES_HOME, profileHome } from './paths';

export interface HermesProfile {
  /** Profile name as passed to `hermes -p <name>`. `default` is the implicit one. */
  name: string;
  /** Currently selected default model, or null if not configured. */
  model: string | null;
  /** Whether the profile directory exists on disk. */
  exists: boolean;
  /** Created-at timestamp from the profile dir mtime, when known. */
  createdAt: Date;
}

const NAME_RE = /^[a-z0-9][a-z0-9-_]*$/;

export function toProfileName(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'agent'
  );
}

export function isValidProfileName(name: string): boolean {
  return NAME_RE.test(name);
}

/**
 * Parse `hermes profile list` table output. Columns are
 *   Profile, Model, Gateway, Alias
 * with the active profile prefixed by ◆. Layout varies (rich rendering),
 * so we tokenize on 2+ spaces and skip header/divider rows.
 */
function parseProfileList(stdout: string): { name: string; model: string | null }[] {
  return stripAnsi(stdout)
    .split('\n')
    .map((raw) => raw.replace(/^[\s│┃]+|[\s│┃]+$/g, ''))
    .filter((line) => line && !/^Profile\s+Model/i.test(line) && !/^[─━┯┰]/.test(line))
    .map((line) => line.replace(/^[◆◇•·*\s]+/, '').split(/\s{2,}/).filter(Boolean))
    .filter((cols) => cols.length && (cols[0] === 'default' || isValidProfileName(cols[0])))
    .map((cols) => {
      const rawModel = cols[1] ?? '';
      const model = !rawModel || rawModel === '—' || rawModel === '-' ? null : rawModel;
      return { name: cols[0], model };
    });
}

function statCreatedAt(profile: string): Date {
  const dir = profileHome(profile);
  try {
    return fs.statSync(dir).birthtime;
  } catch {
    return new Date();
  }
}

export function listProfiles(): HermesProfile[] {
  const result = hermesExec(['profile', 'list']);
  if (!result.ok) return [];
  const parsed = parseProfileList(result.stdout);
  return parsed.map(({ name, model }) => ({
    name,
    model,
    exists: fs.existsSync(profileHome(name)),
    createdAt: statCreatedAt(name),
  }));
}

export function getProfile(name: string): HermesProfile | null {
  const all = listProfiles();
  return all.find((p) => p.name === name) ?? null;
}

export function getProfileModel(name: string): string | null {
  return getProfile(name)?.model ?? null;
}

export function getProfileModels(names: string[]): Record<string, string | null> {
  const all = listProfiles();
  const map = new Map(all.map((p) => [p.name, p.model]));
  return names.reduce<Record<string, string | null>>((acc, n) => {
    acc[n] = map.get(n) ?? null;
    return acc;
  }, {});
}

export interface CreateProfileResult {
  ok: boolean;
  error?: string;
}

export function createProfile(name: string): CreateProfileResult {
  if (!isValidProfileName(name)) {
    return { ok: false, error: 'Profile name must be lowercase alphanumeric (with - or _).' };
  }
  if (name === 'default') return { ok: true };
  if (getProfile(name)) return { ok: true };
  const result = hermesExec(['profile', 'create', '--no-alias', name], { timeoutMs: 60000 });
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || result.error };
  return { ok: true };
}

export function deleteProfile(name: string): CreateProfileResult {
  if (name === 'default') return { ok: false, error: 'Cannot delete the default profile' };
  const result = hermesExec(['profile', 'delete', '-y', name], { timeoutMs: 30000 });
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || result.error };
  return { ok: true };
}

export function renameProfile(oldName: string, newName: string): CreateProfileResult {
  if (oldName === newName) return { ok: true };
  if (!isValidProfileName(newName)) {
    return { ok: false, error: 'Profile name must be lowercase alphanumeric (with - or _).' };
  }
  const result = hermesExec(['profile', 'rename', oldName, newName], { timeoutMs: 30000 });
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || result.error };
  return { ok: true };
}

export function profileExists(name: string): boolean {
  return fs.existsSync(profileHome(name));
}

export function ensureProfilesDirectoryWritable(): { ok: boolean; error?: string } {
  try {
    fs.accessSync(HERMES_HOME, fs.constants.W_OK);
    return { ok: true };
  } catch {
    return { ok: false, error: `${HERMES_HOME} is not writable. Is hermes installed?` };
  }
}

/** Resolve the absolute sessions-store path for a profile. */
export function profileSessionsDir(profile: string | undefined | null): string {
  return path.join(profileHome(profile), 'sessions');
}
