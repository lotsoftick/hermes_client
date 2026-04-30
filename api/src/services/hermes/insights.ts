import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { In, IsNull } from 'typeorm';
import AppDataSource from '../../data-source';
import { Agent, Conversation } from '../../entities';
import { HERMES_HOME, profileHome } from './paths';
import type {
  AgentSpendRow,
  AgentsSpendResponse,
  DailyBucket,
  InsightsResponse,
  InsightsSummary,
  ModelBreakdown,
  ProfileBreakdown,
  SourceBreakdown,
  SpendCaps,
  SpendWindows,
  TopSession,
} from '../../@types/insights';

/**
 * Hermes maintains its own analytics SQLite (`state.db`) per profile.
 * The schema is documented in the Hermes repo; we only read columns
 * that have been stable across versions (input/output tokens, cost,
 * timestamps, model, source). The `schema_version.version` value at
 * the time of writing is `11`.
 *
 * We deliberately read these databases through `better-sqlite3` in
 * `readonly` mode rather than shelling out to `hermes insights`,
 * because the CLI's text output:
 *   - omits dollar amounts entirely,
 *   - groups activity only by weekday (no daily / per-date buckets),
 *   - has no per-session ranking by cost.
 *
 * All three are necessary for the in-app Insights page. The DB has
 * them all.
 */

const EMPTY_SUMMARY: InsightsSummary = {
  sessions: 0,
  messages: 0,
  toolCalls: 0,
  apiCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
  actualCostUsd: 0,
  costUsd: 0,
  activeTimeMs: 0,
};

const SUMMARY_SQL = `
  SELECT
    COUNT(*)                                                        AS sessions,
    COALESCE(SUM(message_count), 0)                                 AS messages,
    COALESCE(SUM(tool_call_count), 0)                               AS toolCalls,
    COALESCE(SUM(api_call_count), 0)                                AS apiCalls,
    COALESCE(SUM(input_tokens), 0)                                  AS inputTokens,
    COALESCE(SUM(output_tokens), 0)                                 AS outputTokens,
    COALESCE(SUM(cache_read_tokens), 0)                             AS cacheReadTokens,
    COALESCE(SUM(cache_write_tokens), 0)                            AS cacheWriteTokens,
    COALESCE(SUM(reasoning_tokens), 0)                              AS reasoningTokens,
    COALESCE(SUM(estimated_cost_usd), 0)                            AS estimatedCostUsd,
    COALESCE(SUM(actual_cost_usd), 0)                               AS actualCostUsd,
    COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)), 0) AS costUsd,
    COALESCE(SUM(MAX(0, COALESCE(ended_at, started_at) - started_at)), 0) AS activeTimeSec
  FROM sessions
  WHERE started_at >= ?
` as const;

const DAILY_SQL = `
  SELECT
    date(started_at, 'unixepoch', 'localtime')                       AS date,
    COUNT(*)                                                          AS sessions,
    COALESCE(SUM(input_tokens), 0)                                    AS inputTokens,
    COALESCE(SUM(output_tokens), 0)                                   AS outputTokens,
    COALESCE(SUM(input_tokens + output_tokens
      + COALESCE(cache_read_tokens, 0)
      + COALESCE(cache_write_tokens, 0)
      + COALESCE(reasoning_tokens, 0)), 0)                            AS totalTokens,
    COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)), 0) AS costUsd
  FROM sessions
  WHERE started_at >= ?
  GROUP BY date
  ORDER BY date
` as const;

const BY_MODEL_SQL = `
  SELECT
    COALESCE(NULLIF(model, ''), 'unknown')                            AS model,
    COUNT(*)                                                          AS sessions,
    COALESCE(SUM(input_tokens), 0)                                    AS inputTokens,
    COALESCE(SUM(output_tokens), 0)                                   AS outputTokens,
    COALESCE(SUM(input_tokens + output_tokens
      + COALESCE(cache_read_tokens, 0)
      + COALESCE(cache_write_tokens, 0)
      + COALESCE(reasoning_tokens, 0)), 0)                            AS totalTokens,
    COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)), 0) AS costUsd
  FROM sessions
  WHERE started_at >= ?
  GROUP BY model
  ORDER BY costUsd DESC, totalTokens DESC, sessions DESC
` as const;

