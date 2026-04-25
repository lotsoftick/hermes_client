import { Alert, Box, Typography, CircularProgress } from '@mui/material';
import { MessageBubble } from '../../../entities/message';
import type { ChatState } from '../model/types';

interface MessageListProps {
  chat: ChatState;
}

export default function MessageList({ chat }: MessageListProps) {
  const {
    messages,
    isLoading,
    isFetching,
    hasMore,
    isStreaming,
    streamingText,
    streamingThinking,
    streamError,
    pendingUserText,
    pendingFilesPreviews,
    loadMore,
    loadMoreCursor,
    scrollContainerRef,
    messagesEndRef,
    handleScroll,
    clearError,
  } = chat;

  return (
    <Box
      ref={scrollContainerRef}
      onScroll={handleScroll}
      sx={{
        flex: 1,
        minWidth: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        px: { xs: 2, sm: 2, md: 3 },
        py: 2,
      }}
    >
      {streamError && (
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            mb: 1.5,
          }}
        >
          <Alert
            severity="error"
            variant="filled"
            onClose={clearError}
            sx={{
              alignItems: 'flex-start',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {streamError}
          </Alert>
        </Box>
      )}
      {isLoading && !loadMoreCursor ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : messages.length === 0 && !isStreaming ? (
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
        >
          <Typography color="text.secondary">No messages yet. Send the first one!</Typography>
        </Box>
      ) : (
        <>
          {hasMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
              {isFetching && loadMoreCursor ? (
                <CircularProgress size={20} />
              ) : (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                  onClick={loadMore}
                >
                  Load older messages
                </Typography>
              )}
            </Box>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg._id} message={msg} messageId={msg._id} />
          ))}
          {isStreaming && (pendingUserText || pendingFilesPreviews.length > 0) && (
            <MessageBubble
              message={{ text: pendingUserText, role: 'user', files: pendingFilesPreviews }}
            />
          )}
          {isStreaming && (streamingText || streamingThinking) && (
            <MessageBubble
              message={{ text: streamingText, role: 'assistant' }}
              isStreaming
              thinkingText={streamingThinking}
            />
          )}
          {isStreaming && !streamingText && !streamingThinking && (
            <Box sx={{ display: 'flex', gap: 0.8, py: 1.5, px: 1 }}>
              {[0, 1, 2].map((i) => (
                <Box
                  key={i}
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: 'text.secondary',
                    opacity: 0.4,
                    animation: 'dotPulse 1.4s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                    '@keyframes dotPulse': {
                      '0%, 80%, 100%': { transform: 'scale(0.6)', opacity: 0.4 },
                      '40%': { transform: 'scale(1)', opacity: 1 },
                    },
                  }}
                />
              ))}
            </Box>
          )}
        </>
      )}
      <div ref={messagesEndRef} />
    </Box>
  );
}
