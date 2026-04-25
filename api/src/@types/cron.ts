import { RequestHandler } from 'express';

/**
 * Schedule shape — exactly one of `cron`/`every`/`at` is set. We keep the
 * raw string the user typed (`hermes cron create` accepts the same forms:
 * `30m`, `every 2h`, `0 9 * * *`, an ISO datetime).
 */
export interface CronSchedule {
  kind: 'cron' | 'every' | 'at';
  cron?: string;
  every?: string;
  at?: string;
}

export interface CronJob {
  id: string;
  /** Hermes profile this job belongs to (empty/undefined = default). */
  profile?: string;
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  prompt: string;
  /** Free-form metadata for fields hermes returns we don't model explicitly. */
  meta?: Record<string, string>;
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

export type ToggleCronBody = { enable: boolean };
export type CronOpResult = { ok: boolean; error?: string };

export type List = RequestHandler<never, CronListResponse, never, never>;
export type Add = RequestHandler<never, CronOpResult, AddCronBody, never>;
export type Remove = RequestHandler<{ id: string }, CronOpResult, never, never>;
export type Toggle = RequestHandler<{ id: string }, CronOpResult, ToggleCronBody, never>;
