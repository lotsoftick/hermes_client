import { RequestHandler } from 'express';
import { QueryFilters, RequestParams, APIResponse } from './shared';

export type UserResponse = {
  _id: number;
  name: string;
  lastName: string;
  email: string;
  phone: string | null;
  active: boolean;
  createdAt: Date | string;
  updatedAt: Date | string | null;
};

export type UserRequestBody = {
  email: string;
  password: string;
  token: string;
};

export type GetCurentUser = RequestHandler<never, UserResponse, never, never>;
export type LoginResponse = UserResponse & { accessToken: string };
export type Login = RequestHandler<never, LoginResponse, UserRequestBody, never>;
export type Logout = RequestHandler<never, never, never, never>;

export type UserFilters = QueryFilters<'name' | 'email' | 'createdAt' | 'updatedAt'>;

export type CreateUserBody = {
  name: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
};

export type UpdateUserBody = {
  name?: string;
  lastName?: string;
  email?: string;
  password?: string;
  phone?: string;
  active?: boolean;
};

export type List = RequestHandler<never, APIResponse<UserResponse>, never, UserFilters>;
export type Get = RequestHandler<RequestParams, UserResponse | null, never, never>;
export type Create = RequestHandler<never, UserResponse, CreateUserBody, never>;
export type Update = RequestHandler<RequestParams, UserResponse | null, UpdateUserBody, never>;
export type Destroy = RequestHandler<RequestParams, null | { error: string }, never, never>;
