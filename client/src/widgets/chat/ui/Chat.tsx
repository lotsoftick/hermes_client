import { useState } from 'react';
import { Box } from '@mui/material';
import { useChat } from '../model/useChat';
import ChatHeader from './ChatHeader';
import SessionSettingsBar from './SessionSettingsBar';
import MessageList from './MessageList';
import ChatInput from './ChatInput';

interface ChatProps {
  agentId: string;
  conversationId: string;
}

/**
 * Full chat experience for a given agent/conversation: header,
 * optional session-settings bar, message list and input.
 */
export default function Chat({ agentId, conversationId }: ChatProps) {
  const [showSessionSettings, setShowSessionSettings] = useState(false);
  const chat = useChat(conversationId);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: { xs: '100vh', md: 'calc(100vh - 48px)' },
        minWidth: 0,
        width: '100%',
        overflowX: 'hidden',
      }}
    >
      <ChatHeader
        agentId={agentId}
        conversationId={conversationId}
        showSessionSettings={showSessionSettings}
        onToggleSessionSettings={() => setShowSessionSettings((v) => !v)}
      />
      {showSessionSettings && (
        <SessionSettingsBar agentId={agentId} conversationId={conversationId} />
      )}
      <MessageList chat={chat} />
      <ChatInput onSend={chat.send} isStreaming={chat.isStreaming} />
    </Box>
  );
}
