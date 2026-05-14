import { baseApi } from '../../shared/api/baseApi';

/**
 * Local representation of a Hermes profile + DB-backed agent record.
 * `hermesProfile` is the `--profile` value passed to the Hermes CLI.
 * `model` is decorated server-side from the profile's resolved config.
 * `exists` is true if the underlying Hermes profile is still present.
 *
 * `dailyCapUsd`, `monthlyCapUsd`, `allTimeCapUsd` are advisory USD
 * spend caps stored on the agent record (not in Hermes). `null`
 * means "no cap" — the input is left empty in the UI.
 */
export interface Agent {
  _id: string;
  name: string;
  hermesProfile: string;
  createdAt: string;
  updatedAt: string;
  model?: string | null;
  exists?: boolean;
  /**
   * Whether the hermes gateway daemon for this agent's profile is loaded.
   * Decorated by the API on every `/agent` and `/agent/:id` fetch.
   */
  gatewayRunning?: boolean;
  dailyCapUsd: number | null;
  monthlyCapUsd: number | null;
  allTimeCapUsd: number | null;
}

export interface AgentsResponse {
  total: number;
  items: Agent[];
}

export interface SyncAgentsResponse {
  syncedAgents: number;
  syncedConversations: number;
  syncedMessages: number;
}

export interface SessionSettings {
  thinkingLevel: string;
  fastMode: boolean | null;
  verboseLevel: string;
  reasoningLevel: string;
}

export interface SessionSettingsResponse {
  ok: boolean;
  settings: Partial<SessionSettings>;
}

export interface UpdateAgentBody {
  id: string;
  name?: string;
  /** Pass `null` to clear, omit to leave unchanged. */
  dailyCapUsd?: number | null;
  monthlyCapUsd?: number | null;
  allTimeCapUsd?: number | null;
}

/**
 * Result of a gateway lifecycle action. `raw` is the merged
 * stdout/stderr from the underlying `hermes gateway *` invocation —
 * useful for surfacing failures verbatim if we ever build a details
 * view, otherwise ignored.
 */
export interface GatewayOpResponse {
  ok: boolean;
  error?: string;
  raw: string;
}

export const agentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAgents: build.query<AgentsResponse, void>({
      query: () => '/agent',
      providesTags: ['Agent'],
    }),
    getAgent: build.query<Agent, string>({
      query: (id) => `/agent/${id}`,
      providesTags: (_res, _err, id) => [{ type: 'Agent', id }],
    }),
    createAgent: build.mutation<Agent, { name: string; hermesProfile?: string }>({
      query: (body) => ({
        url: '/agent',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Agent', 'AgentSpend'],
    }),
    updateAgent: build.mutation<Agent, UpdateAgentBody>({
      query: ({ id, ...body }) => ({
        url: `/agent/${id}`,
        method: 'PATCH',
        body,
      }),
      // Invalidate the agent itself, the global agent list, the
      // shared spend rollup that drives the sidebar rings, and the
      // *specific* per-agent Insights cache so the spend caps card
      // sees the updated cap on the very next render.
      invalidatesTags: (_res, _err, { id }) => [
        'Agent',
        { type: 'Agent', id },
        'AgentSpend',
        { type: 'AgentSpend', id },
        { type: 'Insights' },
      ],
    }),
    deleteAgent: build.mutation<void, string>({
      query: (id) => ({
        url: `/agent/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Agent', 'AgentSpend'],
    }),
    syncAgents: build.mutation<SyncAgentsResponse, void>({
      query: () => ({
        url: '/agent/sync',
        method: 'POST',
      }),
      invalidatesTags: ['Agent', 'AgentSpend'],
    }),
    // Gateway lifecycle. Each mutation invalidates the agent tags so the
    // sidebar's status dot reflects the new daemon state on the very next
    // refetch (no need to wait out the 15s status cache).
    startGateway: build.mutation<GatewayOpResponse, string>({
      query: (id) => ({ url: `/agent/${id}/gateway/start`, method: 'POST' }),
      invalidatesTags: (_res, _err, id) => ['Agent', { type: 'Agent', id }],
    }),
    stopGateway: build.mutation<GatewayOpResponse, string>({
      query: (id) => ({ url: `/agent/${id}/gateway/stop`, method: 'POST' }),
      invalidatesTags: (_res, _err, id) => ['Agent', { type: 'Agent', id }],
    }),
    restartGateway: build.mutation<GatewayOpResponse, string>({
      query: (id) => ({ url: `/agent/${id}/gateway/restart`, method: 'POST' }),
      invalidatesTags: (_res, _err, id) => ['Agent', { type: 'Agent', id }],
    }),
    getSessionSettings: build.query<
      SessionSettingsResponse,
      { agentId: string; conversationId: string }
    >({
      query: ({ agentId, conversationId }) =>
        `/agent/${agentId}/conversation/${conversationId}/session-settings`,
      providesTags: (_res, _err, { conversationId }) => [
        { type: 'SessionSettings', id: conversationId },
      ],
    }),
    patchSessionSettings: build.mutation<
      { ok: boolean },
      { agentId: string; conversationId: string; settings: Partial<SessionSettings> }
    >({
      query: ({ agentId, conversationId, settings }) => ({
        url: `/agent/${agentId}/conversation/${conversationId}/session-settings`,
        method: 'PATCH',
        body: settings,
      }),
      invalidatesTags: (_res, _err, { conversationId }) => [
        { type: 'SessionSettings', id: conversationId },
      ],
    }),
  }),
});

export const {
  useGetAgentsQuery,
  useGetAgentQuery,
  useCreateAgentMutation,
  useUpdateAgentMutation,
  useDeleteAgentMutation,
  useSyncAgentsMutation,
  useGetSessionSettingsQuery,
  usePatchSessionSettingsMutation,
  useStartGatewayMutation,
  useStopGatewayMutation,
  useRestartGatewayMutation,
} = agentsApi;
