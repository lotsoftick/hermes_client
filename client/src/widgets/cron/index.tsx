import { useState } from 'react';
import { Box, CircularProgress, Collapse, IconButton, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import {
  CronRow,
  useListCronJobsQuery,
  useRemoveCronJobMutation,
} from '../../entities/cron';
import { AddCronForm } from '../../features/cron/add';

export default function CronPanel() {
  const { data, isLoading, isFetching } = useListCronJobsQuery();
  const [removeCron] = useRemoveCronJobMutation();
  const [showAdd, setShowAdd] = useState(false);
  const [pendingOp, setPendingOp] = useState(false);

  const busy = isLoading || pendingOp || isFetching;
  const jobs = data?.jobs ?? [];

  const handleRemove = async (id: string) => {
    setPendingOp(true);
    try {
      await removeCron({ id }).unwrap();
    } catch {
      /* handled by RTK */
    } finally {
      setPendingOp(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto', width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>
          Cron Jobs
        </Typography>
        {!busy && (
          <Typography variant="body2" color="text.secondary">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </Typography>
        )}
        <IconButton
          size="small"
          onClick={() => setShowAdd((prev) => !prev)}
          sx={{
            bgcolor: showAdd ? 'primary.main' : 'action.hover',
            color: showAdd ? 'primary.contrastText' : 'text.primary',
            '&:hover': { bgcolor: showAdd ? 'primary.dark' : 'action.selected' },
          }}
        >
          <Add sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      <Collapse in={showAdd}>
        <AddCronForm onDone={() => setShowAdd(false)} />
      </Collapse>

      {busy ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          {jobs.map((job) => (
            <CronRow key={job.id} job={job} onRemove={handleRemove} />
          ))}
          {jobs.length === 0 && (
            <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
              No cron jobs configured
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
