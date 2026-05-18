import { useEffect, useState } from 'react';
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
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  if (!files?.length) return null;

  useEffect(() => {
    const token = localStorage.getItem('token');
    const created: string[] = [];
    let cancelled = false;

    async function load() {
      const entries = await Promise.all(
        files.map(async (f) => {
          if (f.url.startsWith('blob:') || !token) return [f.filename, f.url] as const;
          const fileUrl = f.url.startsWith('http') ? f.url : `${API_BASE_URL.replace('/api', '')}${f.url}`;
          try {
            const res = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return [f.filename, ''] as const;
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            created.push(objectUrl);
            return [f.filename, objectUrl] as const;
          } catch {
            return [f.filename, ''] as const;
          }
        })
      );
      if (!cancelled) setResolvedUrls(Object.fromEntries(entries.filter(([, url]) => url)));
    }

    void load();
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mb: 0.5 }}>
      {files.map((f) => {
        const isImage = f.mimetype.startsWith('image/');
        const fileUrl = resolvedUrls[f.filename] || f.url;
        if (!fileUrl) return null;
        if (isImage) {
          return (
            <Box
              key={f.filename}
              component="a"
              href={fileUrl}
              target="_blank"
              rel="noopener"
              download={f.originalName}
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
            download={f.originalName}
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
