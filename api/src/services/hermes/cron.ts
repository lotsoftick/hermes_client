import fs from 'fs';
import path from 'path';
import { hermesExec } from './cli';
import { HERMES_HOME, profileHome } from './paths';
import {
  CronJob,
  CronJobState,
  CronSchedule,
  CronRun,
  AddCronBody,
  GatewayStatus,
  GatewayProfileStatus,
  GatewayOpResult,
} from '../../@types/cron';
import { profileSessionsDir } from './profiles';
import { cleanMessageText } from './textCleanup';
import {
  readGatewayStatusFor,
  startProfileGateway,
  stopProfileGateway,
} from './gateway';

/**
 * We bypass `hermes cron list` and read the on-disk JSON directly. Three
 * reasons:
 *   1. `cron list` is profile-scoped — without `--profile foo` it only sees
 *      default-profile jobs, so listing across all profiles via the CLI
 *      would mean N+1 process spawns. Reading the JSON files is one fs walk.
 *   2. The CLI output is a multi-line human-formatted block per job, not a
 *      single-row table — fragile to parse and missing fields like
 *      next_run_at, last_status, last_error, deliver, etc.
 *   3. The on-disk schema is the authoritative source — `hermes cron`
 *      itself reads/writes these files, so we get every field hermes knows
 *      about (state, next/last run, errors, repeat, …).
 *
 * Layout (Hermes ≥ 0.13):
 *   ~/.hermes/cron/jobs.json                      — default profile
 *   ~/.hermes/profiles/<name>/cron/jobs.json      — per-profile
 */

interface FileSchedule {
  kind?: string;
  minutes?: number;
  expr?: string;
  run_at?: string;
  display?: string;
}

interface FileRepeat {
  times?: number | null;
}

interface FileJob {
  id?: string;
  name?: string;
  prompt?: string;
  enabled?: boolean;
  state?: string;
  paused_at?: string | null;
  created_at?: string;
  updated_at?: string;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_status?: string | null;
  last_error?: string | null;
  last_delivery_error?: string | null;
  schedule?: FileSchedule;
  schedule_display?: string;
  repeat?: FileRepeat;
  deliver?: string;
}

interface FileEnvelope {
  jobs?: FileJob[];
  updated_at?: string;
}

function jobsFileFor(profile: string): string {
  return path.join(profileHome(profile === 'default' ? null : profile), 'cron', 'jobs.json');
}

function safeReadJobsFile(file: string): FileEnvelope | null {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw) as FileEnvelope;
  } catch {
    // Missing or unreadable. Empty profiles never create the file until
    // their first job, so absence is the common case — not an error.
    return null;
  }
}

function listProfileNames(): string[] {
  const profilesDir = path.join(HERMES_HOME, 'profiles');
  let entries: string[] = [];
  try {
    entries = fs
      .readdirSync(profilesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    entries = [];
  }
  // Always include the implicit default profile, listed first.
  return ['default', ...entries.filter((n) => n !== 'default')];
}

function toMs(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
}

function normalizeSchedule(raw: FileSchedule | undefined): CronSchedule {
  const display = raw?.display;
  const kind = raw?.kind;
  if (kind === 'interval' && typeof raw?.minutes === 'number') {
    const { minutes } = raw;
    return {
      kind: 'every',
      every: `${minutes}m`,
      everyMs: minutes * 60 * 1000,
      display: display || `every ${minutes}m`,
    };
  }
  if (kind === 'cron' && raw?.expr) {
    return { kind: 'cron', cron: raw.expr, display: display || raw.expr };
  }
  if (kind === 'once' && raw?.run_at) {
    return { kind: 'at', at: raw.run_at, display: display || `once at ${raw.run_at}` };
  }
  return { kind: 'unknown', display: display || kind || 'unknown' };
}

function normalizeJob(raw: FileJob, profile: string): CronJob | null {
  if (!raw.id) return null;
  const enabled = raw.enabled !== false && raw.state !== 'paused' && !raw.paused_at;
  const state: CronJobState = {
    lastRunAtMs: toMs(raw.last_run_at),
    lastRunStatus: raw.last_status || undefined,
    lastError: raw.last_error || undefined,
    lastDeliveryError: raw.last_delivery_error || undefined,
    nextRunAtMs: toMs(raw.next_run_at),
  };
  return {
    id: raw.id,
    profile,
    name: raw.name || '',
    enabled,
    deleteAfterRun: raw.repeat?.times === 1,
    createdAtMs: toMs(raw.created_at) ?? 0,
    updatedAtMs: toMs(raw.updated_at) ?? toMs(raw.created_at) ?? 0,
    schedule: normalizeSchedule(raw.schedule),
    payload: { message: raw.prompt || undefined },
    state,
  };
}

/**
 * Read jobs from every profile (+ default) and merge. Sort newest-first so
 * the most recent additions are visible without scrolling.
 */
export function listCronJobs(): CronJob[] {
  const profiles = listProfileNames();
  const all: CronJob[] = [];
  profiles.forEach((profile) => {
    const env = safeReadJobsFile(jobsFileFor(profile));
    if (!env?.jobs?.length) return;
    env.jobs.forEach((row) => {
      const job = normalizeJob(row, profile);
      if (job) all.push(job);
    });
  });
  return all.sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/**
 * Find which profile owns a given job id by scanning the on-disk files.
 * The CLI's remove/pause/resume commands are profile-scoped and silently
 * succeed even when the id doesn't exist in the targeted profile, so we
 * have to identify ownership ourselves before invoking them.
 */
function findJobProfile(id: string, hint?: string | null): string | null {
  const tryFirst = hint ? [hint, ...listProfileNames().filter((n) => n !== hint)] : listProfileNames();
  return (
    tryFirst.find((profile) => {
      const env = safeReadJobsFile(jobsFileFor(profile));
      return !!env?.jobs?.some((j) => j.id === id);
    }) ?? null
  );
}

/**
 * List recent runs of a cron job by scanning its profile's sessions
 * directory. Each Hermes scheduler tick spawns a one-shot session named
 * `session_cron_<jobId>_<YYYYMMDD>_<HHMMSS>.json`, so we can find every
 * historical run by glob alone — no Hermes CLI involvement needed.
 *
 * Cron sessions are deliberately NOT picked up by `discoverProfileSessions`
 * (its session-id regex only matches the standard `<datetime>_<hex>` form),
 * because a once-a-minute job would otherwise spam the conversation
 * sidebar with one new entry per minute. Surfacing them here keeps cron
 * outputs scoped to the cron panel where they belong.
 */
const CRON_SESSION_RE = /^session_(cron_([a-f0-9]+)_(\d{8})_(\d{6}))\.json$/;

interface RawCronSession {
  messages?: { role?: string; content?: unknown; text?: string }[];
  last_updated?: string;
  session_start?: string;
}

function flattenContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const p = part as { text?: string; content?: unknown };
          if (typeof p.text === 'string') return p.text;
          if (p.content !== undefined) return flattenContent(p.content);
        }
        return '';
      })
      .join('');
  }
  return '';
}

