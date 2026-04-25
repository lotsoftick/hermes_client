import { hermesExec, stripAnsi } from './cli';
import { CronJob, CronSchedule, AddCronBody } from '../../@types/cron';

/**
 * `hermes cron list` is a small free-form table; columns vary across hermes
 * versions. We anchor on the leading id (numeric or short hash) and capture
 * the schedule and prompt as best we can. Disabled jobs are surfaced when
 * `--all` is passed; we leverage that for the toggle UI.
 */
function classifySchedule(scheduleString: string): CronSchedule {
  if (scheduleString.includes(' ')) return { kind: 'cron', cron: scheduleString };
  if (/^P?T?\d+[smhd]/i.test(scheduleString)) return { kind: 'every', every: scheduleString };
  return { kind: 'cron', cron: scheduleString };
}

function parseCronList(stdout: string): CronJob[] {
  return stripAnsi(stdout)
    .split('\n')
    .map((raw) => raw.replace(/^[\s│┃]+|[\s│┃]+$/g, ''))
    .filter(
      (line) =>
        line && !/^ID\b/i.test(line) && !/^[─━]/.test(line) && !/no scheduled jobs/i.test(line)
    )
    .map((line) => {
      const cols = line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
      if (cols.length < 2) return null;
      const id = cols[0];
      if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
      const enabled = !/(paused|disabled|✗)/i.test(line);
      return {
        id,
        name: cols[2] || '',
        enabled,
        schedule: classifySchedule(cols[1] || ''),
        prompt: cols.slice(3).join(' — '),
      } satisfies CronJob;
    })
    .filter((j): j is CronJob => j !== null);
}

export function listCronJobs(profile?: string | null): CronJob[] {
  const result = hermesExec(['cron', 'list', '--all'], { profile: profile ?? null });
  if (!result.ok) return [];
  return parseCronList(result.stdout);
}

function scheduleArg(body: AddCronBody): string | null {
  if (body.cron) return body.cron;
  if (body.every) return body.every.startsWith('every ') ? body.every : `every ${body.every}`;
  if (body.at) return body.at;
  return null;
}

export function addCronJob(body: AddCronBody): { ok: boolean; error?: string } {
  const schedule = scheduleArg(body);
  if (!schedule) return { ok: false, error: 'A cron/every/at schedule is required' };
  const args = ['cron', 'create'];
  if (body.name) args.push('--name', body.name);
  args.push(schedule);
  if (body.message) args.push(body.message);
  const env: Record<string, string> | undefined = body.tz ? { TZ: body.tz } : undefined;
  const result = hermesExec(args, { profile: body.profile ?? null, env, timeoutMs: 60000 });
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || result.error };
  return { ok: true };
}

export function removeCronJob(
  id: string,
  profile?: string | null
): { ok: boolean; error?: string } {
  const result = hermesExec(['cron', 'remove', id], { profile: profile ?? null });
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || result.error };
  return { ok: true };
}

export function toggleCronJob(
  id: string,
  enable: boolean,
  profile?: string | null
): { ok: boolean; error?: string } {
  const sub = enable ? 'resume' : 'pause';
  const result = hermesExec(['cron', sub, id], { profile: profile ?? null });
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || result.error };
  return { ok: true };
}
