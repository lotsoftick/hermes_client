import { baseApi } from '../../shared/api/baseApi';

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
  costUsd: number;
  activeTimeMs: number;
}

export interface DailyBucket {
  date: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface ProfileBreakdown extends InsightsSummary {
  profile: string;
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
  hermesSessionId: string;
  profile: string;
  model: string | null;
  source: string;
  title: string | null;
  startedAtMs: number;
  endedAtMs: number | null;
  messageCount: number;
  toolCallCount: number;
  totalTokens: number;
  costUsd: number | null;
  costStatus: string | null;
  conversationId: number | null;
  conversationAgentId: number | null;
}

export interface SpendWindows {
  dayUsd: number;
  monthUsd: number;
  allTimeUsd: number;
}

export interface SpendCaps {
  dailyCapUsd: number | null;
  monthlyCapUsd: number | null;
  allTimeCapUsd: number | null;
}

export interface InsightsResponse {
  windowDays: number;
  fromIso: string;
  toIso: string;
  schemaVersion: number | null;
  partial: boolean;
  profile: string | null;
  agentId: number | null;
  spendWindows: SpendWindows;
  caps: SpendCaps | null;
  summary: InsightsSummary;
  daily: DailyBucket[];
  byProfile: ProfileBreakdown[];
  byModel: ModelBreakdown[];
  bySource: SourceBreakdown[];
  topSessions: TopSession[];
}

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

export interface InsightsQueryArgs {
  /** Window length in days (1–365). Defaults to 30 server-side. */
  days?: number;
  /** When provided, only this Hermes profile is queried. */
  profile?: string | null;
  /**
   * Numeric agent id; when set the response includes the agent's
   * spend caps and overrides any `profile` argument.
   */
  agentId?: string | number | null;
  /** Number of top sessions to return (1–50). Defaults to 10. */
  topN?: number;
}

export const insightsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getInsights: build.query<InsightsResponse, InsightsQueryArgs | void>({
      query: (arg) => {
        const params: Record<string, string> = {};
        if (arg?.days != null) params.days = String(arg.days);
        if (arg?.profile) params.profile = arg.profile;
        if (arg?.agentId != null && arg.agentId !== '') params.agentId = String(arg.agentId);
        if (arg?.topN != null) params.topN = String(arg.topN);
        return { url: '/insights', params };
      },
      // Tagging by both the global tag and (when scoped) a per-agent
      // id lets cap mutations invalidate just the affected agent's
      // page without nuking the global cache.
      providesTags: (_res, _err, arg) => {
        const tags: Array<
          { type: 'Insights' } | { type: 'AgentSpend'; id: number | string }
        > = [{ type: 'Insights' as const }];
        if (arg?.agentId != null && arg.agentId !== '') {
          tags.push({ type: 'AgentSpend' as const, id: arg.agentId });
        }
        return tags;
      },
      keepUnusedDataFor: 60,
    }),
    /**
     * Lightweight per-agent spend windows — used by the sidebar ring
     * around the model icon. Refetches every 60s while focused.
     */
    getAgentsSpend: build.query<AgentsSpendResponse, void>({
      query: () => '/insights/agents-spend',
      providesTags: ['AgentSpend'],
      keepUnusedDataFor: 60,
    }),
  }),
});

export const { useGetInsightsQuery, useGetAgentsSpendQuery } = insightsApi;
