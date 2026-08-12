import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Backdrop, Box, Button, Chip, Dialog, DialogContent, DialogTitle,
  List, ListItemButton, ListItemText, Stack, Typography,
} from '@mui/material';
import api from '@/shared/api/client';
import { useSessionStore } from '@/shared/store/useSessionStore';
import type { Client, SucursalOption } from '@/shared/types/platform';
import { T } from '@/shared/theme/launcherTokens';
import SessionLauncher from '@/features/login/components/SessionLauncher';
import InstallQueue from '@/features/login/components/InstallQueue';
import LoginInfo from '@/features/login/components/LoginInfo';

const RECENT_KEY = 'tp_recent_clients';
// Columna derecha de instalaciones oculta por el momento — poner en true para restaurarla.
const SHOW_INSTALL_QUEUE = false;
const ENTORNO_COLOR: Record<string, 'success' | 'warning' | 'info' | 'default'> = {
  produccion: 'success', prueba: 'info', replica: 'warning',
};

function pushRecent(id: number) {
  try {
    const cur: number[] = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...cur.filter((x) => x !== id)].slice(0, 8)));
  } catch { /* noop */ }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuthenticated = useSessionStore((s) => s.setAuthenticated);
  const backendAvailable = useSessionStore((s) => s.backendAvailable);

  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [entering, setEntering] = useState(false);
  const [enteringClientId, setEnteringClientId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [sucursalPrompt, setSucursalPrompt] = useState<{ client: Client; sucursales: SucursalOption[] } | null>(null);
  const enteringClient = clients.find((c) => c.id === enteringClientId) ?? sucursalPrompt?.client ?? null;

  useEffect(() => {
    if (!backendAvailable) {
      setLoadingClients(false);
      setError('El backend no está disponible. Verifica el servidor y el puerto configurado para /api.');
      return;
    }
    api.get('/clients/sinco')
      .then(({ data }) => setClients(data))
      .catch(() => setError('No se pudo cargar la lista de entornos disponibles.'))
      .finally(() => setLoadingClients(false));
  }, [backendAvailable]);

  const extractError = (e: unknown): string | undefined =>
    e && typeof e === 'object' && 'response' in e
      ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
      : undefined;

  const loginAbortRef = useRef<AbortController | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!entering) return;
    const t = setTimeout(() => cancelBtnRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [entering]);
  const cancelEntering = () => {
    loginAbortRef.current?.abort();
    setEntering(false);
    setEnteringClientId(null);
  };

  const doLogin = async (client: Client, sucursalId?: number) => {
    setError('');
    setEntering(true);
    setEnteringClientId(client.id);
    const controller = new AbortController();
    loginAbortRef.current = controller;
    try {
      const { data } = await api.post('/auth/quick-login', {
        loginUrl: client.loginUrl,
        urlRaiz: client.urlRaiz,
        empresaNombre: client.empresaNombre ?? client.appName,
        empNombre: client.empNombre,
        entornoName: client.entorno,
        empresaId: client.empId,
        sucursalId,
      }, { signal: controller.signal });

      if (data?.needsSucursal) {
        setSucursalPrompt({ client, sucursales: (data.sucursales ?? []) as SucursalOption[] });
        setEntering(false);
        setEnteringClientId(null);
        return;
      }

      pushRecent(client.id);
      setAuthenticated(true, {
        urlRaiz: client.urlRaiz,
        empNombre: client.empNombre ?? '',
        entornoNombre: client.appName ?? '',
        empresa: data.empresa,
        sucursal: data.sucursal,
      });
      navigate('/dashboard');
    } catch (e: unknown) {
      const cancelled = controller.signal.aborted
        || (e as { code?: string; name?: string })?.code === 'ERR_CANCELED'
        || (e as { name?: string })?.name === 'CanceledError';
      if (!cancelled) setError(extractError(e) ?? 'No fue posible iniciar sesión con la empresa seleccionada.');
      setEntering(false);
      setEnteringClientId(null);
    }
  };

  const pickSucursal = (sucursalId: number) => {
    if (!sucursalPrompt) return;
    const client = sucursalPrompt.client;
    setSucursalPrompt(null);
    doLogin(client, sucursalId);
  };

  const safeClients = clients.filter((c) => c.entorno !== 'produccion');
  const groupCount = new Set(safeClients.map((c) => c.empId)).size;
  const envCount = safeClients.length;

  return (
    <Box sx={{ minHeight: '100vh', background: T.surface.page, display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <Box sx={{ height: 56, px: 3, background: T.surface.card, borderBottom: `1px solid ${T.border.card}`, display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
        <Box component="img" src="/testverse-icon.png" alt="TestVerse" sx={{ height: 30, width: 'auto', display: 'block' }} />
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: T.text.primary }}>TestVerse</Typography>
        <Box sx={{ fontSize: 12, fontWeight: 600, color: T.primary.main, background: T.primary.tint, border: `1px solid ${T.primary.tintBorder}`, borderRadius: `${T.radius.pill}px`, px: 1.25, py: '3px' }}>Acceso corporativo</Box>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 13, color: T.text.muted }}>Soporte SINCO</Typography>
        <Box sx={{ width: 30, height: 30, borderRadius: '50%', background: T.primary.tint, color: T.primary.main, fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center' }}>SS</Box>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, p: 3 }}>
        <Box sx={{ maxWidth: SHOW_INSTALL_QUEUE ? 1560 : 1040, mx: 'auto', display: 'grid', gridTemplateColumns: { xs: '1fr', md: SHOW_INSTALL_QUEUE ? 'minmax(0,1fr) 420px' : 'minmax(0,620px)', lg: SHOW_INSTALL_QUEUE ? '288px minmax(0,1fr) 420px' : '300px minmax(0,620px)' }, justifyContent: SHOW_INSTALL_QUEUE ? 'start' : 'center', gap: { xs: 2.5, lg: 4 }, alignItems: 'start' }}>
          <Box sx={{ display: { xs: 'none', lg: 'block' } }}>
            <LoginInfo groupCount={groupCount} envCount={envCount} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <SessionLauncher
              clients={clients}
              loadingClients={loadingClients}
              enteringClientId={enteringClientId}
              onEnter={(c) => doLogin(c)}
            />
          </Box>
          {SHOW_INSTALL_QUEUE && <InstallQueue />}
        </Box>
      </Box>

      {/* Popup de sucursal (solo si el backend la pide) */}
      <Dialog open={Boolean(sucursalPrompt)} onClose={() => setSucursalPrompt(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pb: 1 }}>
          Elige la sucursal
          {sucursalPrompt?.client.empresaNombre && (
            <Typography variant="body2" color="text.secondary">{sucursalPrompt.client.empresaNombre}</Typography>
          )}
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <List disablePadding>
            {sucursalPrompt?.sucursales.map((s) => (
              <ListItemButton key={s.Id} onClick={() => pickSucursal(s.Id)}>
                <ListItemText primary={s.Nombre} />
                {s.entorno && <Chip label={s.entorno} size="small" variant="outlined" color={ENTORNO_COLOR[s.entorno] ?? 'default'} />}
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
      </Dialog>

      <Backdrop open={entering} onKeyDown={(e) => { if (e.key === 'Escape') cancelEntering(); }} role="dialog" aria-modal="true" aria-label="Iniciando sesión" sx={{ zIndex: (t) => t.zIndex.modal + 1, color: '#fff', bgcolor: 'rgba(9, 22, 40, 0.74)', backdropFilter: 'blur(6px)' }}>
        <Stack spacing={2.5} alignItems="center">
          <Box sx={{ position: 'relative', width: 132, height: 132, display: 'grid', placeItems: 'center' }}>
            <Box sx={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'conic-gradient(from 0deg, #6366F1, #818CF8, #4F46E5, #6366F1)',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
              '@keyframes tvspin': { to: { transform: 'rotate(360deg)' } },
              animation: 'tvspin 1.15s linear infinite',
            }} />
            <Box sx={{
              position: 'absolute', inset: 16, borderRadius: '50%', filter: 'blur(16px)',
              background: 'radial-gradient(circle, rgba(129,140,248,.5), transparent 70%)',
              '@keyframes tvglow': { '0%,100%': { opacity: .45 }, '50%': { opacity: .95 } },
              animation: 'tvglow 1.6s ease-in-out infinite',
            }} />
            <Box component="img" src="/testverse-icon.png" alt="TestVerse" sx={{
              width: 74, height: 'auto', position: 'relative',
              filter: 'drop-shadow(0 6px 16px rgba(0,0,0,.4))',
              '@keyframes tvpulse': { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.06)' } },
              animation: 'tvpulse 1.6s ease-in-out infinite',
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }} />
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 700, fontSize: 16, letterSpacing: '.2px' }}>{enteringClient ? `Iniciando sesión en ${enteringClient.appName}…` : 'Ingresando…'}</Typography>
            {enteringClient && (
              <Typography variant="body2" sx={{ opacity: .78, mt: .5 }}>{enteringClient.empresaNombre}{enteringClient.entorno === 'produccion' ? ' · Producción' : ''}</Typography>
            )}
            <Box sx={{ mt: 1.75, width: 220, height: 4, mx: 'auto', borderRadius: 2, overflow: 'hidden', bgcolor: 'rgba(255,255,255,.16)' }}>
              <Box sx={{
                height: '100%', width: '38%', borderRadius: 2, background: `linear-gradient(90deg, ${T.primary.dark}, ${T.primary.main})`,
                '@keyframes tvslide': { '0%': { transform: 'translateX(-120%)' }, '100%': { transform: 'translateX(360%)' } },
                animation: 'tvslide 1.2s ease-in-out infinite',
              }} />
            </Box>
          </Box>
          <Button ref={cancelBtnRef} onClick={cancelEntering} variant="text" sx={{ mt: 0.5, color: 'rgba(255,255,255,.85)', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: 'rgba(255,255,255,.12)', color: '#fff' }, '&:focus-visible': { outline: '2px solid #fff', outlineOffset: '2px' } }}>Cancelar</Button>
        </Stack>
      </Backdrop>
    </Box>
  );
}
