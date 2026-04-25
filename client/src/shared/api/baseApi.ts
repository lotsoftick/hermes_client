import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';

declare global {
  interface Window {
    __HERMES_CONFIG__?: { apiBaseUrl?: string; apiPort?: number };
  }
}

const runtimeApiBase =
  typeof window !== 'undefined' ? window.__HERMES_CONFIG__?.apiBaseUrl : undefined;

export const API_BASE_URL =
  runtimeApiBase || import.meta.env.VITE_API_BASE_URL || 'http://localhost:18889/api';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: (headers) => {
    const token = localStorage.getItem('token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  const result = await rawBaseQuery(args, api, extraOptions);

  // Extract token from response body (reliable) or header (fallback)
  const bodyToken =
    result.data && typeof result.data === 'object' && 'accessToken' in result.data
      ? (result.data as { accessToken: string }).accessToken
      : null;
  const headerToken = result.meta?.response?.headers.get('access-token');
  const token = bodyToken || headerToken;
  if (token) {
    const tokenValue = token.startsWith('Bearer ') ? token.slice(7) : token;
    localStorage.setItem('token', tokenValue);
  }

  // Handle 401 Unauthorized
  if (result.error?.status === 401) {
    localStorage.removeItem('token');
    api.dispatch({ type: 'auth/logout' });
    api.dispatch(baseApi.util.resetApiState());

    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  return result;
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: [
    'User',
    'Agent',
    'Conversation',
    'Message',
    'SessionSettings',
    'Cron',
    'Plugin',
    'Skill',
  ],
  endpoints: () => ({}),
});
