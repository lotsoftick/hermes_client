import { useCallback, useRef, useState } from 'react';
import { useAppDispatch } from '../../../../app/store/hooks';
import { API_BASE_URL, baseApi } from '../../../../shared/api';
import { useGetMessagesQuery, type MessageFile } from '../../../../entities/message';

interface UseSendMessageArgs {
  conversationId: string | undefined;
  refetch: ReturnType<typeof useGetMessagesQuery>['refetch'];
  hasMessages: boolean;
}

export interface SendMessageState {
  isStreaming: boolean;
  streamingText: string;
  streamingThinking: string;
  streamError: string | null;
  pendingUserText: string;
  pendingFilesPreviews: MessageFile[];
  send: (text: string, files: File[]) => Promise<void>;
  abort: () => void;
  clearError: () => void;
}

/**
 * Owns the fetch/stream lifecycle for sending a chat message.
 * Keeps UI-facing state (streaming text, pending previews) local.
 */
export function useSendMessage({
  conversationId,
  refetch,
  hasMessages,
}: UseSendMessageArgs): SendMessageState {
  const [streamingText, setStreamingText] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingUserText, setPendingUserText] = useState('');
  const [pendingFilesPreviews, setPendingFilesPreviews] = useState<MessageFile[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const dispatch = useAppDispatch();

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const clearError = useCallback(() => setStreamError(null), []);

  const send = useCallback(
    async (text: string, files: File[]) => {
      const trimmed = text.trim();
      if ((!trimmed && files.length === 0) || !conversationId || isStreaming) return;

      const previews: MessageFile[] = files.map((f) => ({
        filename: f.name,
        originalName: f.name,
        mimetype: f.type,
        size: f.size,
        url: URL.createObjectURL(f),
      }));

      setPendingUserText(trimmed);
      setPendingFilesPreviews(previews);
      setStreamingText('');
      setStreamingThinking('');
      setStreamError(null);
      setIsStreaming(true);

      const token = localStorage.getItem('token');
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const form = new FormData();
        form.append('conversationId', conversationId);
        if (trimmed) form.append('text', trimmed);
        files.forEach((f) => form.append('files', f));

        const res = await fetch(`${API_BASE_URL}/message/chat`, {
          method: 'POST',
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: form,
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          console.error('Chat request failed:', res.status);
          let msg = `Chat request failed (${res.status}).`;
          try {
            const body = await res.json();
            if (body?.error) msg = String(body.error);
          } catch {
            /* ignore */
          }
          setStreamError(msg);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let lineBuf = '';
        let accText = '';
        let accThinking = '';

        const processLine = (line: string) => {
          if (!line.startsWith('data: ')) return;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') return;
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'response.output_text.delta' && event.delta) {
              accText += event.delta;
              setStreamingText(accText);
            } else if (event.type === 'response.thinking.delta' && event.delta) {
              accThinking += event.delta;
              setStreamingThinking(accThinking);
            } else if (event.type === 'response.error' && event.delta) {
              setStreamError(String(event.delta));
            }
          } catch {
            /* skip */
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            if (lineBuf.trim()) processLine(lineBuf);
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          lineBuf += chunk;
          const parts = lineBuf.split('\n');
          lineBuf = parts.pop()!;
          parts.forEach(processLine);
        }

        await refetch();
        if (!hasMessages) {
          dispatch(baseApi.util.invalidateTags(['Conversation']));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Stream error:', err);
        setStreamError(err instanceof Error ? err.message : 'Network error while streaming.');
      } finally {
        setIsStreaming(false);
        setStreamingText('');
        setStreamingThinking('');
        setPendingUserText('');
        setPendingFilesPreviews((prev) => {
          prev.forEach((f) => URL.revokeObjectURL(f.url));
          return [];
        });
        abortRef.current = null;
      }
    },
    [conversationId, isStreaming, refetch, dispatch, hasMessages]
  );

  return {
    isStreaming,
    streamingText,
    streamingThinking,
    streamError,
    pendingUserText,
    pendingFilesPreviews,
    send,
    abort,
    clearError,
  };
}