const BY_SOURCE_SQL = `
  SELECT
    COALESCE(NULLIF(source, ''), 'unknown')                           AS source,
    COUNT(*)                                                          AS sessions,
    COALESCE(SUM(message_count), 0)                                   AS messages,
    COALESCE(SUM(input_tokens + output_tokens
      + COALESCE(cache_read_tokens, 0)
      + COALESCE(cache_write_tokens, 0)
      + COALESCE(reasoning_tokens, 0)), 0)                            AS totalTokens,
    COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)), 0) AS costUsd
  FROM sessions
  WHERE started_at >= ?
  GROUP BY source
  ORDER BY costUsd DESC, totalTokens DESC, sessions DESC
` as const;

const TOP_SESSIONS_SQL = `
  SELECT
    id, model, source, title, started_at AS startedAt, ended_at AS endedAt,
    message_count AS messageCount,
    tool_call_count AS toolCallCount,
    (input_tokens + output_tokens
      + COALESCE(cache_read_tokens, 0)
      + COALESCE(cache_write_tokens, 0)
      + COALESCE(reasoning_tokens, 0)) AS totalTokens,
    COALESCE(actual_cost_usd, estimated_cost_usd) AS costUsd,
    cost_status AS costStatus
  FROM sessions
  WHERE started_at >= ?
  ORDER BY
    COALESCE(actual_cost_usd, estimated_cost_usd, 0) DESC,
    (input_tokens + output_tokens
      + COALESCE(cache_read_tokens, 0)
      + COALESCE(cache_write_tokens, 0)
      + COALESCE(reasoning_tokens, 0)) DESC,
    started_at DESC
  LIMIT ?
` as const;

const SCHEMA_VERSION_SQL = `SELECT version FROM schema_version LIMIT 1` as const;

/**
 * Single-number query used for the three rolling spend windows
 * (today / this month / all-time). Cheaper than re-issuing the full
 * SUMMARY_SQL three times — we only care about cost here.
 */
const COST_SINCE_SQL = `
  SELECT
    COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd, 0)), 0) AS costUsd
  FROM sessions
  WHERE started_at >= ?
` as const;

/* -------------------------------------------------------------------------- */
/* Profile enumeration                                                         */
/* -------------------------------------------------------------------------- */

function listProfiles(): string[] {
  const profilesDir = path.join(HERMES_HOME, 'profiles');
  let extra: string[] = [];
  try {
    extra = fs
      .readdirSync(profilesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => n !== 'default');
  } catch {
    extra = [];
  }
  return ['default', ...extra];
}

function statePathFor(profile: string): string {
  return path.join(profileHome(profile), 'state.db');
}

/* -------------------------------------------------------------------------- */
/* Time-window helpers                                                         */
/* -------------------------------------------------------------------------- */

const EMPTY_WINDOWS: SpendWindows = { dayUsd: 0, monthUsd: 0, allTimeUsd: 0 };

/**
 * Compute the unix-epoch *seconds* boundaries for the three rolling
 * spend windows. We resolve "midnight" and "first of the month" in
 * the server's local timezone — same convention `hermes insights`
 * uses for its day-bucketing — so the numbers line up between the
 * sidebar ring, the caps card, and the daily chart.
 */
function spendWindowBoundsSec(now = new Date()): {
  dayStart: number;
  monthStart: number;
} {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const month = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return {
    dayStart: Math.floor(day.getTime() / 1000),
    monthStart: Math.floor(month.getTime() / 1000),
  };
}

/* -------------------------------------------------------------------------- */
/* DB plumbing                                                                 */
/* -------------------------------------------------------------------------- */

interface OpenDb {
  db: Database.Database;
  schemaVersion: number | null;
}

/**
 * Open `state.db` read-only. Returns `null` if the file doesn't exist
 * yet (a profile that's never been chatted with) or if SQLite refuses
 * to open it (corruption, version mismatch).
 *
 * We use `fileMustExist: true` so we don't accidentally create empty
 * databases as a side effect of analytics queries. WAL files don't
 * need special handling — better-sqlite3 reads them transparently
 * even with `readonly: true`.
 */
function openProfileDb(profile: string): OpenDb | null {
  const file = statePathFor(profile);
  if (!fs.existsSync(file)) return null;
  let db: Database.Database;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }
  let schemaVersion: number | null = null;
  try {
    const row = db.prepare(SCHEMA_VERSION_SQL).get() as { version?: number } | undefined;
    schemaVersion = row?.version ?? null;
  } catch {
    schemaVersion = null;
  }
  return { db, schemaVersion };
}

