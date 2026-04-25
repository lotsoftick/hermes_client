import { RequestHandler } from 'express';
import { RequestParams, APIResponse } from './shared';

export type ConversationResponse = {
  _id: number;
  agentId: number;
  title: string | null;
  sessionKey: string | null;
  createdBy: number;
  createdAt: Date | string;
} | null;

export type ConversationRequestBody = {
  agentId?: string;
};

export type ConversationUpdateBody = {
  title?: string;
};

export type ListAll = RequestHandler<never, APIResponse<ConversationResponse>, never, never>;
export type ListByAgent = RequestHandler<
  { agentId: string },
  APIResponse<ConversationResponse>,
  never,
  never
>;
export type Create = RequestHandler<never, ConversationResponse, ConversationRequestBody, never>;
export type Update = RequestHandler<RequestParams, ConversationResponse, ConversationUpdateBody, never>;
export type Destroy = RequestHandler<RequestParams, null, never, never>;
