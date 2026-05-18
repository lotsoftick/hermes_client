import { baseApi } from '../../shared/api/baseApi';

export interface AuthUser {
  _id?: number;
  id?: string;
  email: string;
  name: string;
  /**
   * Mirrors `HERMES_SINGLE_USER_MODE` on the server. Drives whether the
   * sidebar shows the multi-user "Users" admin entry or the single-user
   * "Account" self-edit entry.
   */
  singleUserMode?: boolean;
}

interface LoginRequest {
  email: string;
  password: string;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<AuthUser & { accessToken?: string }, LoginRequest>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
    }),
    logout: builder.mutation<void, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'DELETE',
      }),
    }),
    getMe: builder.query<AuthUser, void>({
      query: () => '/auth/token',
    }),
  }),
});

export const { useLoginMutation, useLogoutMutation, useGetMeQuery } = authApi;
