import { useState } from 'react';
import { Box, TextField, Typography, useTheme } from '@mui/material';
import { useCreateAgentMutation } from '../../../../entities/agent';

interface CreateAgentFormProps {
  /**
   * Called once the agent has been successfully created. Receives the new
   * agent's db id, the resolved hermes profile name, and the user-typed
   * display name. The parent is responsible for opening the post-create
   * configuration drawer so it survives the form unmounting.
   */
  onCreated: (agent: { dbId: string; profile: string; name: string }) => void;
  onCancel: () => void;
}

export default function CreateAgentForm({ onCreated, onCancel }: CreateAgentFormProps) {
  const { sidebar } = useTheme().palette;
  const [createAgent, { isLoading: isCreating }] = useCreateAgentMutation();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError('');
    try {
      const saved = await createAgent({ name: trimmed }).unwrap();
      const profile =
        saved.hermesProfile ||
        trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      setName('');
      onCreated({ dbId: saved._id, profile, name: trimmed });
    } catch (err: unknown) {
      const data = (err as { data?: Record<string, string[]> })?.data;
      const msg =
        data?.name?.[0] || Object.values(data || {}).flat()[0] || 'Failed to create agent';
      setError(msg as string);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <Box sx={{ mb: 1, flexShrink: 0 }}>
      <TextField
        fullWidth
        size="small"
        autoFocus
        placeholder="Agent name (becomes hermes profile)"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError('');
        }}
        onKeyDown={handleKeyDown}
        disabled={isCreating}
        error={!!error}
        sx={{
          '& .MuiOutlinedInput-root': {
            bgcolor: sidebar.hover,
            borderRadius: 1.5,
            pr: 0.5,
            '& fieldset': { borderColor: error ? 'error.main' : 'transparent' },
            '&:hover fieldset': { borderColor: error ? 'error.main' : sidebar.text },
            '&.Mui-focused fieldset': {
              borderColor: error ? 'error.main' : sidebar.selectedBorder,
            },
            '& input': { color: sidebar.selectedText, fontSize: '0.8rem', py: 0.8, px: 1.5 },
          },
        }}
      />
      {error && (
        <Typography sx={{ color: 'error.main', fontSize: '0.65rem', mx: 0.5, mt: 0.25 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
