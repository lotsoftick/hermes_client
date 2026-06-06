import { RequestHandler } from 'express';
import { RequestParams, APIResponse } from './shared';

export type MessageRole = 'user' | 'assistant';

export type MessageFile = {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
};

export type MessageToolCall = {
  id: string;
  name: string;
  args: string;
  result: string | null;
  ok: boolean | null;
  exitCode: number | null;
  truncated: boolean;
};

export type MessageResponse = {
  _id: number;
  conversationId: number;
  externalId: string | null;
  text: string;
  thinking: string | null;
  files: MessageFile[];
  toolCalls: MessageToolCall[];
  images: string[];
  role: MessageRole;
  createdBy: number;
  createdAt: Date | string;
} | null;

export type MessageRequestBody = {
  conversationId?: string;
  text?: string;
};

export type ChatRequestBody = {
  conversationId?: string;
  text?: string;
};

export type ListByConversation = RequestHandler<
  { conversationId: string },
  APIResponse<MessageResponse> & { hasMore: boolean },
  never,
  { before?: string; limit?: string }
>;
export type Create = RequestHandler<never, MessageResponse, MessageRequestBody, never>;
export type Chat = RequestHandler<never, unknown, ChatRequestBody, never>;
export type Destroy = RequestHandler<RequestParams, null, never, never>;
