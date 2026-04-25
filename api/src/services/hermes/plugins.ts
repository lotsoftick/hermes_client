import { hermesExec, stripAnsi } from './cli';
import { PluginInfo } from '../../@types/plugin';

/** Split a `│ a │ b │ c │` row into trimmed cell strings. */
function rowCells(line: string): string[] {
  const cells = line.split('│').map((c) => c.trim());
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

/**
 * Parse `hermes plugins list`. Columns: Name | Status | Version | Description | Source.
 * Description wraps across rows; continuation rows have an empty Name cell, so we
 * accumulate their Description into the previous plugin and squash extra spaces.
 */
function parsePluginsTable(stdout: string): PluginInfo[] {
  type Acc = { plugins: PluginInfo[]; current: PluginInfo | null };
  return stripAnsi(stdout)
    .split('\n')
    .filter((line) => line.includes('│'))
    .map(rowCells)
    .reduce<Acc>(
      (acc, cells) => {
        if (cells.length < 5) return acc;
        const [name, status, version, description, source] = cells;
        if (!name) {
          if (acc.current && description) {
            acc.current.description = `${acc.current.description} ${description}`
              .replace(/\s+/g, ' ')
              .trim();
          }
          return acc;
        }
        if (name.toLowerCase() === 'name') return acc;
        const plugin: PluginInfo = {
          name,
          status: status || 'unknown',
          version: version || '',
          description: description || '',
          source: source || '',
          enabled: !/not enabled|disabled/i.test(status || ''),
        };
        acc.plugins.push(plugin);
        acc.current = plugin;
        return acc;
      },
      { plugins: [], current: null }
    ).plugins;
}

export function listPlugins(profile?: string | null): PluginInfo[] {
  const result = hermesExec(['plugins', 'list'], { profile: profile ?? null });
  if (!result.ok) return [];
  return parsePluginsTable(result.stdout);
}

export function enablePlugin(
  name: string,
  profile?: string | null
): { ok: boolean; error?: string } {
  const result = hermesExec(['plugins', 'enable', name], { profile: profile ?? null });
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || result.error };
  return { ok: true };
}

export function disablePlugin(
  name: string,
  profile?: string | null
): { ok: boolean; error?: string } {
  const result = hermesExec(['plugins', 'disable', name], { profile: profile ?? null });
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || result.error };
  return { ok: true };
}
