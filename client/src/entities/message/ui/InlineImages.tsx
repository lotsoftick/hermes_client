import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { API_BASE_URL } from '../../../shared/api';

/**
 * Render images an agent produced (referenced by tool output). URLs are
 * shown directly; relative `/api/...` srcs hit our authenticated serve
 * endpoint, so we fetch them with the bearer token and swap in an object
 * URL — a bare `<img src>` can't carry the Authorization header.
 */

/** Derive a sensible download filename from either a `?path=` src or a URL. */
function fileNameFromSrc(src: string): string {
  try {
    const url = new URL(src, window.location.origin);
    const fromQuery = url.searchParams.get('path');
    const base = (fromQuery ?? url.pathname).split('/').pop() ?? '';
    return base || 'image.svg';
  } catch {
    return 'image.svg';
  }
}
export default function InlineImages({ images }: { images: string[] }) {
  const [resolved, setResolved] = useState<Record<string, string>>({});

  useEffect(() => {
    const token = localStorage.getItem('token');
    const created: string[] = [];
    let cancelled = false;

    async function load() {
      const entries = await Promise.all(
        images.map(async (src) => {
          if (src.startsWith('http') || src.startsWith('blob:')) return [src, src] as const;
          if (!token) return [src, ''] as const;
          const full = `${API_BASE_URL.replace(/\/api$/, '')}${src}`;
          try {
            const res = await fetch(full, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return [src, ''] as const;
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            created.push(objectUrl);
            return [src, objectUrl] as const;
          } catch {
            return [src, ''] as const;
          }
        })
      );
      if (!cancelled) setResolved(Object.fromEntries(entries.filter(([, url]) => url)));
    }

    void load();
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [images]);

  if (!images?.length) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, my: 0.5 }}>
      {images.map((src) => {
        const resolvedSrc = resolved[src];
        if (!resolvedSrc) return null;
        // SVGs can carry inline <script>. Rendering them in <img> is safe
        // (secure static mode), but opening one as a top-level blob: doc
        // would run that script in our origin and could read the auth
        // token. So for SVGs we force a download on click instead of
        // navigating to the live document; rasters open normally.
        const isSvg = /\.svg(?:\?|$)/i.test(src);
        return (
          <Box
            key={src}
            component="a"
            href={resolvedSrc}
            target={isSvg ? undefined : '_blank'}
            rel="noopener"
            download={isSvg ? fileNameFromSrc(src) : undefined}
            sx={{ display: 'block', borderRadius: 1, overflow: 'hidden' }}
          >
            <Box
              component="img"
              src={resolvedSrc}
              alt="generated"
              sx={{ width: '100%', height: 'auto', display: 'block', borderRadius: 1 }}
            />
          </Box>
        );
      })}
    </Box>
  );
}