/* -------------------------------------------------------------------------- */
/* Row → typed shape converters                                                */
/* -------------------------------------------------------------------------- */

interface SummaryRow {
  sessions: number;
  messages: number;
  toolCalls: number;
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  costUsd: number;
  activeTimeSec: number;
}

function toSummary(row: SummaryRow | undefined): InsightsSummary {
  if (!row) return { ...EMPTY_SUMMARY };
  const totalTokens =
    (row.inputTokens || 0) +
    (row.outputTokens || 0) +
    (row.cacheReadTokens || 0) +
    (row.cacheWriteTokens || 0) +
    (row.reasoningTokens || 0);
  return {
    sessions: row.sessions || 0,
    messages: row.messages || 0,
    toolCalls: row.toolCalls || 0,
    apiCalls: row.apiCalls || 0,
    inputTokens: row.inputTokens || 0,
    outputTokens: row.outputTokens || 0,
    cacheReadTokens: row.cacheReadTokens || 0,
    cacheWriteTokens: row.cacheWriteTokens || 0,
    reasoningTokens: row.reasoningTokens || 0,
    totalTokens,
    estimatedCostUsd: row.estimatedCostUsd || 0,
    actualCostUsd: row.actualCostUsd || 0,
    costUsd: row.costUsd || 0,
    activeTimeMs: Math.round((row.activeTimeSec || 0) * 1000),
  };
}

function addSummaries(a: InsightsSummary, b: InsightsSummary): InsightsSummary {
  return {
    sessions: a.sessions + b.sessions,
    messages: a.messages + b.messages,
    toolCalls: a.toolCalls + b.toolCalls,
    apiCalls: a.apiCalls + b.apiCalls,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    estimatedCostUsd: a.estimatedCostUsd + b.estimatedCostUsd,
    actualCostUsd: a.actualCostUsd + b.actualCostUsd,
    costUsd: a.costUsd + b.costUsd,
    activeTimeMs: a.activeTimeMs + b.activeTimeMs,
  };
}

/* -------------------------------------------------------------------------- */
/* Per-profile aggregation                                                     */
/* -------------------------------------------------------------------------- */

interface ProfileQueryResult {
  summary: InsightsSummary;
  daily: DailyBucket[];
  byModel: ModelBreakdown[];
  bySource: SourceBreakdown[];
  topSessions: Omit<TopSession, 'profile' | 'conversationId' | 'conversationAgentId'>[];
  spendWindows: SpendWindows;
  schemaVersion: number | null;
  hasData: boolean;
}

/**
 * Compute the three rolling spend windows for a single profile in
 * one DB open. Used both as a sub-step of `queryProfile` and as a
 * standalone helper for `getAgentsSpend`.
 */
