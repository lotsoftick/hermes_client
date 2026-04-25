import { RequestHandler } from 'express';

/**
 * Schedule shape — exactly one of `cron`/`every`/`at` is set, mirroring the
 * three creation forms `hermes cron create` accepts (`30m`, `every 2h`,
 * `0 9 * * *`, ISO datetime). `everyMs`/`anchorMs` decorate the recurring
 * case so the UI can show a relative countdown without re-parsing.
 */
export interface CronSchedule {
  kind: 'cron' | 'every' | 'at' | 'unknown';
  cron?: string;
  every?: string;
  everyMs?: number;
  at?: string;
  /** Human-readable label as Hermes wrote it, e.g. "every 1m". */
  display?: string;
}

export interface CronJobState {
  lastRunAtMs?: number;
  lastRunStatus?: string;
  lastError?: string;
  lastDeliveryError?: string;
  nextRunAtMs?: number;
}

export interface CronJobPayload {
  message?: string;
}

export interface CronJob {
  id: string;
  /** Hermes profile this job belongs to. `default` for the implicit one. */
  profile: string;
  name: string;
  enabled: boolean;
  /** True for one-shot ("at") jobs that are removed after firing once. */
  deleteAfterRun: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  payload: CronJobPayload;
  state: CronJobState;
}

export interface CronListResponse {
  jobs: CronJob[];
  total: number;
}

export type AddCronBody = {
  name?: string;
  message?: string;
  profile?: string;
  cron?: string;
  every?: string;
  at?: string;
  tz?: string;
};

export type ToggleCronBody = { enable: boolean; profile?: string };
export type RemoveCronQuery = { profile?: string };
export type CronOpResult = { ok: boolean; error?: string };

/**
 * Status of a single profile's gateway daemon. Hermes runs one gateway per
 * profile — each has its own launchd/systemd unit, its own scheduler, and
 * only sees jobs in its own jobs.json. So a job in profile `foo` will only
 * fire if `foo`'s gateway is alive, regardless of any other profile's
 * state.
 */
export interface GatewayProfileStatus {
  profile: string;
  running: boolean;
  /** Raw `hermes -p <profile> gateway status` output. */
  raw: string;
  /** Set when the status command itself failed. */
  error?: string;
  /** Job count in this profile (0 if profile has no scheduled jobs). */
  jobCount: number;
}

/**
 * Aggregate gateway status across every profile that owns cron jobs (plus
 * the default profile, even if it has no jobs, so the user can see the
 * full picture). The UI uses `profilesMissingGateway` to drive its banner
 * — these are the only profiles whose missing gateway actually breaks a
 * scheduled job today.
 */
export interface GatewayStatus {
  profiles: GatewayProfileStatus[];
  /** True iff every profile that *has* at least one job has a live gateway. */
  allJobsCovered: boolean;
  /** Profiles with at least one job whose gateway isn't running. */
  profilesMissingGateway: string[];
  /** Profiles with at least one job whose gateway IS running. */
  profilesWithGateway: string[];
}

export type GatewayOpResult = {
  ok: boolean;
  error?: string;
  raw: string;
  /** Per-profile breakdown for batch start/stop calls. */
  profiles?: { profile: string; ok: boolean; error?: string; raw: string }[];
};

export type GatewayOpBody = { profile?: string };

/**
 * One execution of a cron job. Each tick of the Hermes scheduler runs the
 * job in a fresh isolated session named `session_cron_<jobId>_<datetime>.json`,
 * so a "run" is just that session file flattened to the bits the UI cares
 * about: when it ran, what the agent said, and whether it errored.
 */
export interface CronRun {
  /** Stable id derived from the session filename (`cron_<jobId>_<datetime>`). */
  id: string;
  /** Session id (same as `id`); kept distinct so the UI could deep-link. */
  sessionId: string;
  ranAtMs: number;
  /** The model's final reply. Empty if Hermes only emitted tool calls / nothing usable. */
  response: string;
  /** Set when the session's last assistant turn looks like an error. */
  error?: string;
  /** Number of messages in the session — handy for "this run made N tool calls" hints. */
  messageCount: number;
}

export interface CronRunsResponse {
  runs: CronRun[];
}

export type CronRunsQuery = { profile?: string; limit?: string };

export type List = RequestHandler<never, CronListResponse, never, never>;
export type Add = RequestHandler<never, CronOpResult, AddCronBody, never>;
export type Remove = RequestHandler<{ id: string }, CronOpResult, never, RemoveCronQuery>;
export type Toggle = RequestHandler<{ id: string }, CronOpResult, ToggleCronBody, never>;
export type GetRuns = RequestHandler<{ id: string }, CronRunsResponse, never, CronRunsQuery>;
export type GetGateway = RequestHandler<never, GatewayStatus, never, never>;
export type StartGateway = RequestHandler<never, GatewayOpResult, GatewayOpBody, never>;
export type StopGateway = RequestHandler<never, GatewayOpResult, GatewayOpBody, never>;
