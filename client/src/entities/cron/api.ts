import { baseApi } from '../../shared/api/baseApi';

export interface CronSchedule {
  kind: string;
  at?: string;
  cron?: string;
  every?: string;
  everyMs?: number;
  anchorMs?: number;
}

export interface CronPayload {
  kind: string;
  message?: string;
  systemEvent?: string;
}

export interface CronState {
  lastRunAtMs?: number;
  lastRunStatus?: string;
  lastStatus?: string;
  lastDurationMs?: number;
  lastError?: string;
  consecutiveErrors?: number;
}

export interface CronJob {
  id: string;
  agentId: string;
  name: string;
  enabled: boolean;
  deleteAfterRun: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  sessionTarget: string;
  wakeMode: string;
  payload: CronPayload;
  delivery: Record<string, unknown>;
  state: CronState;
}

export interface CronListResponse {
  jobs: CronJob[];
  total: number;
}

export const cronApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listCronJobs: build.query<CronListResponse, void>({
      query: () => '/cron',
      providesTags: ['Cron'],
      keepUnusedDataFor: 300,
    }),
    addCronJob: build.mutation<{ ok: boolean }, Record<string, string>>({
      query: (body) => ({
        url: '/cron',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Cron'],
    }),
    removeCronJob: build.mutation<{ ok: boolean }, { id: string }>({
      query: ({ id }) => ({
        url: `/cron/${encodeURIComponent(id)}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Cron'],
    }),
    toggleCronJob: build.mutation<{ ok: boolean }, { id: string; enable: boolean }>({
      query: ({ id, enable }) => ({
        url: `/cron/${encodeURIComponent(id)}`,
        method: 'POST',
        body: { enable },
      }),
      invalidatesTags: ['Cron'],
    }),
  }),
});

export const {
  useListCronJobsQuery,
  useAddCronJobMutation,
  useRemoveCronJobMutation,
  useToggleCronJobMutation,
} = cronApi;
