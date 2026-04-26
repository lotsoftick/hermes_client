import { useEffect } from 'react';
import { Button, TextField, Card, Typography, Box, CircularProgress, Alert } from '@mui/material';
import { useFormik, FormikProvider, Form } from 'formik';
import { useNavigate } from 'react-router';
import { useLoginMutation } from '../../features/auth';
import { API_BASE_URL } from '../../shared/api/baseApi';

/**
 * Translate an RTK Query error into a message that actually helps the
 * user. Previously we collapsed every error to "Login failed. Please
 * check your credentials." which made network/CORS failures look like
 * bad passwords — sent us on a goose chase the first time the app was
 * accessed over Tailscale.
 */
function describeLoginError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Login failed. Please try again.';
  const e = error as { status?: number | string; data?: unknown; error?: string };
  if (e.status === 401) return 'Login failed. Please check your credentials.';
  if (e.status === 'FETCH_ERROR') {
    return `Could not reach the API at ${API_BASE_URL}. ` +
      'If you opened this page from another device, make sure the API ' +
      'is reachable on the same hostname (and that any firewall / ' +
      'reverse proxy forwards both the client and API ports).';
  }
  if (e.status === 'PARSING_ERROR') {
    return 'API responded with something that is not JSON. The server may have crashed mid-request — check the API logs.';
  }
  if (typeof e.status === 'number' && e.status >= 500) {
    return `Server error (${e.status}). Check the API logs.`;
  }
  if (e.data && typeof e.data === 'object' && 'message' in e.data && typeof (e.data as { message: unknown }).message === 'string') {
    return (e.data as { message: string }).message;
  }
  if (typeof e.error === 'string') return e.error;
  return 'Login failed. Please try again.';
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [login, { isLoading, error }] = useLoginMutation();

  useEffect(() => {
    if (localStorage.getItem('token')) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const formik = useFormik({
    initialValues: { email: '', password: '' },
    onSubmit: async (values) => {
      try {
        await login(values).unwrap();
        navigate('/');
      } catch {
        // Error is handled by RTK Query
      }
    },
  });

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
      }}
    >
      <Card
        sx={{
          width: 400,
          p: 4,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Box pb={2}>
          <Typography variant="h6">Login</Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          <FormikProvider value={formik}>
            <Form>
              {error && (
                <Alert severity="error" sx={{ marginBottom: 2 }}>
                  {describeLoginError(error)}
                </Alert>
              )}
              <TextField
                name="email"
                label="Email"
                size="small"
                variant="outlined"
                fullWidth
                sx={{ marginBottom: 2 }}
                onChange={formik.handleChange}
                value={formik.values.email}
              />
              <TextField
                name="password"
                label="Password"
                type="password"
                size="small"
                variant="outlined"
                fullWidth
                sx={{ marginBottom: 2 }}
                onChange={formik.handleChange}
                value={formik.values.password}
              />
              <Button
                variant="contained"
                color="primary"
                fullWidth
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? <CircularProgress size={25} /> : 'Login'}
              </Button>
            </Form>
          </FormikProvider>
        </Box>
      </Card>
    </Box>
  );
}
