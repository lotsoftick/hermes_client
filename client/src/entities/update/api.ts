import { baseApi } from '../../shared/api/baseApi';

interface UpdateStatus {
  available: boolean;
  current: string;
  latest: string;
  checkedAt: string | null;
}

interface ApplyResult {
  ok: boolean;
  error?: string;
}

const updateApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    checkUpdate: build.query<UpdateStatus, void>({
      query: () => '/update/status',
      keepUnusedDataFor: 300,
    }),
    applyUpdate: build.mutation<ApplyResult, void>({
      query: () => ({ url: '/update/apply', method: 'POST' }),
    }),
  }),
});

export const { useCheckUpdateQuery, useApplyUpdateMutation } = updateApi;
