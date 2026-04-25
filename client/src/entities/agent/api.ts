import { baseApi } from '../../shared/api/baseApi';

/**
 * Local representation of a Hermes profile + DB-backed agent record.
 * `hermesProfile` is the `--profile` value passed to the Hermes CLI.
 * `model` is decorated server-side from the profile's resolved config.
 * `exists` is true if the underlying Hermes profile is still present.
 */
export interface Agent {
  _id: string;
  name: string;
  hermesProfile: string;
  createdAt: string;
  updatedAt: string;
  model?: string | null;
  exists?: boolean;
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

export const agentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAgents: build.query<AgentsResponse, void>({
      query: () => '/agent',
      providesTags: ['Agent'],
    }),
    getAgent: build.query<Agent, string>({
      query: (id) => `/agent/${id}`,
      providesTags: ['Agent'],
    }),
    createAgent: build.mutation<Agent, { name: string; hermesProfile?: string }>({
      query: (body) => ({
        url: '/agent',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Agent'],
    }),
    updateAgent: build.mutation<Agent, { id: string; name: string }>({
      query: ({ id, ...body }) => ({
        url: `/agent/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Agent'],
    }),
    deleteAgent: build.mutation<void, string>({
      query: (id) => ({
        url: `/agent/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Agent'],
    }),
    syncAgents: build.mutation<SyncAgentsResponse, void>({
      query: () => ({
        url: '/agent/sync',
        method: 'POST',
      }),
      invalidatesTags: ['Agent'],
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
} = agentsApi;
