import { baseApi } from '../../shared/api/baseApi';

export interface User {
  _id: string;
  name: string;
  lastName: string;
  email: string;
  phone: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateUserBody {
  name: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

export interface UpdateUserBody {
  name?: string;
  lastName?: string;
  email?: string;
  password?: string;
  phone?: string;
  active?: boolean;
}

export interface GetUsersParams {
  page?: number;
  limit?: number;
  sortField?: string;
  sortType?: 'asc' | 'desc';
  search?: string;
}

export interface UsersResponse {
  total: number;
  items: User[];
}

export const usersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query<UsersResponse, GetUsersParams | void>({
      query: (params) => ({
        url: '/user',
        params: params || {},
      }),
      providesTags: ['User'],
    }),
    getUser: builder.query<User, string>({
      query: (id) => `/user/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'User', id }],
    }),
    createUser: builder.mutation<User, CreateUserBody>({
      query: (body) => ({
        url: '/user',
        method: 'POST',
        body,
      }),
      invalidatesTags: (result) => (result ? ['User'] : []),
    }),
    updateUser: builder.mutation<User, { id: string; data: UpdateUserBody }>({
      query: ({ id, data }) => ({
        url: `/user/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result) => (result ? ['User'] : []),
    }),
    deleteUser: builder.mutation<void, string>({
      query: (id) => ({
        url: `/user/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['User'],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useGetUserQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
} = usersApi;
