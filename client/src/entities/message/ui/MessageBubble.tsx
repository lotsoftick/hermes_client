import { useState, memo, useCallback } from 'react';
import { Box, Paper, Typography, IconButton, useTheme } from '@mui/material';
import { DeleteOutline, ContentCopy, Done } from '@mui/icons-material';
import { DeleteButton, MarkdownContent } from '../../../shared/ui';
import ThinkingBlock from './ThinkingBlock';
import FileAttachments from './FileAttachments';
import CronMessageBubble from './CronMessageBubble';
import { parseCronMessage } from '../lib/parseCronMessage';
import { useDeleteMessageMutation, type Message, type MessageFile } from '../api';

export type MessageLike =
  | Message
  | { text: string; role: string; thinking?: string | null; files?: MessageFile[] };

interface MessageBubbleProps {
  message: MessageLike;
  isStreaming?: boolean;
  thinkingText?: string;
  messageId?: string;
}

const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming,
  thinkingText,
  messageId,
}: MessageBubbleProps) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const theme = useTheme();
  const [deleteMessage] = useDeleteMessageMutation();

  const isUser = message.role === 'user';
  const thinking = thinkingText || ('thinking' in message ? message.thinking : null);
  const files = ('files' in message ? message.files : undefined) ?? [];
  const parsedCron = isUser && !isStreaming ? parseCronMessage(message.text) : null;
  const displayText = message.text ?? '';
  const hasTextContent = displayText && !displayText.startsWith('[Attached ');

  const handleCopy = () => {
    navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDelete = useCallback(() => {
    if (messageId && 'conversationId' in message) {
      deleteMessage({ id: messageId, conversationId: message.conversationId });
    }
  }, [messageId, message, deleteMessage]);

  if (parsedCron) {
    return (
      <CronMessageBubble message={message as Message} messageId={messageId} parsed={parsedCron} />
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        mb: 1.5,
        width: '100%',
        minWidth: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 1,
          minWidth: 0,
          maxWidth: { xs: '90%', sm: '80%', md: 'min(70%, 100%)' },
          position: 'relative',
          bgcolor: isUser ? theme.palette.chat.userBubble : theme.palette.chat.assistantBubble,
          color: isUser ? theme.palette.chat.userText : 'text.primary',
          borderRadius: 3,
          borderTopRightRadius: isUser ? 4 : undefined,
          borderTopLeftRadius: isUser ? undefined : 4,
        }}
      >
        {hovered && (
          <Box sx={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 0.25 }}>
            <IconButton
              size="small"
              onClick={handleCopy}
              sx={{ opacity: 0.5, '&:hover': { opacity: 1 }, p: 0.3 }}
            >
              {copied ? (
                <Done sx={{ fontSize: 13, color: 'success.main' }} />
              ) : (
                <ContentCopy sx={{ fontSize: 13 }} />
              )}
            </IconButton>
            {messageId && 'conversationId' in message && (
              <DeleteButton
                onConfirm={handleDelete}
                message="Delete this message?"
                renderTrigger={(onClick) => (
                  <IconButton
                    size="small"
                    onClick={onClick}
                    sx={{ opacity: 0.5, '&:hover': { opacity: 1, color: 'error.main' }, p: 0.3 }}
                  >
                    <DeleteOutline sx={{ fontSize: 14 }} />
                  </IconButton>
                )}
              />
            )}
          </Box>
        )}
        {!isUser && thinking && (
          <ThinkingBlock text={thinking} isStreaming={isStreaming && !message.text} />
        )}
        {files.length > 0 && <FileAttachments files={files} isUser={isUser} />}
        {hasTextContent &&
          (isUser ? (
            <MarkdownContent inheritColor>{displayText}</MarkdownContent>
          ) : (
            <MarkdownContent isStreaming={isStreaming}>{displayText}</MarkdownContent>
          ))}
        {isStreaming && !hasTextContent && (
          <Box
            component="span"
            sx={{
              display: 'inline-block',
              width: 6,
              height: 16,
              bgcolor: 'text.secondary',
              animation: 'blink 1s step-end infinite',
              '@keyframes blink': { '50%': { opacity: 0 } },
            }}
          />
        )}
        {'createdAt' in message && (
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            {new Date(message.createdAt).toLocaleTimeString()}
          </Typography>
        )}
      </Paper>
    </Box>
  );
});

export default MessageBubble;
