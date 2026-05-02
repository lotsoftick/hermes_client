import { Box, Typography } from '@mui/material';
import { useGetMeQuery } from '../../features/auth/api';
import { UserForm } from '../../features/user/edit';

export default function AccountPage() {
  const { data: me } = useGetMeQuery();
  const userId = String((me as { _id?: string | number } | undefined)?._id || '');

  if (!userId) return null;

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto', width: '100%' }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Account
      </Typography>
      <UserForm userId={userId} onDone={() => {}} />
    </Box>
  );
}
