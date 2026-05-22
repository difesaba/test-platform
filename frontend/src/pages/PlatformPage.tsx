import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  Drawer,
  IconButton,
  Link,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Toolbar,
  Tooltip,
  Typography,
  Alert,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import ApiRoundedIcon from '@mui/icons-material/ApiRounded';
import ScreenshotMonitorRoundedIcon from '@mui/icons-material/ScreenshotMonitorRounded';
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import Sidebar from '../components/layout/Sidebar';
import ApiTestTab from '../components/testing/ApiTestTab';
import UiTestTab from '../components/testing/UiTestTab';
import E2eTab from '../components/testing/E2eTab';
import ModuleOverview from '../components/testing/ModuleOverview';
import { useModuleStore } from '../store/useModuleStore';
import { useSessionStore } from '../store/useSessionStore';
import api from '../api/client';
import type { ModuleItem } from '../types/platform';
import { getEnvironmentMeta } from '../utils/platform';

const drawerWidth = 320;
const tabs = [
  { value: 'API', label: 'API', icon: <ApiRoundedIcon fontSize="small" /> },
  { value: 'UI', label: 'UI', icon: <ScreenshotMonitorRoundedIcon fontSize="small" /> },
  { value: 'E2E', label: 'E2E', icon: <PlayCircleOutlineRoundedIcon fontSize="small" /> },
] as const;

type TabValue = typeof tabs[number]['value'];

