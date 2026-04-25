import { configureStore } from '@reduxjs/toolkit';
import { createLogger } from 'redux-logger';
import { baseApi } from '../../shared/api';
import { authReducer } from '../../features/auth';
import { themeReducer } from '../../features/theme';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    theme: themeReducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefaultMiddleware) => {
    const middleware = getDefaultMiddleware().concat(baseApi.middleware);
    if (import.meta.env.DEV) {
      const logger = createLogger({ collapsed: false });
      return middleware.concat(logger);
    }
    return middleware;
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
