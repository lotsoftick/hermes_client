import { baseApi } from '../../shared/api/baseApi';

export interface MessageFile {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  text: string;
  thinking: string | null;
  files: MessageFile[];
  role: 'user' | 'assistant';
  createdAt: string;
}

export interface MessagesResponse {
  total: number;
  items: Message[];
  hasMore: boolean;
}

export interface MessagesQueryArg {
  conversationId: string;
  before?: string;
}

export interface PollResponse {
  items: Message[];
  synced: number;
}

export interface PollQueryArg {
  conversationId: string;
  after?: string;
}

export const messagesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMessages: build.query<MessagesResponse, MessagesQueryArg>({
      query: ({ conversationId, before }) => {
        const params = new URLSearchParams();
        if (before) params.set('before', before);
        const qs = params.toString();
        return `/message/conversation/${conversationId}${qs ? `?${qs}` : ''}`;
      },
      serializeQueryArgs: ({ queryArgs }) => queryArgs.conversationId,
      merge: (currentCache, newResponse, { arg }) => {
        if (arg.before) {
          const existingIds = new Set(currentCache.items.map((m) => m._id));
          const unique = newResponse.items.filter((m) => !existingIds.has(m._id));
          currentCache.items = [...unique, ...currentCache.items];
          currentCache.hasMore = newResponse.hasMore;
        } else {
          currentCache.items = newResponse.items;
          currentCache.total = newResponse.total;
          currentCache.hasMore = newResponse.hasMore;
        }
      },
      forceRefetch: ({ currentArg, previousArg }) =>
        currentArg?.before !== previousArg?.before ||
        currentArg?.conversationId !== previousArg?.conversationId,
      providesTags: (_result, _error, { conversationId }) => [
        { type: 'Message', id: conversationId },
      ],
    }),
    pollMessages: build.query<PollResponse, PollQueryArg>({
      query: ({ conversationId, after }) => {
        const params = new URLSearchParams();
        if (after) params.set('after', after);
        const qs = params.toString();
        return `/message/conversation/${conversationId}/poll${qs ? `?${qs}` : ''}`;
      },
    }),
    createMessage: build.mutation<Message, { conversationId: string; text: string }>({
      query: (body) => ({
        url: '/message',
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { conversationId }) => [
        { type: 'Message', id: conversationId },
      ],
    }),
    deleteMessage: build.mutation<void, { id: string; conversationId: string }>({
      query: ({ id }) => ({
        url: `/message/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { conversationId }) => [
        { type: 'Message', id: conversationId },
      ],
    }),
  }),
});

export const {
  useGetMessagesQuery,
  usePollMessagesQuery,
  useCreateMessageMutation,
  useDeleteMessageMutation,
} = messagesApi;