function parseRunDateMs(dateStr: string, timeStr: string): number {
  // dateStr=YYYYMMDD, timeStr=HHMMSS — Hermes writes these in local time.
  const y = Number(dateStr.slice(0, 4));
  const mo = Number(dateStr.slice(4, 6)) - 1;
  const d = Number(dateStr.slice(6, 8));
  const h = Number(timeStr.slice(0, 2));
  const mi = Number(timeStr.slice(2, 4));
  const s = Number(timeStr.slice(4, 6));
  return new Date(y, mo, d, h, mi, s).getTime();
}

export function listCronRuns(
  jobId: string,
  profile?: string | null,
  limit = 25
): CronRun[] {
  const owner = findJobProfile(jobId, profile) ?? profile ?? 'default';
  const dir = profileSessionsDir(owner === 'default' ? null : owner);
  if (!fs.existsSync(dir)) return [];

  const matches = fs
    .readdirSync(dir)
    .map((file) => {
      const m = file.match(CRON_SESSION_RE);
      if (!m || m[2] !== jobId) return null;
      return { file, sessionId: m[1], dateStr: m[3], timeStr: m[4] };
    })
    .filter((x): x is { file: string; sessionId: string; dateStr: string; timeStr: string } =>
      x !== null
    )
    // Newest first, then cap. Sorting on the encoded datetime is faster
    // than statting and gives the same ordering for these names.
    .sort((a, b) =>
      a.dateStr === b.dateStr ? b.timeStr.localeCompare(a.timeStr) : b.dateStr.localeCompare(a.dateStr)
    )
    .slice(0, limit);

  return matches.flatMap<CronRun>(({ file, sessionId, dateStr, timeStr }) => {
    let data: RawCronSession;
    try {
      data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as RawCronSession;
    } catch {
      return [];
    }
    const messages = data.messages ?? [];
    // Last assistant turn is "what the agent ended up saying" — the bit
    // the user actually wants to see. Tool calls and intermediate
    // reasoning are deliberately hidden; this is a glanceable digest,
    // not a full session viewer.
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const rawResponse = lastAssistant
      ? (lastAssistant.text ?? flattenContent(lastAssistant.content)).trim()
      : '';
    const response = cleanMessageText('assistant', rawResponse);
    const error = (() => {
      if (response) return undefined;
      // Empty response usually means the model bailed (rate limit, auth,
      // tool-call loop, etc.) — surface a hint so the user knows where
      // to look without needing to open the session JSON.
      const lastNonAssistant = [...messages].reverse().find((m) => m.role && m.role !== 'user');
      const txt = lastNonAssistant
        ? (lastNonAssistant.text ?? flattenContent(lastNonAssistant.content)).trim()
        : '';
      return txt || 'No assistant response recorded for this run.';
    })();

    const ranAtMs =
      (data.last_updated && Date.parse(data.last_updated)) ||
      (data.session_start && Date.parse(data.session_start)) ||
      parseRunDateMs(dateStr, timeStr);

    return [
      {
        id: sessionId,
        sessionId,
        ranAtMs: Number.isFinite(ranAtMs) ? ranAtMs : parseRunDateMs(dateStr, timeStr),
        response,
        error,
        messageCount: messages.length,
      },
    ];
  });
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
  const owner = findJobProfile(id, profile);
  if (!owner) return { ok: false, error: `Cron job ${id} not found` };
  const result = hermesExec(['cron', 'remove', id], { profile: owner });
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || result.error };
  return { ok: true };
}