export default function PlatformPage() {
  const navigate = useNavigate();
  const { empresa, sucursal, empNombre, entornoNombre, clear } = useSessionStore();
  const { selected } = useModuleStore();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const isSmall = useMediaQuery(theme.breakpoints.up('sm'));

  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabValue>('API');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ message: string; severity: 'success' | 'error' | 'info' }>({
    message: '',
    severity: 'success',
  });

  const loadModules = useCallback(() => {
    setLoading(true);
    api.get('/modules')
      .then(({ data }) => setModules(data))
      .catch(() => setFeedback({ message: 'No se pudo cargar la estructura de modulos.', severity: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  const handleLogout = async () => {
    await api.post('/auth/logout');
    clear();
    navigate('/');
  };

  const environment = getEnvironmentMeta(sucursal?.entorno);
  const metrics = useMemo(() => {
    const pageCount = modules.reduce((total, module) => total + (module.pages?.length ?? 0), 0);
    const submoduleCount = modules.reduce((total, module) => total + (module.submodules?.length ?? 0), 0);
    return { moduleCount: modules.length, pageCount, submoduleCount };
  }, [modules]);

  const renderLoadingSkeleton = () => (
    <Stack spacing={2.5}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1}>
          <Skeleton variant="rounded" width={96} height={28} />
          <Skeleton variant="rounded" width={120} height={28} />
          <Skeleton variant="rounded" width={120} height={28} />
        </Stack>
        <Skeleton variant="text" width="32%" height={42} />
        <Skeleton variant="text" width="52%" />
      </Stack>
      <Skeleton variant="rounded" height={360} />
    </Stack>
  );

  const drawerContent = (
    <Sidebar
      modules={modules}
      loading={loading}
      onRefresh={loadModules}
      onNotify={(message, severity = 'success') => setFeedback({ message, severity })}
      onNavigate={() => setMobileOpen(false)}
    />
  );

  return (
    <Box minHeight="100vh">
      {/* ── AppBar ── */}
      <AppBar position="sticky">
        <Toolbar>
          {!isDesktop && (
            <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)}>
              <MenuRoundedIcon />
            </IconButton>
          )}

          <Stack direction="row" spacing={1.5} alignItems="center" flex={1} minWidth={0}>
            <ScienceRoundedIcon color="inherit" />
            <Typography variant="h6" fontWeight={800} color="inherit" noWrap>
              TestPlatform
            </Typography>
          </Stack>

          {isSmall && (
            <Tooltip
              title={
                <Stack spacing={0.5} sx={{ p: 0.5 }}>
                  {empNombre && <Box><b>Grupo:</b> {empNombre}</Box>}
                  {entornoNombre && <Box><b>Entorno:</b> {entornoNombre}</Box>}
                  {empresa?.nombre && <Box><b>Empresa:</b> {empresa.nombre}</Box>}
                  {sucursal?.nombre && <Box><b>Sucursal:</b> {sucursal.nombre}</Box>}
                </Stack>
              }
              placement="bottom-end"
            >
              <Typography
                variant="caption"
                color="inherit"
                noWrap
                sx={{ maxWidth: 340, mr: 1.5, opacity: 0.92, cursor: 'default' }}
              >
                {[empNombre, entornoNombre, empresa?.nombre, sucursal?.nombre]
                  .filter(Boolean)
                  .join(' › ')}
              </Typography>
            </Tooltip>
          )}

          <Chip
            label={environment.label}
            color={environment.color as 'success' | 'warning' | 'error'}
            size="small"
            sx={{ mr: 1 }}
          />

          <Tooltip title="Actualizar modulos">
            <IconButton color="inherit" onClick={loadModules}>
              <RefreshRoundedIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Volver al selector de empresa sin cerrar sesión">
            <Button color="inherit" startIcon={<SwapHorizRoundedIcon />} onClick={() => navigate('/')}>
              Cambiar
            </Button>
          </Tooltip>

          <Tooltip title="Cerrar sesión completamente">
            <IconButton color="inherit" onClick={handleLogout}>
              <LogoutRoundedIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* ── Banda de entorno ── */}
      <Box sx={{
        height: 4,
        bgcolor: sucursal?.entorno === 'produccion' ? 'warning.main'
               : sucursal?.entorno === 'prueba'     ? 'info.main'
               : 'grey.400',
      }} />

      {/* ── Alerta producción ── */}
      {sucursal?.entorno === 'produccion' && (
        <Alert severity="warning" variant="filled" sx={{ borderRadius: 0, py: 0.5 }}>
          Estás ejecutando pruebas en <strong>Producción</strong>. Verifica antes de correr pruebas destructivas.
        </Alert>
      )}

      {/* ── Body ── */}
      <Box display="flex" minHeight="calc(100vh - 72px)">
        {/* Mobile drawer */}
        {!isDesktop && (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
          >
            {drawerContent}
          </Drawer>
        )}

        {/* Desktop sidebar */}
        {isDesktop && (
          <Box width={drawerWidth} flexShrink={0} borderRight={1} borderColor="divider" bgcolor="background.paper">
            {drawerContent}
          </Box>
        )}

        {/* Main content */}
        <Box component="main" flex={1} minWidth={0} px={isDesktop ? 3 : 2} py={isDesktop ? 3 : 2}>
          <Stack spacing={2}>
            {/* ── Content header ── */}
            <Box>
              <Typography variant="h5">
                {selected?.pageName ?? selected?.submoduleName ?? selected?.moduleName ?? 'Centro de control'}
              </Typography>

              {selected && (
                <Breadcrumbs separator="›" sx={{ mt: 0.5 }}>
                  {selected.moduleName && (
                    <Typography variant="body2">{selected.moduleName}</Typography>
                  )}
                  {selected.submoduleName && (
                    <Typography variant="body2">{selected.submoduleName}</Typography>
                  )}
                  {selected.pageName && (
                    <Typography variant="body2" color="primary">{selected.pageName}</Typography>
                  )}
                </Breadcrumbs>
              )}

              {selected?.pageUrl && (
                <Box mt={0.5}>
                  <Link href={selected.pageUrl} target="_blank" variant="caption" color="primary" underline="hover">
                    {selected.pageUrl}
                    <OpenInNewRoundedIcon fontSize="inherit" sx={{ ml: 0.5, verticalAlign: 'middle' }} />
                  </Link>
                </Box>
              )}

              {!loading && (
                <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                  {metrics.moduleCount} módulos · {metrics.pageCount} páginas · {metrics.submoduleCount} submódulos
                </Typography>
              )}
            </Box>

            {/* ── Loading skeleton ── */}
            {loading && renderLoadingSkeleton()}

            {/* ── Content body ── */}
            {!loading && (
              <>
                {/* Empty state — no selection */}
                {!selected && (
                  <Box textAlign="center" py={6}>
                    <ScienceRoundedIcon sx={{ fontSize: 56, color: 'text.disabled' }} />
                    <Typography variant="h6" color="text.secondary" mt={1}>
                      Selecciona un modulo
                    </Typography>
                    <Typography variant="body2" color="text.disabled">
                      Usa el panel lateral para abrir un modulo o pagina.
                    </Typography>
                  </Box>
                )}

                {/* Module / submodule overview (no page selected) */}
                {selected && !selected.pageName && (
                  <ModuleOverview
                    selected={selected}
                    modules={modules}
                    onRefresh={loadModules}
                    onNotify={(message, severity = 'success') => setFeedback({ message, severity })}
                  />
                )}

                {/* Page tabs */}
                {selected?.pageName && (
                  <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                    <Box borderBottom={1} borderColor="divider">
                      <Tabs
                        value={activeTab}
                        onChange={(_event, nextValue: TabValue) => setActiveTab(nextValue)}
                        variant="scrollable"
                        allowScrollButtonsMobile
                      >
                        {tabs.map((tab) => (
                          <Tab key={tab.value} value={tab.value} label={tab.label} icon={tab.icon} iconPosition="start" />
                        ))}
                      </Tabs>
                    </Box>

                    <Box p={3}>
                      {activeTab === 'API' && (
                        <ApiTestTab
                          selected={selected}
                          onNotify={(message, severity = 'success') => setFeedback({ message, severity })}
                        />
                      )}
                      {activeTab === 'UI' && (
                        <UiTestTab
                          selected={selected}
                          onNotify={(message, severity = 'success') => setFeedback({ message, severity })}
                        />
                      )}
                      {activeTab === 'E2E' && (
                        <E2eTab
                          selected={selected}
                          onNotify={(message, severity = 'success') => setFeedback({ message, severity })}
                        />
                      )}
                    </Box>
                  </Paper>
                )}
              </>
            )}
          </Stack>
        </Box>
      </Box>

      {/* ── Snackbar feedback ── */}
      <Snackbar
        open={Boolean(feedback.message)}
        autoHideDuration={3200}
        onClose={() => setFeedback((current) => ({ ...current, message: '' }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setFeedback((current) => ({ ...current, message: '' }))}
          severity={feedback.severity}
          variant="filled"
        >
          {feedback.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
