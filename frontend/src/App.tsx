import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import LoginPage from '@/features/login/view/LoginPage';
import PlatformPage from '@/features/platform/view/PlatformPage';
import AddonsPage from '@/features/addons/view/AddonsPage';
import ConfiguracionPage from '@/features/configuracion/view/ConfiguracionPage';
import AuditoriaPage from '@/features/auditoria/view/AuditoriaPage';
import SuitesPage from '@/features/suites/view/SuitesPage';
import CoveragePage from '@/features/coverage/view/CoveragePage';
import FlakyPage from '@/features/flaky/view/FlakyPage';
import DashboardPage from '@/features/dashboard/view/DashboardPage';
import RequisitosPage from '@/features/requisitos/view/RequisitosPage';
import AlertasPage from '@/features/alertas/view/AlertasPage';
import AppLayout from '@/shared/layout/AppLayout';
import { useSessionStore } from '@/shared/store/useSessionStore';
import { getSession } from '@/features/login/services/auth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
}

const TORRE_SESSION_KEY = 'torre_session_at';
const TORRE_SESSION_TTL = 25 * 60 * 1000; // 25 min

function needsTorreSession(): boolean {
  const last = Number(localStorage.getItem(TORRE_SESSION_KEY) ?? 0);
  return Date.now() - last > TORRE_SESSION_TTL;
}

function markTorreSessionLoaded() {
  localStorage.setItem(TORRE_SESSION_KEY, String(Date.now()));
}

export default function App() {
  const setAuthenticated = useSessionStore((s) => s.setAuthenticated);
  const setBackendAvailable = useSessionStore((s) => s.setBackendAvailable);
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const [checking, setChecking] = useState(true);
  const [showTorreFrame, setShowTorreFrame] = useState(false);

  useEffect(() => {
    getSession()
      .then((res) => {
        if (res.success && res.data) {
          setBackendAvailable(true);
          if (res.data.isAuthenticated) {
            setAuthenticated(true, {
              urlRaiz: res.data.entorno?.urlRaiz ?? '',
              empresa: res.data.empresa,
              sucursal: res.data.sucursal,
            });
            if (needsTorreSession()) setShowTorreFrame(true);
          }
        } else {
          setBackendAvailable(false);
          setAuthenticated(false, { urlRaiz: '', empresa: null, sucursal: null });
        }
      })
      .finally(() => setChecking(false));
  }, [setAuthenticated, setBackendAvailable]);

  // Disparar iframe cuando el usuario hace login (además del check inicial de sesión)
  useEffect(() => {
    if (isAuthenticated && needsTorreSession()) setShowTorreFrame(true);
  }, [isAuthenticated]);

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
    <>
      {/* Sesión Torre — solo carga si pasaron más de 25 min desde la última vez */}
      {isAuthenticated && showTorreFrame && (
        <iframe
          src="https://core.sincoerp.com/SincoSoporte/Torre.html"
          title="torre-session"
          style={{ width: 1, height: 1, opacity: 0, position: 'absolute', left: -9999, border: 'none', pointerEvents: 'none' }}
          onLoad={() => { markTorreSessionLoaded(); setShowTorreFrame(false); }}
        />
      )}
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/platform" element={<PlatformPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/coverage" element={<CoveragePage />} />
          <Route path="/flaky" element={<FlakyPage />} />
          <Route path="/alertas" element={<AlertasPage />} />
          <Route path="/requisitos" element={<RequisitosPage />} />
          <Route path="/suites" element={<SuitesPage />} />
          <Route path="/auditoria" element={<AuditoriaPage />} />
          <Route path="/configuracion" element={<ConfiguracionPage />} />
          <Route path="/addons" element={<AddonsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