export function toggleCronJob(
  id: string,
  enable: boolean,
  profile?: string | null
): { ok: boolean; error?: string } {
  const owner = findJobProfile(id, profile);
  if (!owner) return { ok: false, error: `Cron job ${id} not found` };
  const sub = enable ? 'resume' : 'pause';
  const result = hermesExec(['cron', sub, id], { profile: owner });
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || result.error };
  return { ok: true };
}

/**
 * Aggregate gateway state across every profile that has at least one cron
 * job (plus `default` for visibility). This is what the UI uses to decide
 * which gateways need starting — covering only profiles whose missing
 * gateway is actually breaking a job.
 */
export function getGatewayStatus(): GatewayStatus {
  const jobs = listCronJobs();
  const jobsByProfile = new Map<string, number>();
  jobs.forEach((j) => jobsByProfile.set(j.profile, (jobsByProfile.get(j.profile) || 0) + 1));
  // Always include the default profile in the breakdown so the UI can
  // display "no gateways needed yet" cleanly when the user hasn't created
  // any jobs.
  if (!jobsByProfile.has('default')) jobsByProfile.set('default', 0);

  // Sort with `default` first, then alphabetical — keeps the UI's
  // profile list stable across renders without nesting ternaries.
  function compareProfileNames(a: string, b: string): number {
    if (a === 'default') return -1;
    if (b === 'default') return 1;
    return a.localeCompare(b);
  }
  const profiles: GatewayProfileStatus[] = Array.from(jobsByProfile.entries())
    .sort(([a], [b]) => compareProfileNames(a, b))
    .map(([profile, jobCount]) => ({ ...readGatewayStatusFor(profile), jobCount }));

  const profilesMissingGateway = profiles
    .filter((p) => p.jobCount > 0 && !p.running)
    .map((p) => p.profile);
  const profilesWithGateway = profiles
    .filter((p) => p.jobCount > 0 && p.running)
    .map((p) => p.profile);
  const allJobsCovered = profilesMissingGateway.length === 0;

  return { profiles, allJobsCovered, profilesMissingGateway, profilesWithGateway };
}

/**
 * Start gateway(s). When `profile` is provided we target only that
 * profile; otherwise we start a gateway for every profile that has at
 * least one job *and* doesn't already have a running daemon. The UI's
 * single "Start gateway" button drives the multi-profile path so users
 * don't have to think about Hermes's per-profile architecture.
 */
export async function startGateway(profile?: string | null): Promise<GatewayOpResult> {
  if (profile) {
    const result = await startProfileGateway(profile);
    return { ...result, profiles: [{ profile, ...result }] };
  }
  const status = getGatewayStatus();
  const targets = status.profilesMissingGateway;
  if (!targets.length) {
    return { ok: true, raw: 'Every profile with cron jobs already has a running gateway.' };
  }
  const results = await Promise.all(
    targets.map(async (p) => ({ profile: p, ...(await startProfileGateway(p)) }))
  );
  const ok = results.every((r) => r.ok);
  const raw = results.map((r) => `# ${r.profile}\n${r.raw}`).join('\n\n---\n\n');
  const error = ok
    ? undefined
    : results
        .filter((r) => !r.ok)
        .map((r) => `${r.profile}: ${r.error || 'unknown error'}`)
        .join('; ');
  return { ok, error, raw, profiles: results };
}

/**
 * Stop gateway(s). When `profile` is provided we stop only that profile;
 * otherwise we stop every profile that currently has a running gateway.
 */
export function stopGateway(profile?: string | null): GatewayOpResult {
  if (profile) {
    const result = stopProfileGateway(profile);
    return { ...result, profiles: [{ profile, ...result }] };
  }
  const status = getGatewayStatus();
  const targets = status.profilesWithGateway;
  if (!targets.length) return { ok: true, raw: 'No running gateways to stop.' };
  const results = targets.map((p) => ({ profile: p, ...stopProfileGateway(p) }));
  const ok = results.every((r) => r.ok);
  const raw = results.map((r) => `# ${r.profile}\n${r.raw}`).join('\n\n---\n\n');
  const error = ok
    ? undefined
    : results
        .filter((r) => !r.ok)
        .map((r) => `${r.profile}: ${r.error || 'unknown error'}`)
        .join('; ');
  return { ok, error, raw, profiles: results };
}
