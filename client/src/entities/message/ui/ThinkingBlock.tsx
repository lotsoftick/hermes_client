import { useState } from 'react';
import { Box, Collapse, Typography } from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { MarkdownContent } from '../../../shared/ui';

interface ThinkingBlockProps {
  text: string;
  isStreaming?: boolean;
}

export default function ThinkingBlock({ text, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  return (
    <Box sx={{ mb: 0.5 }}>
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          cursor: 'pointer',
          gap: 0.3,
          opacity: 0.6,
          '&:hover': { opacity: 0.9 },
        }}
      >
        <ExpandMore
          sx={{
            fontSize: 14,
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        />
        <Typography
          variant="caption"
          sx={{ fontStyle: 'italic', fontWeight: 500, fontSize: '0.7rem' }}
        >
          {isStreaming ? 'Thinking...' : 'Thought process'}
        </Typography>
      </Box>
      <Collapse in={expanded}>
        <Box
          sx={{
            mt: 0.5,
            pl: 1.5,
            borderLeft: '2px solid',
            borderColor: 'divider',
            fontStyle: 'italic',
            fontSize: '11px',
            color: 'text.secondary',
            '& *': { fontSize: 'inherit' },
          }}
        >
          <MarkdownContent isStreaming={isStreaming}>{text}</MarkdownContent>
        </Box>
      </Collapse>
    </Box>
  );
}
