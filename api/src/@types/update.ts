import { RequestHandler } from 'express';

export interface VersionMeta {
  version: string;
  sourceRepo: string;
}

export interface UpdateStatus {
  available: boolean;
  current: string;
  latest: string;
  checkedAt: string | null;
}

export type UpdateOpResult = { ok: boolean; error?: string };

export type Status = RequestHandler<never, UpdateStatus, never, never>;
export type Check = RequestHandler<never, UpdateStatus, never, never>;
export type Apply = RequestHandler<never, UpdateOpResult, never, never>;
