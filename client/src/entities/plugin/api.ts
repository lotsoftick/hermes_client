import { baseApi } from '../../shared/api/baseApi';

/** Mirrors the Hermes-side PluginInfo returned by `GET /api/plugin`. */
export interface PluginInfo {
  name: string;
  description: string;
  version: string;
  status: string;
  source: string;
  enabled: boolean;
}

export const pluginsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listPlugins: build.query<PluginInfo[], void>({
      query: () => '/plugin',
      providesTags: ['Plugin'],
      keepUnusedDataFor: 300,
    }),
    togglePlugin: build.mutation<{ ok: boolean }, { name: string; enable: boolean }>({
      query: ({ name, enable }) => ({
        url: `/plugin/${encodeURIComponent(name)}`,
        method: 'POST',
        body: { enable },
      }),
      invalidatesTags: ['Plugin'],
    }),
  }),
});

export const { useListPluginsQuery, useTogglePluginMutation } = pluginsApi;
