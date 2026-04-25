import { Box, TextField, useTheme } from '@mui/material';
import { Search } from '@mui/icons-material';

interface SidebarSearchProps {
  value: string;
  onChange: (v: string) => void;
}

export default function SidebarSearch({ value, onChange }: SidebarSearchProps) {
  const { sidebar } = useTheme().palette;
  return (
    <Box sx={{ px: 2, mb: 1, flexShrink: 0 }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Search..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        slotProps={{
          input: {
            startAdornment: <Search sx={{ fontSize: 16, color: sidebar.text, mr: 0.5 }} />,
          },
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            bgcolor: sidebar.hover,
            borderRadius: 1.5,
            '& fieldset': { borderColor: 'transparent' },
            '&:hover fieldset': { borderColor: sidebar.text },
            '&.Mui-focused fieldset': { borderColor: sidebar.selectedBorder },
            '& input': { color: sidebar.selectedText, fontSize: '0.78rem', py: 0.7, px: 0.5 },
          },
        }}
      />
    </Box>
  );
}
