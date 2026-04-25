import { baseApi } from '../../shared/api/baseApi';

export interface CronSchedule {
  kind: 'cron' | 'every' | 'at' | 'unknown';
  cron?: string;
  every?: string;
  everyMs?: number;
  at?: string;
  display?: string;
}

export interface CronPayload {
  message?: string;
}

export interface CronState {
  lastRunAtMs?: number;
  lastRunStatus?: string;
  lastError?: string;
  lastDeliveryError?: string;
  nextRunAtMs?: number;
}

export interface CronJob {
  id: string;
  /** Hermes profile owning this job; `default` for the implicit one. */
  profile: string;
  name: string;
  enabled: boolean;
  deleteAfterRun: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  payload: CronPayload;
  state: CronState;
}

export interface CronListResponse {
  jobs: CronJob[];
  total: number;
}

export interface GatewayProfileStatus {
  profile: string;
  running: boolean;
  raw: string;
  error?: string;
  jobCount: number;
}

export interface GatewayStatus {
  profiles: GatewayProfileStatus[];
  allJobsCovered: boolean;
  profilesMissingGateway: string[];
  profilesWithGateway: string[];
}

export interface GatewayOpResult {
  ok: boolean;
  error?: string;
  raw: string;
  profiles?: { profile: string; ok: boolean; error?: string; raw: string }[];
}

export interface CronRun {
  id: string;
  sessionId: string;
  ranAtMs: number;
  response: string;
  error?: string;
  messageCount: number;
}

export interface CronRunsResponse {
  runs: CronRun[];
}

export const cronApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listCronJobs: build.query<CronListResponse, void>({
      query: () => '/cron',
      providesTags: ['Cron'],
      keepUnusedDataFor: 30,
    }),
    addCronJob: build.mutation<{ ok: boolean }, Record<string, string>>({
      query: (body) => ({
        url: '/cron',
        method: 'POST',
        body,
      }),
      // Adding a job in a previously-empty profile flips that profile's
      // gateway state from "no jobs needed" to "missing gateway", so the
      // banner has to recompute. Same logic on remove/toggle.
      invalidatesTags: ['Cron', 'CronGateway'],
    }),
    removeCronJob: build.mutation<{ ok: boolean }, { id: string; profile?: string }>({
      query: ({ id, profile }) => ({
        url: `/cron/${encodeURIComponent(id)}`,
        method: 'DELETE',
        params: profile ? { profile } : undefined,
      }),
      invalidatesTags: ['Cron', 'CronGateway'],
    }),
    toggleCronJob: build.mutation<
      { ok: boolean },
      { id: string; enable: boolean; profile?: string }
    >({
      query: ({ id, enable, profile }) => ({
        url: `/cron/${encodeURIComponent(id)}`,
        method: 'POST',
        body: profile ? { enable, profile } : { enable },
      }),
      invalidatesTags: ['Cron', 'CronGateway'],
    }),
    listCronRuns: build.query<CronRunsResponse, { id: string; profile?: string; limit?: number }>({
      query: ({ id, profile, limit }) => ({
        url: `/cron/${encodeURIComponent(id)}/runs`,
        params: {
          ...(profile ? { profile } : {}),
          ...(limit ? { limit: String(limit) } : {}),
        },
      }),
      providesTags: (_res, _err, { id }) => [{ type: 'Cron', id: `${id}-runs` }],
    }),
    getGatewayStatus: build.query<GatewayStatus, void>({
      query: () => '/cron/gateway',
      providesTags: ['CronGateway'],
    }),
    startGateway: build.mutation<GatewayOpResult, { profile?: string } | void>({
      query: (arg) => ({
        url: '/cron/gateway/start',
        method: 'POST',
        body: arg && 'profile' in arg && arg.profile ? { profile: arg.profile } : {},
      }),
      invalidatesTags: ['CronGateway', 'Cron'],
    }),
    stopGateway: build.mutation<GatewayOpResult, { profile?: string } | void>({
      query: (arg) => ({
        url: '/cron/gateway/stop',
        method: 'POST',
        body: arg && 'profile' in arg && arg.profile ? { profile: arg.profile } : {},
      }),
      invalidatesTags: ['CronGateway', 'Cron'],
    }),
  }),
});

export const {
  useListCronJobsQuery,
  useAddCronJobMutation,
  useRemoveCronJobMutation,
  useToggleCronJobMutation,
  useListCronRunsQuery,
  useGetGatewayStatusQuery,
  useStartGatewayMutation,
  useStopGatewayMutation,
} = cronApi;
