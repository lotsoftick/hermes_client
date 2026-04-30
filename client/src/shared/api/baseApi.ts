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

/**
 * Pick the API origin that lets the bundle work on whichever host the
 * page was loaded from (localhost on the install machine, a Tailscale
 * MagicDNS name, a LAN IP, etc.).
 *
 * Resolution order:
 *   1. `window.__HERMES_CONFIG__.apiBaseUrl` — the production static
 *      server (`client/serve.mjs`) injects this from `req.headers.host`
 *      so the URL always matches the page's hostname.
 *   2. `VITE_API_BASE_URL` — explicit build-time override; respected if
 *      the operator wants to pin a fixed URL.
 *   3. Derived from `window.location` — same protocol + hostname as the
 *      page, with the API port (`__HERMES_CONFIG__.apiPort` ▸
 *      `VITE_API_PORT` ▸ `18889`). This is the fallback dev mode lands
 *      on when accessed over Tailscale or a LAN IP without any custom
 *      env wiring.
 */
function resolveApiBaseUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:18889/api';
  const cfg = window.__HERMES_CONFIG__;
  if (cfg?.apiBaseUrl) return cfg.apiBaseUrl;
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL as string;
  const apiPort =
    cfg?.apiPort ||
    Number(import.meta.env.VITE_API_PORT) ||
    18889;
  return `${window.location.protocol}//${window.location.hostname}:${apiPort}/api`;
}

export const API_BASE_URL = resolveApiBaseUrl();

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
    'CronGateway',
    'Plugin',
    'Skill',
    'Insights',
    'AgentSpend',
  ],
  endpoints: () => ({}),
});
