import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router';
import { CircularProgress, Box } from '@mui/material';

const Login = lazy(() => import('../pages/login'));
const PrivateRoute = lazy(() => import('../features/auth/PrivateRoute'));
const Account = lazy(() => import('../pages/account'));
const Users = lazy(() => import('../pages/user'));
const AgentChat = lazy(() => import('../pages/agent'));
const AgentSettings = lazy(() => import('../pages/agentSettings'));
const Plugins = lazy(() => import('../pages/plugins'));
const Skills = lazy(() => import('../pages/skills'));
const Cron = lazy(() => import('../pages/cron'));

function Loading() {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
      <CircularProgress />
    </Box>
  );
}

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Suspense fallback={<Loading />}>
            <Login />
          </Suspense>
        }
      />
      <Route
        path="/"
        element={
          <Suspense fallback={<Loading />}>
            <PrivateRoute />
          </Suspense>
        }
      >
        <Route
          path="account"
          element={
            <Suspense fallback={<Loading />}>
              <Account />
            </Suspense>
          }
        />
        <Route
          path="users"
          element={
            <Suspense fallback={<Loading />}>
              <Users />
            </Suspense>
          }
        />
        <Route
          path="plugins"
          element={
            <Suspense fallback={<Loading />}>
              <Plugins />
            </Suspense>
          }
        />
        <Route
          path="skills"
          element={
            <Suspense fallback={<Loading />}>
              <Skills />
            </Suspense>
          }
        />
        <Route
          path="cron"
          element={
            <Suspense fallback={<Loading />}>
              <Cron />
            </Suspense>
          }
        />
        <Route
          path="agent/:agentId/chat/:conversationId"
          element={
            <Suspense fallback={<Loading />}>
              <AgentChat />
            </Suspense>
          }
        />
        <Route
          path="agent/:agentId/settings/:tab?"
          element={
            <Suspense fallback={<Loading />}>
              <AgentSettings />
            </Suspense>
          }
        />
        <Route path="*" element="404" />
      </Route>
    </Routes>
  );
}

export default App;
