import type { RefObject } from 'react';
import type { Message, MessageFile } from '../../../entities/message';

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  isFetching: boolean;
  hasMore: boolean;
  loadMoreCursor: string | undefined;

  isStreaming: boolean;
  streamingText: string;
  streamingThinking: string;
  streamError: string | null;
  pendingUserText: string;
  pendingFilesPreviews: MessageFile[];

  send: (text: string, files: File[]) => Promise<void>;
  loadMore: () => void;
  handleScroll: () => void;
  clearError: () => void;

  scrollContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}
