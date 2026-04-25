import { useEffect, useState } from 'react';
import { Box, useTheme } from '@mui/material';
import { InstallMobile } from '@mui/icons-material';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)');
  if (mq?.matches) return true;
  // iOS Safari exposes a non-standard flag.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

export default function InstallAppBanner() {
  const theme = useTheme();
  const { sidebar } = theme.palette;
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(isRunningStandalone());

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Stop Chrome from auto-showing its own prompt in the URL bar so we
      // can surface a branded entry point in the sidebar.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
      }
    } finally {
      // The event is single-use per Chrome spec.
      setDeferredPrompt(null);
    }
  };

  if (installed || !deferredPrompt) return null;

  return (
    <Box
      onClick={handleClick}
      sx={{
        mx: 2,
        mb: 0.5,
        px: 1.5,
        py: 0.75,
        borderRadius: 1.5,
        bgcolor: 'primary.main',
        color: '#fff',
        fontSize: '0.7rem',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'opacity 0.2s',
        '&:hover': { opacity: 0.85 },
        '&:focus-visible': {
          outline: `2px solid ${sidebar.selectedBorder}`,
          outlineOffset: 2,
        },
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <InstallMobile sx={{ fontSize: 14 }} />
      Install app
    </Box>
  );
}
