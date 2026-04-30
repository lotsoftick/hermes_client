import type { RequestHandler } from 'express';

/**
 * Aggregate token / cost / activity numbers over a time window.
 *
 * All token fields are simple sums over `sessions.<column>` from
 * Hermes' `state.db`. `costUsd` collapses `actual_cost_usd` (preferred
 * when the provider has settled the bill) into `estimated_cost_usd`
 * (preview / mid-flight) so the UI never has to choose between two
 * "current spend" numbers.
 */
export interface InsightsSummary {
  sessions: number;
  messages: number;
  toolCalls: number;
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  /** Best available cost (actual when present, else estimated). */
  costUsd: number;
  /** Total of `ended_at - started_at` across all sessions, in milliseconds. */
  activeTimeMs: number;
}

/** A single row in the daily usage histogram. */
export interface DailyBucket {
  /** Local date in `YYYY-MM-DD`. */
  date: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

/** Per-profile rollup. `profile === 'default'` represents `~/.hermes`. */
export interface ProfileBreakdown extends InsightsSummary {
  profile: string;
  /**
   * `false` when the profile's `state.db` is missing or unreadable.
   * The summary then reports zeros — the UI can show a hint to run
   * `hermes -p <profile> chat` once to materialise the database.
   */
  hasData: boolean;
}

export interface ModelBreakdown {
  model: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface SourceBreakdown {
  source: string;
  sessions: number;
  messages: number;
  totalTokens: number;
  costUsd: number;
}

export interface TopSession {
  /** Hermes-side session id, e.g. `20260425_181831_abcdef`. */
  hermesSessionId: string;
  profile: string;
  model: string | null;
  source: string;
  title: string | null;
  /** Unix-epoch milliseconds. */
  startedAtMs: number;
  endedAtMs: number | null;
  messageCount: number;
  toolCallCount: number;
  totalTokens: number;
  /** Best available cost (actual or estimated). May be 0 / null. */
  costUsd: number | null;
  /** `'final' | 'estimated' | …` from `sessions.cost_status`. */
  costStatus: string | null;
  /**
   * If we have a conversation in our own DB tied to this Hermes
   * session id, the UI can deep-link to it. `null` when the session
   * was started outside the client (CLI REPL, cron job, …).
   */
  conversationId: number | null;
  conversationAgentId: number | null;
}

/**
 * Three rolling spend windows used by the Spend Caps UI and the
 * sidebar progress rings. All three are computed independently of
 * `windowDays` so they always tell the truth ("how much have I spent
 * today / this month / ever") regardless of which histogram window
 * the user happens to be looking at.
 */
export interface SpendWindows {
  /** Local-midnight → now. */
  dayUsd: number;
  /** Local 1st-of-month 00:00 → now. */
  monthUsd: number;
  /** Full session history. */
  allTimeUsd: number;
}

/** Cap configuration mirrored from the Agent entity. */
export interface SpendCaps {
  dailyCapUsd: number | null;
  monthlyCapUsd: number | null;
  allTimeCapUsd: number | null;
}

export interface InsightsResponse {
  /** Echo of the requested window (defaults to 30). */
  windowDays: number;
  /** Inclusive lower bound of the window, ISO. */
  fromIso: string;
  /** Now, ISO. */
  toIso: string;
  /** Hermes' `schema_version.version`, or `null` if unreadable. */
  schemaVersion: number | null;
  /**
   * `true` when one or more profiles' state.db could not be opened.
   * The breakdowns still include those profiles with `hasData: false`.
   */
  partial: boolean;
  /** Profile name when scoped to one, `null` when aggregating all. */
  profile: string | null;
  /** Agent id when scoped to one (resolved server-side to a profile). */
  agentId: number | null;
  /** Always present, scoped to whatever was queried. */
  spendWindows: SpendWindows;
  /** Only populated when scoped to a single agent. */
  caps: SpendCaps | null;
  summary: InsightsSummary;
  daily: DailyBucket[];
  byProfile: ProfileBreakdown[];
  byModel: ModelBreakdown[];
  bySource: SourceBreakdown[];
  topSessions: TopSession[];
}

/** One row of the lightweight `/api/insights/agents-spend` response. */
export interface AgentSpendRow {
  agentId: number;
  agentName: string;
  hermesProfile: string;
  caps: SpendCaps;
  spendWindows: SpendWindows;
}

export interface AgentsSpendResponse {
  agents: AgentSpendRow[];
}

export interface InsightsQuery {
  days?: string;
  profile?: string;
  /** Numeric agent id; takes precedence over `profile` when both are set. */
  agentId?: string;
  topN?: string;
}

export type GetInsights = RequestHandler<
  Record<string, never>,
  InsightsResponse | { message: string },
  Record<string, never>,
  InsightsQuery
>;

export type GetAgentsSpend = RequestHandler<
  Record<string, never>,
  AgentsSpendResponse | { message: string }
>;