function readSpendWindows(profile: string): SpendWindows {
  const open = openProfileDb(profile);
  if (!open) return { ...EMPTY_WINDOWS };
  const { db } = open;
  try {
    const { dayStart, monthStart } = spendWindowBoundsSec();
    const stmt = db.prepare(COST_SINCE_SQL);
    const day = (stmt.get(dayStart) as { costUsd?: number } | undefined)?.costUsd ?? 0;
    const month = (stmt.get(monthStart) as { costUsd?: number } | undefined)?.costUsd ?? 0;
    const all = (stmt.get(0) as { costUsd?: number } | undefined)?.costUsd ?? 0;
    return { dayUsd: day, monthUsd: month, allTimeUsd: all };
  } catch {
    return { ...EMPTY_WINDOWS };
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

function addWindows(a: SpendWindows, b: SpendWindows): SpendWindows {
  return {
    dayUsd: a.dayUsd + b.dayUsd,
    monthUsd: a.monthUsd + b.monthUsd,
    allTimeUsd: a.allTimeUsd + b.allTimeUsd,
  };
}

function queryProfile(
  profile: string,
  fromEpochSec: number,
  topN: number
): ProfileQueryResult {
  const open = openProfileDb(profile);
  if (!open) {
    return {
      summary: { ...EMPTY_SUMMARY },
      daily: [],
      byModel: [],
      bySource: [],
      topSessions: [],
      spendWindows: { ...EMPTY_WINDOWS },
      schemaVersion: null,
      hasData: false,
    };
  }
  const { db, schemaVersion } = open;
  try {
    const summaryRow = db.prepare(SUMMARY_SQL).get(fromEpochSec) as SummaryRow | undefined;
    const dailyRows = db.prepare(DAILY_SQL).all(fromEpochSec) as DailyBucket[];
    const modelRows = db.prepare(BY_MODEL_SQL).all(fromEpochSec) as ModelBreakdown[];
    const sourceRows = db.prepare(BY_SOURCE_SQL).all(fromEpochSec) as SourceBreakdown[];
    const { dayStart, monthStart } = spendWindowBoundsSec();
    const costStmt = db.prepare(COST_SINCE_SQL);
    const dayUsd = (costStmt.get(dayStart) as { costUsd?: number } | undefined)?.costUsd ?? 0;
    const monthUsd = (costStmt.get(monthStart) as { costUsd?: number } | undefined)?.costUsd ?? 0;
    const allTimeUsd = (costStmt.get(0) as { costUsd?: number } | undefined)?.costUsd ?? 0;
    const sessionRows = db.prepare(TOP_SESSIONS_SQL).all(fromEpochSec, topN) as Array<{
      id: string;
      model: string | null;
      source: string;
      title: string | null;
      startedAt: number;
      endedAt: number | null;
      messageCount: number;
      toolCallCount: number;
      totalTokens: number;
      costUsd: number | null;
      costStatus: string | null;
    }>;

    const topSessions = sessionRows.map((r) => ({
      hermesSessionId: r.id,
      model: r.model || null,
      source: r.source,
      title: r.title,
      startedAtMs: Math.round((r.startedAt || 0) * 1000),
      endedAtMs: r.endedAt != null ? Math.round(r.endedAt * 1000) : null,
      messageCount: r.messageCount || 0,
      toolCallCount: r.toolCallCount || 0,
      totalTokens: r.totalTokens || 0,
      costUsd: r.costUsd ?? null,
      costStatus: r.costStatus ?? null,
    }));

    return {
      summary: toSummary(summaryRow),
      daily: dailyRows.map((r) => ({
        date: r.date,
        sessions: r.sessions || 0,
        inputTokens: r.inputTokens || 0,
        outputTokens: r.outputTokens || 0,
        totalTokens: r.totalTokens || 0,
        costUsd: r.costUsd || 0,
      })),
      byModel: modelRows.map((r) => ({
        model: r.model,
        sessions: r.sessions || 0,
        inputTokens: r.inputTokens || 0,
        outputTokens: r.outputTokens || 0,
        totalTokens: r.totalTokens || 0,
        costUsd: r.costUsd || 0,
      })),
      bySource: sourceRows.map((r) => ({
        source: r.source,
        sessions: r.sessions || 0,
        messages: r.messages || 0,
        totalTokens: r.totalTokens || 0,
        costUsd: r.costUsd || 0,
      })),
      topSessions,
      spendWindows: { dayUsd, monthUsd, allTimeUsd },
      schemaVersion,
      hasData: true,
    };
  } catch {
    return {
      summary: { ...EMPTY_SUMMARY },
      daily: [],
      byModel: [],
      bySource: [],
      topSessions: [],
      spendWindows: { ...EMPTY_WINDOWS },
      schemaVersion,
      hasData: false,
    };
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Cross-cut helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Bucket the daily series so the chart always has one point per day,
 * even when no sessions ran (a flat zero is more honest than a gap).
 */
function fillDaily(daily: DailyBucket[], windowDays: number, toIso: string): DailyBucket[] {
  const byDate = new Map(daily.map((d) => [d.date, d]));
  const end = new Date(toIso);
  // Build [windowDays-1 … 0] then map each offset to a bucket so we
  // stay loop-free (airbnb-base disallows for-of) and array-based.
  return Array.from({ length: windowDays }, (_, idx) => windowDays - 1 - idx).map((offset) => {
    const d = new Date(end);
    d.setDate(end.getDate() - offset);
    const key = d.toISOString().slice(0, 10);
    return (
      byDate.get(key) || {
        date: key,
        sessions: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
      }
    );
  });
}

function compareDates(x: string, y: string): number {
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

/** Sum the `costUsd` across two daily-buckets keyed by date. */
function mergeDaily(a: DailyBucket[], b: DailyBucket[]): DailyBucket[] {
  const map = new Map<string, DailyBucket>();
  [...a, ...b].forEach((row) => {
    const cur = map.get(row.date);
    if (!cur) {
      map.set(row.date, { ...row });
      return;
    }
    cur.sessions += row.sessions;
    cur.inputTokens += row.inputTokens;
    cur.outputTokens += row.outputTokens;
    cur.totalTokens += row.totalTokens;
    cur.costUsd += row.costUsd;
  });
  return [...map.values()].sort((x, y) => compareDates(x.date, y.date));
}

/** Group-by helper for cross-profile model / source aggregation. */
function rollupBy<T extends { sessions: number; totalTokens: number; costUsd: number }>(
  rows: T[],
  keyFn: (r: T) => string,
  fields: (keyof T)[]
): T[] {
  const map = new Map<string, T>();
  rows.forEach((r) => {
    const key = keyFn(r);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { ...r });
      return;
    }
    fields.forEach((f) => {
      // We know these are all numeric counters.
      (cur as unknown as Record<string, number>)[f as string] +=
        (r as unknown as Record<string, number>)[f as string] || 0;
    });
  });
  return [...map.values()].sort((x, y) => (y.costUsd || 0) - (x.costUsd || 0));
}

/* -------------------------------------------------------------------------- */
/* Conversation linking                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Build a `hermesSessionId → { conversationId, agentId }` lookup so
 * the UI can deep-link top-N sessions to the chat that started them
 * (when the chat originated in this client). Sessions started outside
 * the client — CLI REPL, cron jobs, gateway-driven webhooks — return
 * `null` and the row stays read-only.
 */
async function lookupConversations(
  sessionIds: string[]
): Promise<Map<string, { conversationId: number; agentId: number }>> {
  const out = new Map<string, { conversationId: number; agentId: number }>();
  if (sessionIds.length === 0) return out;
  try {
    const repo = AppDataSource.getRepository(Conversation);
    const rows = await repo.find({
      where: { sessionKey: In(sessionIds) },
      select: { _id: true, agentId: true, sessionKey: true },
    });
    rows.forEach((r) => {
      if (r.sessionKey) out.set(r.sessionKey, { conversationId: r._id, agentId: r.agentId });
    });
  } catch {
    /* DB not initialised yet — fail soft, links just won't show. */
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

export interface GetInsightsOpts {
  /** Window length in days (default 30, clamped 1–365). */
  days?: number;
  /** When provided, only this profile is queried; otherwise all profiles. */
  profile?: string | null;
  /**
   * When provided, takes precedence over `profile`: we resolve the
   * agent id to its `hermesProfile` and also fold the agent's caps
   * into the response.
   */
  agentId?: number | null;
  /** Number of top sessions to return per profile (default 10, clamped 1–50). */
  topN?: number;
}

export async function getInsights(opts: GetInsightsOpts = {}): Promise<InsightsResponse> {
  const days = Math.min(Math.max(opts.days ?? 30, 1), 365);
  const topN = Math.min(Math.max(opts.topN ?? 10, 1), 50);

  // Resolve the requested scope. `agentId` wins over `profile` because
  // the cap data only exists at the agent level — the UI wouldn't be
  // able to show the cap card without knowing which agent is in scope.
  let scopedAgent: Agent | null = null;
  if (opts.agentId != null) {
    try {
      scopedAgent = await AppDataSource.getRepository(Agent).findOne({
        where: { _id: opts.agentId, deletedAt: IsNull() },
      });
    } catch {
      scopedAgent = null;
    }
  }
  let filterProfile: string | null = null;
  if (scopedAgent) {
    filterProfile = scopedAgent.hermesProfile;
  } else if (opts.profile && opts.profile !== '') {
    filterProfile = opts.profile;
  }

  const now = new Date();
  const fromMs = now.getTime() - days * 24 * 60 * 60 * 1000;
  const fromEpochSec = Math.floor(fromMs / 1000);
  const toIso = now.toISOString();
  const fromIso = new Date(fromMs).toISOString();

  const profiles = filterProfile ? [filterProfile] : listProfiles();
  let partial = false;
  let schemaVersion: number | null = null;

  const byProfile: ProfileBreakdown[] = [];
  let aggSummary: InsightsSummary = { ...EMPTY_SUMMARY };
  let aggDaily: DailyBucket[] = [];
  const aggModelRows: ModelBreakdown[] = [];
  const aggSourceRows: SourceBreakdown[] = [];
  const aggSessions: TopSession[] = [];
  let aggSpend: SpendWindows = { ...EMPTY_WINDOWS };

  profiles.forEach((profile) => {
    const r = queryProfile(profile, fromEpochSec, topN);
    if (!r.hasData) partial = true;
    if (r.schemaVersion != null) schemaVersion = r.schemaVersion;

    byProfile.push({ profile, hasData: r.hasData, ...r.summary });

    aggSummary = addSummaries(aggSummary, r.summary);
    aggDaily = mergeDaily(aggDaily, r.daily);
    aggModelRows.push(...r.byModel);
    aggSourceRows.push(...r.bySource);
    aggSpend = addWindows(aggSpend, r.spendWindows);

    r.topSessions.forEach((s) => {
      aggSessions.push({
        ...s,
        profile,
        conversationId: null,
        conversationAgentId: null,
      });
    });
  });

  // Cross-profile rollup for the global views.
  const byModel = rollupBy(
    aggModelRows,
    (r) => r.model,
    ['sessions', 'inputTokens', 'outputTokens', 'totalTokens', 'costUsd']
  );
  const bySource = rollupBy(
    aggSourceRows,
    (r) => r.source,
    ['sessions', 'messages', 'totalTokens', 'costUsd']
  );

  // Cap the global top-sessions list. Each profile already returned
  // its top `topN`; we re-sort the union and truncate so the cross-
  // profile view doesn't drown out smaller profiles entirely.
  aggSessions.sort((a, b) => {
    const ac = a.costUsd ?? 0;
    const bc = b.costUsd ?? 0;
    if (bc !== ac) return bc - ac;
    if (b.totalTokens !== a.totalTokens) return b.totalTokens - a.totalTokens;
    return b.startedAtMs - a.startedAtMs;
  });
  const topSessions = aggSessions.slice(0, topN);

  const conversationMap = await lookupConversations(topSessions.map((s) => s.hermesSessionId));
  topSessions.forEach((s) => {
    const conv = conversationMap.get(s.hermesSessionId);
    if (conv) {
      // eslint-disable-next-line no-param-reassign
      s.conversationId = conv.conversationId;
      // eslint-disable-next-line no-param-reassign
      s.conversationAgentId = conv.agentId;
    }
  });

  const caps: SpendCaps | null = scopedAgent
    ? {
        dailyCapUsd: scopedAgent.dailyCapUsd,
        monthlyCapUsd: scopedAgent.monthlyCapUsd,
        allTimeCapUsd: scopedAgent.allTimeCapUsd,
      }
    : null;

  return {
    windowDays: days,
    fromIso,
    toIso,
    schemaVersion,
    partial,
    profile: filterProfile,
    agentId: scopedAgent?._id ?? null,
    spendWindows: aggSpend,
    caps,
    summary: aggSummary,
    daily: fillDaily(aggDaily, days, toIso),
    byProfile,
    byModel,
    bySource,
    topSessions,
  };
}

/* -------------------------------------------------------------------------- */
/* Per-agent spend (sidebar progress rings)                                    */
/* -------------------------------------------------------------------------- */

/**
 * Lightweight aggregator used by `/api/insights/agents-spend`. Returns
 * one row per *active* agent with their caps and three rolling spend
 * windows. Designed to be polled cheaply (typically every minute) by
 * the sidebar so the progress rings stay fresh without forcing the
 * full insights query.
 */
export async function getAgentsSpend(): Promise<AgentsSpendResponse> {
  const agents = await AppDataSource.getRepository(Agent).find({
    where: { deletedAt: IsNull() },
    order: { _id: 'ASC' },
  });

  // Cache spend per profile so two agents pointing at the same
  // hermesProfile (rare, but possible after manual surgery) don't
  // double-open the SQLite file.
  const spendByProfile = new Map<string, SpendWindows>();
  const rows: AgentSpendRow[] = agents.map((agent) => {
    let spend = spendByProfile.get(agent.hermesProfile);
    if (!spend) {
      spend = readSpendWindows(agent.hermesProfile);
      spendByProfile.set(agent.hermesProfile, spend);
    }
    return {
      agentId: agent._id,
      agentName: agent.name,
      hermesProfile: agent.hermesProfile,
      caps: {
        dailyCapUsd: agent.dailyCapUsd,
        monthlyCapUsd: agent.monthlyCapUsd,
        allTimeCapUsd: agent.allTimeCapUsd,
      },
      spendWindows: spend,
    };
  });

  return { agents: rows };
}
