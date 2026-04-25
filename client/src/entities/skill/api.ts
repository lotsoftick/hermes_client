import { baseApi } from '../../shared/api/baseApi';

export type SkillSource = 'hub' | 'builtin' | 'local' | 'unknown';

/** Mirrors the Hermes-side SkillInfo returned by `GET /api/skill`. */
export interface SkillInfo {
  name: string;
  category: string;
  source: SkillSource;
  trust: string;
}

export const skillsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listSkills: build.query<SkillInfo[], void>({
      query: () => '/skill',
      providesTags: ['Skill'],
      keepUnusedDataFor: 300,
    }),
  }),
});

export const { useListSkillsQuery } = skillsApi;
