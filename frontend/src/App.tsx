import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import LoginPage from './pages/LoginPage';
import PlatformPage from './pages/PlatformPage';
import { useSessionStore } from './store/useSessionStore';
import api from './api/client';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const setAuthenticated = useSessionStore((s) => s.setAuthenticated);
  const setBackendAvailable = useSessionStore((s) => s.setBackendAvailable);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api.get('/auth/session')
      .then(({ data }) => {
        setBackendAvailable(true);
        if (data.isAuthenticated) {
          setAuthenticated(true, {
            urlRaiz: data.entorno?.urlRaiz ?? '',
            empresa: data.empresa,
            sucursal: data.sucursal,
          });
        }
      })
      .catch(() => {
        setBackendAvailable(false);
        setAuthenticated(false, { urlRaiz: '', empresa: null, sucursal: null });
      })
      .finally(() => setChecking(false));
  }, [setAuthenticated, setBackendAvailable]);

  if (checking) {
    return (
      <Box minHeight="100vh" display="flex" alignItems="center" justifyContent="center" px={3}>
        <Stack
          spacing={2}
          alignItems="center"
          width="100%"
          maxWidth={360}
          p={4}
          border={1}
          borderColor="divider"
          borderRadius={1}
          bgcolor="background.paper"
        >
          <CircularProgress color="primary" />
          <Typography variant="h6" fontWeight={700}>
            Preparando testPlatform
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Cargando la sesion y configurando la experiencia de trabajo.
          </Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route
        path="/platform"
        element={(
          <ProtectedRoute>
            <PlatformPage />
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
