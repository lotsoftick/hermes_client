import { createTheme, type Theme } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Palette {
    sidebar: {
      background: string;
      border: string;
      text: string;
      hover: string;
      selectedBg: string;
      selectedText: string;
      selectedBorder: string;
    };
    card: {
      background: string;
      selectedBackground: string;
      shadow: string;
      selectedShadow: string;
      hoverShadow: string;
    };
    chat: {
      assistantBubble: string;
      userBubble: string;
      userText: string;
    };
  }
  interface PaletteOptions {
    sidebar?: {
      background: string;
      border: string;
      text: string;
      hover: string;
      selectedBg: string;
      selectedText: string;
      selectedBorder: string;
    };
    card?: {
      background: string;
      selectedBackground: string;
      shadow: string;
      selectedShadow: string;
      hoverShadow: string;
    };
    chat?: {
      assistantBubble: string;
      userBubble: string;
      userText: string;
    };
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isDarkBackground(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

interface ThemeConfig {
  name: string;
  primary: { main: string; light: string; dark: string; contrastText: string };
  secondary: { main: string; light: string; dark: string; contrastText: string };
  error: { main: string; light: string; dark: string };
  warning: { main: string; light: string; dark: string };
  info: { main: string; light: string; dark: string };
  success: { main: string; light: string; dark: string };
  background: { default: string; paper: string };
  text: { primary: string; secondary: string };
  divider: string;
  sidebar: {
    background: string;
    border: string;
    text: string;
    hover: string;
    selectedBg: string;
    selectedText: string;
    selectedBorder: string;
  };
  card: {
    background: string;
    selectedBackground: string;
    shadow: string;
    selectedShadow: string;
    hoverShadow: string;
  };
  chat: { assistantBubble: string; userBubble: string; userText: string };
}

function buildTheme(config: ThemeConfig): Theme {
  const { primary, background, text, divider } = config;
  const tableHeadBg =
    config.background.default === config.background.paper
      ? hexToRgba(config.text.primary, 0.04)
      : config.background.default;

  return createTheme({
    palette: {
      mode: isDarkBackground(config.background.default) ? 'dark' : 'light',
      primary: config.primary,
      secondary: config.secondary,
      error: config.error,
      warning: config.warning,
      info: config.info,
      success: config.success,
      background: config.background,
      text: config.text,
      divider: config.divider,
      card: config.card,
      sidebar: config.sidebar,
      chat: config.chat,
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h1: { fontSize: '1.75rem', fontWeight: 600, color: text.primary },
      h6: { fontSize: '1rem', fontWeight: 600, color: text.primary },
      body1: { fontSize: '0.875rem', color: text.primary },
      body2: { fontSize: '0.8125rem', color: text.secondary },
      button: { textTransform: 'none', fontWeight: 500 },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiButton: {
        defaultProps: { disableRipple: true, disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 8, padding: '8px 20px' },
          contained: {
            boxShadow: `0 2px 8px ${hexToRgba(primary.main, 0.3)}`,
            '&:hover': { boxShadow: `0 4px 16px ${hexToRgba(primary.main, 0.4)}` },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundColor: background.paper,
            '& fieldset': { borderColor: divider },
            '&:hover fieldset': { borderColor: text.secondary },
            '&.Mui-focused fieldset': { borderColor: primary.main },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.06)',
            border: 'none',
            backgroundColor: background.paper,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.06)',
            backgroundColor: background.paper,
          },
          elevation1: { boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' },
          elevation2: { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)' },
          elevation3: { boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)' },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: divider, padding: '14px 16px' },
          head: {
            fontWeight: 600,
            color: text.secondary,
            backgroundColor: tableHeadBg,
            fontSize: '0.8125rem',
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: { '&:hover': { backgroundColor: hexToRgba(text.primary, 0.02) } },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 6, fontWeight: 500, fontSize: '0.75rem' },
          colorPrimary: { backgroundColor: primary.main, color: primary.contrastText },
          colorSecondary: {
            backgroundColor: config.secondary.main,
            color: config.secondary.contrastText,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            backgroundColor: background.paper,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            color: text.secondary,
            '&:hover': { backgroundColor: hexToRgba(text.primary, 0.04) },
          },
          colorError: {
            color: config.error.main,
            '&:hover': { backgroundColor: hexToRgba(config.error.main, 0.06) },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: { '&.Mui-selected': { backgroundColor: 'transparent' } },
        },
      },
    },
  });
}

// ── Theme configs ──────────────────────────────────────────

const amberConfig: ThemeConfig = {
  name: 'Amber',
  primary: { main: '#e8a840', light: '#f0bc60', dark: '#c89030', contrastText: '#ffffff' },
  secondary: { main: '#4a9068', light: '#60a880', dark: '#387850', contrastText: '#ffffff' },
  error: { main: '#d05040', light: '#e06858', dark: '#b04030' },
  warning: { main: '#e8a840', light: '#f0bc60', dark: '#c89030' },
  info: { main: '#5a90b8', light: '#78a8cc', dark: '#4878a0' },
  success: { main: '#4a9068', light: '#60a880', dark: '#387850' },
  background: { default: '#f5f3f0', paper: '#ffffff' },
  text: { primary: '#2a2a2a', secondary: '#8a8a88' },
  divider: '#ebebeb',
  sidebar: {
    background: '#2a2a2a',
    border: '#363636',
    text: '#8a8a88',
    hover: '#363636',
    selectedBg: 'transparent',
    selectedText: '#ffffff',
    selectedBorder: '#e8a840',
  },
  card: {
    background: '#ffffff',
    selectedBackground: '#faf8f4',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#EFF5E8',
    userBubble: '#e8a840',
    userText: '#ffffff',
  },
};

const oceanConfig: ThemeConfig = {
  name: 'Ocean',
  primary: { main: '#3B82F6', light: '#60A5FA', dark: '#2563EB', contrastText: '#ffffff' },
  secondary: { main: '#06B6D4', light: '#22D3EE', dark: '#0891B2', contrastText: '#ffffff' },
  error: { main: '#EF4444', light: '#F87171', dark: '#DC2626' },
  warning: { main: '#F59E0B', light: '#FBBF24', dark: '#D97706' },
  info: { main: '#3B82F6', light: '#60A5FA', dark: '#2563EB' },
  success: { main: '#10B981', light: '#34D399', dark: '#059669' },
  background: { default: '#F1F5F9', paper: '#ffffff' },
  text: { primary: '#1E293B', secondary: '#64748B' },
  divider: '#E2E8F0',
  sidebar: {
    background: '#0F172A',
    border: '#1E293B',
    text: '#94A3B8',
    hover: '#1E293B',
    selectedBg: 'transparent',
    selectedText: '#F1F5F9',
    selectedBorder: '#3B82F6',
  },
  card: {
    background: '#ffffff',
    selectedBackground: '#F0F9FF',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#EFF6FF',
    userBubble: '#3B82F6',
    userText: '#ffffff',
  },
};

const midnightConfig: ThemeConfig = {
  name: 'Midnight',
  primary: { main: '#8B5CF6', light: '#A78BFA', dark: '#7C3AED', contrastText: '#ffffff' },
  secondary: { main: '#EC4899', light: '#F472B6', dark: '#DB2777', contrastText: '#ffffff' },
  error: { main: '#F87171', light: '#FCA5A5', dark: '#EF4444' },
  warning: { main: '#FBBF24', light: '#FCD34D', dark: '#F59E0B' },
  info: { main: '#818CF8', light: '#A5B4FC', dark: '#6366F1' },
  success: { main: '#34D399', light: '#6EE7B7', dark: '#10B981' },
  background: { default: '#13111C', paper: '#1E1B2E' },
  text: { primary: '#E2E8F0', secondary: '#94A3B8' },
  divider: '#2E2A42',
  sidebar: {
    background: '#0D0B14',
    border: '#1E1B2E',
    text: '#94A3B8',
    hover: '#1E1B2E',
    selectedBg: 'transparent',
    selectedText: '#F1F5F9',
    selectedBorder: '#8B5CF6',
  },
  card: {
    background: '#1E1B2E',
    selectedBackground: '#2A2540',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#2A2540',
    userBubble: '#8B5CF6',
    userText: '#ffffff',
  },
};

const forestConfig: ThemeConfig = {
  name: 'Forest',
  primary: { main: '#22C55E', light: '#4ADE80', dark: '#16A34A', contrastText: '#ffffff' },
  secondary: { main: '#84CC16', light: '#A3E635', dark: '#65A30D', contrastText: '#ffffff' },
  error: { main: '#EF4444', light: '#F87171', dark: '#DC2626' },
  warning: { main: '#EAB308', light: '#FACC15', dark: '#CA8A04' },
  info: { main: '#06B6D4', light: '#22D3EE', dark: '#0891B2' },
  success: { main: '#22C55E', light: '#4ADE80', dark: '#16A34A' },
  background: { default: '#F0FDF4', paper: '#ffffff' },
  text: { primary: '#14532D', secondary: '#6B7280' },
  divider: '#D1FAE5',
  sidebar: {
    background: '#14261A',
    border: '#1A3A24',
    text: '#86EFAC',
    hover: '#1A3A24',
    selectedBg: 'transparent',
    selectedText: '#F0FDF4',
    selectedBorder: '#22C55E',
  },
  card: {
    background: '#ffffff',
    selectedBackground: '#F0FDF4',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#DCFCE7',
    userBubble: '#22C55E',
    userText: '#ffffff',
  },
};

const roseConfig: ThemeConfig = {
  name: 'Rose',
  primary: { main: '#F43F5E', light: '#FB7185', dark: '#E11D48', contrastText: '#ffffff' },
  secondary: { main: '#FB923C', light: '#FDBA74', dark: '#EA580C', contrastText: '#ffffff' },
  error: { main: '#EF4444', light: '#F87171', dark: '#DC2626' },
  warning: { main: '#F59E0B', light: '#FBBF24', dark: '#D97706' },
  info: { main: '#F472B6', light: '#F9A8D4', dark: '#EC4899' },
  success: { main: '#10B981', light: '#34D399', dark: '#059669' },
  background: { default: '#FFF5F5', paper: '#ffffff' },
  text: { primary: '#3F1525', secondary: '#9CA3AF' },
  divider: '#FCE7F3',
  sidebar: {
    background: '#2A1A1F',
    border: '#3D2530',
    text: '#FDA4AF',
    hover: '#3D2530',
    selectedBg: 'transparent',
    selectedText: '#FFF1F2',
    selectedBorder: '#F43F5E',
  },
  card: {
    background: '#ffffff',
    selectedBackground: '#FFF1F2',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#FFE4E6',
    userBubble: '#F43F5E',
    userText: '#ffffff',
  },
};

const arcticConfig: ThemeConfig = {
  name: 'Arctic',
  primary: { main: '#06B6D4', light: '#22D3EE', dark: '#0891B2', contrastText: '#ffffff' },
  secondary: { main: '#6366F1', light: '#818CF8', dark: '#4F46E5', contrastText: '#ffffff' },
  error: { main: '#EF4444', light: '#F87171', dark: '#DC2626' },
  warning: { main: '#F59E0B', light: '#FBBF24', dark: '#D97706' },
  info: { main: '#06B6D4', light: '#22D3EE', dark: '#0891B2' },
  success: { main: '#10B981', light: '#34D399', dark: '#059669' },
  background: { default: '#F8FAFC', paper: '#ffffff' },
  text: { primary: '#1E293B', secondary: '#64748B' },
  divider: '#E2E8F0',
  sidebar: {
    background: '#1E293B',
    border: '#334155',
    text: '#94A3B8',
    hover: '#334155',
    selectedBg: 'transparent',
    selectedText: '#F1F5F9',
    selectedBorder: '#06B6D4',
  },
  card: {
    background: '#ffffff',
    selectedBackground: '#F0FDFA',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#E0F7FA',
    userBubble: '#06B6D4',
    userText: '#ffffff',
  },
};

const sunsetConfig: ThemeConfig = {
  name: 'Sunset',
  primary: { main: '#F97316', light: '#FB923C', dark: '#EA580C', contrastText: '#ffffff' },
  secondary: { main: '#F59E0B', light: '#FBBF24', dark: '#D97706', contrastText: '#ffffff' },
  error: { main: '#EF4444', light: '#F87171', dark: '#DC2626' },
  warning: { main: '#F59E0B', light: '#FBBF24', dark: '#D97706' },
  info: { main: '#FB923C', light: '#FDBA74', dark: '#F97316' },
  success: { main: '#10B981', light: '#34D399', dark: '#059669' },
  background: { default: '#FFFBF5', paper: '#ffffff' },
  text: { primary: '#292118', secondary: '#92857A' },
  divider: '#F5E6D3',
  sidebar: {
    background: '#1C1412',
    border: '#2E2220',
    text: '#C4A68C',
    hover: '#2E2220',
    selectedBg: 'transparent',
    selectedText: '#FFF7ED',
    selectedBorder: '#F97316',
  },
  card: {
    background: '#ffffff',
    selectedBackground: '#FFF7ED',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#FFF3E0',
    userBubble: '#F97316',
    userText: '#ffffff',
  },
};

const lavenderConfig: ThemeConfig = {
  name: 'Lavender',
  primary: { main: '#9333EA', light: '#A855F7', dark: '#7E22CE', contrastText: '#ffffff' },
  secondary: { main: '#D946EF', light: '#E879F9', dark: '#C026D3', contrastText: '#ffffff' },
  error: { main: '#EF4444', light: '#F87171', dark: '#DC2626' },
  warning: { main: '#F59E0B', light: '#FBBF24', dark: '#D97706' },
  info: { main: '#A78BFA', light: '#C4B5FD', dark: '#8B5CF6' },
  success: { main: '#10B981', light: '#34D399', dark: '#059669' },
  background: { default: '#FAF5FF', paper: '#ffffff' },
  text: { primary: '#2E1065', secondary: '#9CA3AF' },
  divider: '#EDE9FE',
  sidebar: {
    background: '#1E1033',
    border: '#2D1A4E',
    text: '#C4B5FD',
    hover: '#2D1A4E',
    selectedBg: 'transparent',
    selectedText: '#FAF5FF',
    selectedBorder: '#9333EA',
  },
  card: {
    background: '#ffffff',
    selectedBackground: '#FAF5FF',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#F3E8FF',
    userBubble: '#9333EA',
    userText: '#ffffff',
  },
};

const mochaConfig: ThemeConfig = {
  name: 'Mocha',
  primary: { main: '#D4915C', light: '#E0A87A', dark: '#B87A48', contrastText: '#ffffff' },
  secondary: { main: '#A0785C', light: '#B89478', dark: '#886040', contrastText: '#ffffff' },
  error: { main: '#F87171', light: '#FCA5A5', dark: '#EF4444' },
  warning: { main: '#FBBF24', light: '#FCD34D', dark: '#F59E0B' },
  info: { main: '#93C5FD', light: '#BFDBFE', dark: '#60A5FA' },
  success: { main: '#6EE7B7', light: '#A7F3D0', dark: '#34D399' },
  background: { default: '#1F1A16', paper: '#2C241E' },
  text: { primary: '#E8DDD0', secondary: '#A89888' },
  divider: '#3D332A',
  sidebar: {
    background: '#151210',
    border: '#2C241E',
    text: '#A89888',
    hover: '#2C241E',
    selectedBg: 'transparent',
    selectedText: '#E8DDD0',
    selectedBorder: '#D4915C',
  },
  card: {
    background: '#2C241E',
    selectedBackground: '#3D332A',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#3D332A',
    userBubble: '#D4915C',
    userText: '#ffffff',
  },
};

const slateConfig: ThemeConfig = {
  name: 'Slate',
  primary: { main: '#475569', light: '#64748B', dark: '#334155', contrastText: '#ffffff' },
  secondary: { main: '#64748B', light: '#94A3B8', dark: '#475569', contrastText: '#ffffff' },
  error: { main: '#EF4444', light: '#F87171', dark: '#DC2626' },
  warning: { main: '#F59E0B', light: '#FBBF24', dark: '#D97706' },
  info: { main: '#64748B', light: '#94A3B8', dark: '#475569' },
  success: { main: '#10B981', light: '#34D399', dark: '#059669' },
  background: { default: '#F8FAFC', paper: '#ffffff' },
  text: { primary: '#1E293B', secondary: '#94A3B8' },
  divider: '#E2E8F0',
  sidebar: {
    background: '#0F172A',
    border: '#1E293B',
    text: '#94A3B8',
    hover: '#1E293B',
    selectedBg: 'transparent',
    selectedText: '#F1F5F9',
    selectedBorder: '#64748B',
  },
  card: {
    background: '#ffffff',
    selectedBackground: '#F1F5F9',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#F1F5F9',
    userBubble: '#475569',
    userText: '#ffffff',
  },
};

const emberConfig: ThemeConfig = {
  name: 'Ember',
  primary: { main: '#DC2626', light: '#EF4444', dark: '#B91C1C', contrastText: '#ffffff' },
  secondary: { main: '#F97316', light: '#FB923C', dark: '#EA580C', contrastText: '#ffffff' },
  error: { main: '#FCA5A5', light: '#FECACA', dark: '#F87171' },
  warning: { main: '#FBBF24', light: '#FCD34D', dark: '#F59E0B' },
  info: { main: '#FB923C', light: '#FDBA74', dark: '#F97316' },
  success: { main: '#6EE7B7', light: '#A7F3D0', dark: '#34D399' },
  background: { default: '#1C1111', paper: '#2A1818' },
  text: { primary: '#FECACA', secondary: '#BF9B9B' },
  divider: '#3D2222',
  sidebar: {
    background: '#140C0C',
    border: '#2A1818',
    text: '#BF9B9B',
    hover: '#2A1818',
    selectedBg: 'transparent',
    selectedText: '#FEE2E2',
    selectedBorder: '#DC2626',
  },
  card: {
    background: '#2A1818',
    selectedBackground: '#3D2222',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#3D2222',
    userBubble: '#DC2626',
    userText: '#ffffff',
  },
};

const sandConfig: ThemeConfig = {
  name: 'Sand',
  primary: { main: '#B8860B', light: '#D4A033', dark: '#966D08', contrastText: '#ffffff' },
  secondary: { main: '#CD853F', light: '#DCA06A', dark: '#A06B30', contrastText: '#ffffff' },
  error: { main: '#D05040', light: '#E06858', dark: '#B04030' },
  warning: { main: '#D4A033', light: '#E0B855', dark: '#B88A20' },
  info: { main: '#8DA090', light: '#A8B8AA', dark: '#6E8A72' },
  success: { main: '#6B8E6B', light: '#8AAA8A', dark: '#507050' },
  background: { default: '#FAF6F0', paper: '#ffffff' },
  text: { primary: '#3D3328', secondary: '#8C8070' },
  divider: '#E8DFD0',
  sidebar: {
    background: '#2C2418',
    border: '#3D3328',
    text: '#BCA888',
    hover: '#3D3328',
    selectedBg: 'transparent',
    selectedText: '#FAF6F0',
    selectedBorder: '#B8860B',
  },
  card: {
    background: '#ffffff',
    selectedBackground: '#FAF6F0',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#FDF5E6',
    userBubble: '#B8860B',
    userText: '#ffffff',
  },
};

const nightConfig: ThemeConfig = {
  name: 'Night',
  primary: { main: '#60A5FA', light: '#93C5FD', dark: '#3B82F6', contrastText: '#ffffff' },
  secondary: { main: '#94A3B8', light: '#CBD5E1', dark: '#64748B', contrastText: '#0B1220' },
  error: { main: '#F87171', light: '#FCA5A5', dark: '#EF4444' },
  warning: { main: '#FBBF24', light: '#FCD34D', dark: '#F59E0B' },
  info: { main: '#38BDF8', light: '#7DD3FC', dark: '#0EA5E9' },
  success: { main: '#4ADE80', light: '#86EFAC', dark: '#22C55E' },
  background: { default: '#0C0E12', paper: '#16181D' },
  text: { primary: '#E4E4E7', secondary: '#A1A1AA' },
  divider: '#27272A',
  sidebar: {
    background: '#090A0D',
    border: '#1C1C1F',
    text: '#A1A1AA',
    hover: '#1C1C1F',
    selectedBg: 'transparent',
    selectedText: '#FAFAFA',
    selectedBorder: '#60A5FA',
  },
  card: {
    background: '#16181D',
    selectedBackground: '#1F2329',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#1E2229',
    userBubble: '#3B82F6',
    userText: '#ffffff',
  },
};

const studioConfig: ThemeConfig = {
  name: 'Studio',
  primary: { main: '#5B6B7A', light: '#7A8894', dark: '#3D4A56', contrastText: '#ffffff' },
  secondary: { main: '#8B9CA8', light: '#A8B5BE', dark: '#6B7A85', contrastText: '#ffffff' },
  error: { main: '#DC2626', light: '#EF4444', dark: '#B91C1C' },
  warning: { main: '#D97706', light: '#F59E0B', dark: '#B45309' },
  info: { main: '#64748B', light: '#94A3B8', dark: '#475569' },
  success: { main: '#059669', light: '#10B981', dark: '#047857' },
  background: { default: '#FAFAFA', paper: '#FFFFFF' },
  text: { primary: '#1F2937', secondary: '#6B7280' },
  divider: '#E5E7EB',
  sidebar: {
    background: '#FFFFFF',
    border: '#E5E7EB',
    text: '#6B7280',
    hover: '#F3F4F6',
    selectedBg: '#F3F4F6',
    selectedText: '#111827',
    selectedBorder: '#5B6B7A',
  },
  card: {
    background: '#FFFFFF',
    selectedBackground: '#F9FAFB',
    shadow: 'none',
    selectedShadow: 'none',
    hoverShadow: 'none',
  },
  chat: {
    assistantBubble: '#F7F8FA',
    userBubble: '#E8EDF2',
    userText: '#1F2937',
  },
};

// ── Export ──────────────────────────────────────────────────

export const themeConfigs = {
  amber: amberConfig,
  ocean: oceanConfig,
  midnight: midnightConfig,
  forest: forestConfig,
  rose: roseConfig,
  arctic: arcticConfig,
  sunset: sunsetConfig,
  lavender: lavenderConfig,
  mocha: mochaConfig,
  slate: slateConfig,
  ember: emberConfig,
  sand: sandConfig,
  night: nightConfig,
  studio: studioConfig,
} as const;

export type ThemeId = keyof typeof themeConfigs;

export const themes: Record<ThemeId, Theme> = Object.fromEntries(
  Object.entries(themeConfigs).map(([id, cfg]) => [id, buildTheme(cfg)])
) as Record<ThemeId, Theme>;

export default themes.studio;
