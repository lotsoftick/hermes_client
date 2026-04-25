import { useState, memo, useCallback } from 'react';
import { Box, Paper, Typography, IconButton, Chip, alpha, useTheme } from '@mui/material';
import { DeleteOutline, ContentCopy, Done, ScheduleOutlined } from '@mui/icons-material';
import { DeleteButton, MarkdownContent } from '../../../shared/ui';
import { useDeleteMessageMutation, type Message } from '../api';
import type { ParsedCronMessage } from '../lib/parseCronMessage';

interface CronMessageBubbleProps {
  message: Message | { text: string; role: string };
  messageId?: string;
  parsed: ParsedCronMessage;
}

const CronMessageBubble = memo(function CronMessageBubble({
  message,
  messageId,
  parsed,
}: CronMessageBubbleProps) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const theme = useTheme();
  const [deleteMessage] = useDeleteMessageMutation();

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDelete = useCallback(() => {
    if (messageId && 'conversationId' in message) {
      deleteMessage({ id: messageId, conversationId: message.conversationId });
    }
  }, [messageId, message, deleteMessage]);

  const createdAt = 'createdAt' in message ? message.createdAt : null;
  const accent = theme.palette.info?.main || theme.palette.primary.main;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
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
          px: 1.75,
          py: 1.25,
          position: 'relative',
          bgcolor: alpha(accent, theme.palette.mode === 'dark' ? 0.08 : 0.06),
          border: `1px dashed ${alpha(accent, 0.35)}`,
          borderRadius: 3,
          borderTopRightRadius: 4,
          maxWidth: { xs: '90%', sm: '80%', md: 'min(70%, 100%)' },
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

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            icon={<ScheduleOutlined sx={{ fontSize: 14 }} />}
            label={parsed.cronName || 'Scheduled task'}
            sx={{
              height: 22,
              fontSize: 11,
              fontWeight: 600,
              bgcolor: alpha(accent, 0.18),
              color: accent,
              '& .MuiChip-icon': { color: accent, ml: 0.5 },
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
          {parsed.currentTime && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
              {parsed.currentTime}
            </Typography>
          )}
        </Box>

        {parsed.body && (
          <Box sx={{ color: 'text.primary' }}>
            <MarkdownContent>{parsed.body}</MarkdownContent>
          </Box>
        )}

        {createdAt && (
          <Typography
            variant="caption"
            sx={{ opacity: 0.6, display: 'block', mt: 0.5, fontSize: 10.5 }}
          >
            {new Date(createdAt).toLocaleTimeString()}
          </Typography>
        )}
      </Paper>
    </Box>
  );
});

export default CronMessageBubble;
