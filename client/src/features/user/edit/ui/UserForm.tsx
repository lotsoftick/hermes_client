import { useEffect, useState } from 'react';
import { useFormik } from 'formik';
import { Box, Typography, IconButton, TextField, Button, CircularProgress } from '@mui/material';
import { Close } from '@mui/icons-material';
import {
  useGetUserQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
} from '../../../../entities/user';

type FieldErrors = Record<string, string[]>;

function parseFieldErrors(err: unknown): FieldErrors | null {
  const typed = err as { status?: number; data?: Record<string, unknown> } | undefined;
  if (typed?.status === 422 && typed.data && typeof typed.data === 'object') {
    return typed.data as FieldErrors;
  }
  return null;
}

const inputSx = {
  mb: 1.5,
  '& .MuiOutlinedInput-root': { borderRadius: 1.5 },
  '& input': { fontSize: '0.85rem' },
  '& label': { fontSize: '0.85rem' },
  '& .MuiFormHelperText-root': { fontSize: '0.7rem', mx: 0.5 },
};

const emptyValues = { name: '', lastName: '', email: '', password: '', phone: '' };

interface UserFormProps {
  userId: string | null;
  onDone: () => void;
}

export default function UserForm({ userId, onDone }: UserFormProps) {
  const isEdit = Boolean(userId);
  const { data: existing, isLoading: loadingUser } = useGetUserQuery(userId!, { skip: !userId });
  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [updateUser, { isLoading: isUpdating }] = useUpdateUserMutation();
  const [serverErrors, setServerErrors] = useState<FieldErrors | null>(null);
  const [generalError, setGeneralError] = useState('');

  const formik = useFormik({
    initialValues: emptyValues,
    onSubmit: async (values) => {
      setServerErrors(null);
      setGeneralError('');
      try {
        if (isEdit && userId) {
          const data: Record<string, string> = {
            name: values.name,
            lastName: values.lastName,
            email: values.email,
            phone: values.phone,
          };
          if (values.password) data.password = values.password;
          await updateUser({ id: userId, data }).unwrap();
        } else {
          await createUser(values).unwrap();
        }
        onDone();
      } catch (err: unknown) {
        const fe = parseFieldErrors(err);
        if (fe) {
          setServerErrors(fe);
        } else {
          const msg = (err as { data?: { error?: string } })?.data?.error;
          setGeneralError(msg || (isEdit ? 'Failed to update user' : 'Failed to create user'));
        }
      }
    },
  });

  useEffect(() => {
    if (isEdit && existing) {
      formik.resetForm({
        values: {
          name: existing.name || '',
          lastName: existing.lastName || '',
          email: existing.email || '',
          password: '',
          phone: existing.phone || '',
        },
      });
    } else if (!isEdit) {
      formik.resetForm({ values: emptyValues });
    }
    setServerErrors(null);
    setGeneralError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, isEdit, userId]);

  const saving = isCreating || isUpdating;
  const err = (field: string) => serverErrors?.[field]?.join('. ') || '';

  return (
    <Box sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, flex: 1 }}>
          {isEdit ? 'Edit User' : 'Add User'}
        </Typography>
        <IconButton size="small" onClick={onDone}>
          <Close sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {loadingUser ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={20} />
        </Box>
      ) : (
        <form onSubmit={formik.handleSubmit}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              fullWidth
              size="small"
              label="First Name"
              {...formik.getFieldProps('name')}
              error={!!err('name')}
              helperText={err('name')}
              sx={inputSx}
            />
            <TextField
              fullWidth
              size="small"
              label="Last Name"
              {...formik.getFieldProps('lastName')}
              error={!!err('lastName')}
              helperText={err('lastName')}
              sx={inputSx}
            />
          </Box>

          <TextField
            fullWidth
            size="small"
            label="Email"
            type="email"
            {...formik.getFieldProps('email')}
            error={!!err('email')}
            helperText={err('email')}
            sx={inputSx}
          />

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              fullWidth
              size="small"
              label={isEdit ? 'Password (leave empty to keep)' : 'Password'}
              type="password"
              {...formik.getFieldProps('password')}
              error={!!err('password')}
              helperText={err('password')}
              sx={inputSx}
            />
            <TextField
              fullWidth
              size="small"
              label="Phone"
              {...formik.getFieldProps('phone')}
              error={!!err('phone')}
              helperText={err('phone')}
              sx={inputSx}
            />
          </Box>

          {generalError && (
            <Typography sx={{ fontSize: '0.75rem', color: 'error.main', mb: 1 }}>
              {generalError}
            </Typography>
          )}

          <Button
            type="submit"
            variant="contained"
            size="small"
            disabled={saving}
            sx={{ textTransform: 'none', fontSize: '0.8rem' }}
          >
            {saving ? <CircularProgress size={16} /> : isEdit ? 'Save' : 'Create User'}
          </Button>
        </form>
      )}
    </Box>
  );
}
