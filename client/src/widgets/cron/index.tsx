import { useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { Add, CheckCircle } from '@mui/icons-material';
import {
  CronRow,
  useGetGatewayStatusQuery,
  useListCronJobsQuery,
  useRemoveCronJobMutation,
  useStartGatewayMutation,
  useStopGatewayMutation,
} from '../../entities/cron';
import { AddCronForm } from '../../features/cron/add';

export default function CronPanel() {
  const { data, isLoading } = useListCronJobsQuery(undefined, {
    pollingInterval: 10000,
    refetchOnMountOrArgChange: true,
  });
  // The status endpoint shells out per-profile (~600ms × N), so we poll a
  // bit slower than the job list to keep the cost bounded.
  // `isFetching` flips for refetches too (post-mutation, polling); we use
  // it to surface a loader while the banner is being recomputed —
  // otherwise users see a stale banner for ~1s after add/remove.
  const {
    data: gateway,
    isLoading: gatewayLoading,
    isFetching: gatewayFetching,
  } = useGetGatewayStatusQuery(undefined, {
    pollingInterval: 15000,
    refetchOnMountOrArgChange: true,
  });
  const [removeCron] = useRemoveCronJobMutation();
  const [startGateway, { isLoading: starting }] = useStartGatewayMutation();
  const [stopGateway, { isLoading: stopping }] = useStopGatewayMutation();
  const [showAdd, setShowAdd] = useState(false);
  const [pendingOp, setPendingOp] = useState(false);
  const [addPending, setAddPending] = useState(false);
  const [gatewayError, setGatewayError] = useState<string>('');

  const busy = isLoading || pendingOp;
  const jobs = data?.jobs ?? [];

  const handleRemove = async (id: string) => {
    setPendingOp(true);
    try {
      const job = jobs.find((j) => j.id === id);
      await removeCron({ id, profile: job?.profile }).unwrap();
    } catch {
      /* handled by RTK */
    } finally {
      setPendingOp(false);
    }
  };

  const handleStartAll = async () => {
    setGatewayError('');
    try {
      await startGateway().unwrap();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      setGatewayError(e?.data?.error || 'Failed to start gateways');
    }
  };

  const handleStopAll = async () => {
    setGatewayError('');
    try {
      await stopGateway().unwrap();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      setGatewayError(e?.data?.error || 'Failed to stop gateways');
    }
  };

  const gatewayBusy = starting || stopping || gatewayLoading;
  const missing = gateway?.profilesMissingGateway ?? [];
  const live = gateway?.profilesWithGateway ?? [];
  const showRunningPill = !missing.length && live.length > 0;
  // Distinguish first-load (no data yet) from a background refetch (we
  // have data, but it might be stale). The banner placeholder only
  // renders during first-load; for refetches we keep the existing
  // banner and dim it.
  const gatewayInitialLoading = gatewayLoading && !gateway;
  // Treat the banner as "pending" the moment any cron mutation kicks off
  // — not just when the gateway query itself starts refetching. The CLI
  // round-trip for `hermes cron create/remove` takes 1-2s before
  // tag-invalidation can fire the gateway refetch, so without this the
  // user sees a stale banner with no loading hint during that window.
  const gatewayPending =
    (gatewayFetching && !!gateway) || addPending || pendingOp || starting || stopping;

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

      {/*
        Gateway status banner. Hermes runs ONE gateway per profile — each
        profile's scheduler only sees its own jobs. So we surface per-profile
        coverage rather than a single global running/down flag, and the
        Start button starts a gateway for *every* profile that has at least
        one job whose gateway isn't up.
      */}
      {(gatewayInitialLoading ||
        (gatewayPending && !missing.length && !showRunningPill)) && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{
            mb: 2,
            px: 1.5,
            py: 0.85,
            borderRadius: 1.5,
            bgcolor: 'action.hover',
          }}
        >
          <CircularProgress size={14} thickness={5} />
          {gatewayInitialLoading ? (
            <Skeleton variant="text" width="60%" sx={{ fontSize: '0.78rem' }} />
          ) : (
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
              Updating gateway status…
            </Typography>
          )}
        </Stack>
      )}
      {missing.length > 0 && (
        <Box sx={{ position: 'relative' }}>
          <Alert
            severity="warning"
            sx={{ mb: 2, opacity: gatewayPending ? 0.7 : 1, transition: 'opacity 0.2s' }}
            action={
              <Button
                color="inherit"
                size="small"
                variant="outlined"
                disabled={gatewayBusy}
                onClick={handleStartAll}
                sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
              >
                {starting ? <CircularProgress size={14} /> : 'Start gateway'}
              </Button>
            }
          >
            <AlertTitle sx={{ fontSize: '0.85rem', fontWeight: 700, mb: 0.25 }}>
              Gateway not running for: {missing.join(', ')}
            </AlertTitle>
            <Typography sx={{ fontSize: '0.78rem' }}>
              Hermes runs a separate gateway per profile, and these profiles have scheduled
              jobs but no live daemon — so their cron jobs won&apos;t fire. Click{' '}
              <em>Start gateway</em> to install &amp; launch the user-level service for each.
            </Typography>
          </Alert>
          {gatewayPending && (
            <CircularProgress
              size={14}
              thickness={5}
              sx={{ position: 'absolute', top: 10, left: 10 }}
            />
          )}
        </Box>
      )}
      {showRunningPill && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            mb: 2,
            px: 1.5,
            py: 0.75,
            borderRadius: 1.5,
            bgcolor: 'action.hover',
            opacity: gatewayPending ? 0.7 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {gatewayPending ? (
            <CircularProgress size={14} thickness={5} />
          ) : (
            <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />
          )}
          <Typography sx={{ fontSize: '0.78rem', flex: 1 }}>
            {gatewayPending
              ? 'Updating gateway status…'
              : `Gateway running for ${live.join(', ')} — scheduled jobs will fire on time.`}
          </Typography>
          <Chip
            label="stop all"
            size="small"
            variant="outlined"
            disabled={gatewayBusy}
            onClick={handleStopAll}
            sx={{ cursor: 'pointer', fontSize: '0.68rem', height: 22 }}
          />
        </Stack>
      )}
      {gatewayError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setGatewayError('')}>
          {gatewayError}
        </Alert>
      )}

      <Collapse in={showAdd}>
        <AddCronForm onDone={() => setShowAdd(false)} onPendingChange={setAddPending} />
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
