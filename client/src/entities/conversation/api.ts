import { baseApi } from '../../shared/api/baseApi';

export interface Conversation {
  _id: string;
  agentId: string;
  title: string | null;
  sessionKey: string | null;
  createdAt: string;
}

export interface ConversationsResponse {
  total: number;
  items: Conversation[];
}

export const conversationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAllConversations: build.query<ConversationsResponse, void>({
      query: () => '/conversation',
      providesTags: ['Conversation'],
    }),
    getConversations: build.query<ConversationsResponse, string>({
      query: (agentId) => `/conversation/agent/${agentId}`,
      providesTags: (_result, _error, agentId) => [{ type: 'Conversation', id: agentId }],
    }),
    createConversation: build.mutation<Conversation, { agentId: string }>({
      query: (body) => ({
        url: '/conversation',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Conversation'],
    }),
    updateConversation: build.mutation<
      Conversation,
      { id: string; agentId: string; title: string }
    >({
      query: ({ id, title }) => ({
        url: `/conversation/${id}`,
        method: 'PATCH',
        body: { title },
      }),
      invalidatesTags: ['Conversation'],
    }),
    deleteConversation: build.mutation<void, { id: string; agentId: string }>({
      query: ({ id }) => ({
        url: `/conversation/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Conversation'],
    }),
  }),
});

export const {
  useGetAllConversationsQuery,
  useGetConversationsQuery,
  useCreateConversationMutation,
  useUpdateConversationMutation,
  useDeleteConversationMutation,
} = conversationsApi;
