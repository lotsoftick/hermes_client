import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ThemeId } from '../../app/theme';

interface ThemeState {
  themeId: ThemeId;
}

const stored = localStorage.getItem('themeId');
const validIds: ThemeId[] = ['amber', 'ocean', 'midnight', 'forest', 'rose', 'arctic', 'sunset', 'lavender', 'mocha', 'slate', 'ember', 'sand', 'night', 'studio'];

const initialState: ThemeState = {
  themeId: validIds.includes(stored as ThemeId) ? (stored as ThemeId) : 'studio',
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<ThemeId>) {
      state.themeId = action.payload;
      localStorage.setItem('themeId', action.payload);
    },
  },
});

export const { setTheme } = themeSlice.actions;
export default themeSlice.reducer;
