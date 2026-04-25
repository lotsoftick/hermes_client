import { Box, Chip, useTheme } from '@mui/material';
import { InsertDriveFileOutlined } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { API_BASE_URL } from '../../../shared/api';
import type { MessageFile } from '../api';

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileAttachmentsProps {
  files: MessageFile[];
  isUser: boolean;
}

export default function FileAttachments({ files, isUser }: FileAttachmentsProps) {
  const theme = useTheme();
  const { userText } = theme.palette.chat;
  if (!files?.length) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mb: 0.5 }}>
      {files.map((f) => {
        const isImage = f.mimetype.startsWith('image/');
        const fileUrl =
          f.url.startsWith('blob:') || f.url.startsWith('http')
            ? f.url
            : `${API_BASE_URL.replace('/api', '')}${f.url}`;
        if (isImage) {
          return (
            <Box
              key={f.filename}
              component="a"
              href={fileUrl}
              target="_blank"
              rel="noopener"
              sx={{ display: 'block', maxWidth: 200, borderRadius: 1, overflow: 'hidden' }}
            >
              <Box
                component="img"
                src={fileUrl}
                alt={f.originalName}
                sx={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  maxHeight: 160,
                  objectFit: 'cover',
                }}
              />
            </Box>
          );
        }
        return (
          <Chip
            key={f.filename}
            component="a"
            href={fileUrl}
            target="_blank"
            rel="noopener"
            icon={<InsertDriveFileOutlined sx={{ fontSize: 14 }} />}
            label={`${f.originalName} (${formatFileSize(f.size)})`}
            size="small"
            clickable
            sx={{
              maxWidth: 220,
              bgcolor: isUser ? alpha(userText, 0.12) : 'background.paper',
              color: isUser ? userText : 'text.primary',
              fontSize: '0.72rem',
            }}
          />
        );
      })}
    </Box>
  );
}
