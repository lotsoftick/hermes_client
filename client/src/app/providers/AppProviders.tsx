import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { BrowserRouter } from 'react-router';
import { store } from '../store/store';
import { themes } from '../theme';
import { useAppSelector } from '../store/hooks';

function ThemeBridge({ children }: { children: ReactNode }) {
  const themeId = useAppSelector((s) => s.theme.themeId);
  return (
    <ThemeProvider theme={themes[themeId]}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <ThemeBridge>
        <BrowserRouter>{children}</BrowserRouter>
      </ThemeBridge>
    </Provider>
  );
}
