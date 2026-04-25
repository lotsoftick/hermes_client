import { hermesExec, stripAnsi } from './cli';
import { SkillInfo, SkillSource } from '../../@types/skill';

const KNOWN_SOURCES: SkillSource[] = ['hub', 'builtin', 'local'];

function normalizeSource(value: string): SkillSource {
  const lower = value.trim().toLowerCase();
  return (KNOWN_SOURCES as readonly string[]).includes(lower)
    ? (lower as SkillSource)
    : 'unknown';
}

/**
 * Parse a `hermes skills list` row. The CLI renders a Rich box table with
 * `│`/`┃` column separators (Unicode, not ASCII `|`):
 *
 *   `│ name │ category │ source │ trust │`
 *
 * We split on the box character, trim each cell, and only keep rows whose
 * first cell is a plausible skill identifier.
 */
function parseSkillsTable(stdout: string): SkillInfo[] {
  return stripAnsi(stdout)
    .split('\n')
    .filter((line) => line.includes('│'))
    .map((line) => {
      const cells = line.split('│').map((c) => c.trim());
      if (cells.length && cells[0] === '') cells.shift();
      if (cells.length && cells[cells.length - 1] === '') cells.pop();
      return cells;
    })
    .filter((cells) => cells.length >= 3 && /^[a-z0-9][a-z0-9._\-/]*$/i.test(cells[0]))
    .map(([name, category, source, trust]) => ({
      name,
      category: category ?? '',
      source: normalizeSource(source ?? ''),
      trust: trust ?? '',
    }));
}

export function listSkills(profile?: string | null): SkillInfo[] {
  const result = hermesExec(['skills', 'list', '--source', 'all'], { profile: profile ?? null });
  if (!result.ok) return [];
  return parseSkillsTable(result.stdout);
}

export default listSkills;
