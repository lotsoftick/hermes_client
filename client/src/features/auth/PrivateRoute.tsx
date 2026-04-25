import { Navigate, Outlet } from 'react-router';
import { Box, CircularProgress } from '@mui/material';
import { useGetMeQuery } from './api';
import Layout from '../../widgets/layout';

export default function PrivateRoute() {
  const token = localStorage.getItem('token');

  const { isLoading, isError } = useGetMeQuery(undefined, {
    skip: !token,
    refetchOnMountOrArgChange: true,
  });

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    localStorage.removeItem('token');
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
