import { useEffect } from 'react';
import { Button, TextField, Card, Typography, Box, CircularProgress, Alert } from '@mui/material';
import { useFormik, FormikProvider, Form } from 'formik';
import { useNavigate } from 'react-router';
import { useLoginMutation } from '../../features/auth';

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
                  Login failed. Please check your credentials.
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
