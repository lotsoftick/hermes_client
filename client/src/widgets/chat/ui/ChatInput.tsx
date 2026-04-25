import { useState, useRef, useCallback } from 'react';
import { Box, TextField, IconButton, Chip } from '@mui/material';
import {
  Send,
  AttachFile,
  Close,
  InsertDriveFileOutlined,
  ImageOutlined,
} from '@mui/icons-material';

interface ChatInputProps {
  onSend: (text: string, files: File[]) => Promise<void>;
  isStreaming: boolean;
}

export default function ChatInput({ onSend, isStreaming }: ChatInputProps) {
  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value),
    []
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    setPendingFiles((prev) => [...prev, ...Array.from(selected)].slice(0, 5));
    e.target.value = '';
    inputRef.current?.focus();
  };

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if ((!trimmed && pendingFiles.length === 0) || isStreaming) return;

    const filesToSend = [...pendingFiles];
    setText('');
    setPendingFiles([]);
    await onSend(trimmed, filesToSend);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [text, pendingFiles, isStreaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box
      sx={{
        px: { xs: 2, sm: 2, md: 3 },
        pb: { xs: 'max(12px, env(safe-area-inset-bottom))', md: 2 },
        pt: 1,
        minWidth: 0,
        flexShrink: 0,
      }}
    >
      {pendingFiles.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {pendingFiles.map((f, i) => (
            <Chip
              key={`${f.name}-${i}`}
              icon={
                f.type.startsWith('image/') ? (
                  <ImageOutlined sx={{ fontSize: 14 }} />
                ) : (
                  <InsertDriveFileOutlined sx={{ fontSize: 14 }} />
                )
              }
              label={f.name}
              size="small"
              onDelete={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
              deleteIcon={<Close sx={{ fontSize: 14 }} />}
              sx={{ maxWidth: 200, fontSize: '0.72rem' }}
            />
          ))}
        </Box>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          px: 1.5,
          py: 0.5,
          bgcolor: 'background.paper',
          '&:focus-within': { borderColor: 'primary.main' },
        }}
      >
        <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileChange} />
        <IconButton
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming || pendingFiles.length >= 5}
          size="small"
          sx={{ mr: 0.5, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
        >
          <AttachFile sx={{ fontSize: 18 }} />
        </IconButton>
        <TextField
          inputRef={inputRef}
          fullWidth
          multiline
          minRows={1}
          maxRows={8}
          variant="standard"
          placeholder="Type a message..."
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          slotProps={{ input: { disableUnderline: true, sx: { py: 1, fontSize: '0.9rem' } } }}
          sx={{ minWidth: 0, flex: 1 }}
        />
        <IconButton
          onClick={handleSend}
          disabled={(!text.trim() && pendingFiles.length === 0) || isStreaming}
          size="small"
          sx={{
            ml: 1,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            '&:hover': { bgcolor: 'primary.dark' },
            '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
            width: 32,
            height: 32,
          }}
        >
          <Send sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Box>
  );
}
