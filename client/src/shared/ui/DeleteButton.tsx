import { useState } from 'react';
import { IconButton, Popover, Button, Stack, Typography, CircularProgress } from '@mui/material';
import { Delete } from '@mui/icons-material';

interface DeleteButtonProps {
  onConfirm: () => void | Promise<unknown>;
  isLoading?: boolean;
  message?: string;
  renderTrigger?: (onClick: (e: React.MouseEvent<HTMLElement>) => void) => React.ReactNode;
}

export default function DeleteButton({
  onConfirm,
  message = 'Delete this item?',
  renderTrigger,
}: DeleteButtonProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    if (!deleting) setAnchorEl(null);
  };

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
      setAnchorEl(null);
    }
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger(handleClick)
      ) : (
        <IconButton size="small" color="error" onClick={handleClick}>
          <Delete fontSize="small" />
        </IconButton>
      )}

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{
          vertical: 'center',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'center',
          horizontal: 'left',
        }}
        slotProps={{
          paper: {
            sx: {
              py: 0.8,
              px: 1.5,
              ml: 1.5,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
              overflow: 'visible',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: '50%',
                left: -5,
                transform: 'translateY(-50%)',
                width: 0,
                height: 0,
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
                borderRight: '6px solid',
                borderRightColor: 'background.paper',
              },
            },
          },
        }}
      >
        <Typography variant="caption" sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
          {message}
        </Typography>
        <Stack direction="row" spacing={0.5}>
          <Button
            size="small"
            onClick={handleClose}
            disabled={deleting}
            sx={{ minWidth: 0, px: 1, py: 0.2, fontSize: '0.7rem' }}
          >
            No
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={handleConfirm}
            disabled={deleting}
            sx={{ minWidth: 0, px: 1, py: 0.2, fontSize: '0.7rem' }}
          >
            {deleting ? <CircularProgress size={12} color="inherit" /> : 'Yes'}
          </Button>
        </Stack>
      </Popover>
    </>
  );
}
