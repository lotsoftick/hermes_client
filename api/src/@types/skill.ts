import { RequestHandler } from 'express';

/** Source bucket reported by `hermes skills list`. */
export type SkillSource = 'hub' | 'builtin' | 'local' | 'unknown';

/** A row from `hermes skills list --source all`. */
export interface SkillInfo {
  name: string;
  category: string;
  source: SkillSource;
  trust: string;
}

export type List = RequestHandler<never, SkillInfo[], never, never>;
