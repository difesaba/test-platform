import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Drawer,
  IconButton,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Toolbar,
  Tooltip,
  Typography,
  Alert,
  Skeleton,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';
import ApiRoundedIcon from '@mui/icons-material/ApiRounded';
import ScreenshotMonitorRoundedIcon from '@mui/icons-material/ScreenshotMonitorRounded';
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded';
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
  const { empresa, sucursal, clear } = useSessionStore();
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
      <Card>
        <CardContent>
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
        </CardContent>
      </Card>
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
      <AppBar position="sticky">
        <Toolbar>
          {!isDesktop && (
            <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)}>
              <MenuRoundedIcon />
            </IconButton>
          )}

          <Stack direction="row" spacing={1.5} alignItems="center" flex={1} minWidth={0}>
            <ScienceRoundedIcon color="inherit" />
            <Box minWidth={0}>
              <Typography variant="h6" fontWeight={800} color="inherit" noWrap>
                TestPlatform
              </Typography>
              <Typography variant="body2" color="inherit" noWrap>
                Dashboard de gestion de pruebas y automatizacion
              </Typography>
            </Box>
          </Stack>

          {isSmall && (
            <Stack spacing={0.25} alignItems="flex-end" minWidth={0}>
              {empresa?.nombre && (
                <Typography variant="body2" fontWeight={700} color="inherit" noWrap>
                  {empresa.nombre}
                </Typography>
              )}
              <Typography variant="caption" color="inherit" noWrap>
                Entorno: {environment.label}
              </Typography>
            </Stack>
          )}

          <Tooltip title="Actualizar modulos">
            <IconButton color="inherit" onClick={loadModules}>
              <RefreshRoundedIcon />
            </IconButton>
          </Tooltip>
          <Button color="inherit" startIcon={<LogoutRoundedIcon />} onClick={handleLogout}>
            Salir
          </Button>
        </Toolbar>
      </AppBar>

      <Box display="flex" minHeight="calc(100vh - 72px)">
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

        {isDesktop && (
          <Box width={drawerWidth} flexShrink={0} borderRight={1} borderColor="divider" bgcolor="background.paper">
            {drawerContent}
          </Box>
        )}

        <Box component="main" flex={1} minWidth={0} px={isDesktop ? 3 : 2} py={isDesktop ? 3 : 2}>
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Stack spacing={3}>
                  <Stack direction={isDesktop ? 'row' : 'column'} spacing={2} justifyContent="space-between" alignItems={isDesktop ? 'center' : 'flex-start'}>
                    <Box>
                      <Typography variant="h4">
                        {selected?.pageName ?? selected?.submoduleName ?? selected?.moduleName ?? 'Centro de control'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {selected
                          ? 'Gestiona pruebas, automatizaciones y navegacion del contexto activo.'
                          : 'Selecciona un modulo desde el panel lateral para empezar.'}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip label={`${metrics.moduleCount} modulos`} variant="outlined" />
                      <Chip label={`${metrics.pageCount} paginas`} variant="outlined" />
                      <Chip label={`${metrics.submoduleCount} submodulos`} variant="outlined" />
                    </Stack>
                  </Stack>

                  <Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {selected && <Chip label={`Modulo: ${selected.moduleName}`} variant="outlined" />}
                      {selected?.submoduleName && <Chip label={`Submodulo: ${selected.submoduleName}`} variant="outlined" />}
                      {selected?.pageName && <Chip label={`Pagina: ${selected.pageName}`} color="primary" variant="outlined" />}
                      {!selected && <Chip label="Sin seleccion activa" variant="outlined" />}
                    </Stack>
                    {selected?.pageUrl && (
                      <Typography variant="body2" color="primary.main">
                        {selected.pageUrl}
                      </Typography>
                    )}
                  </Box>

                  {loading ? renderLoadingSkeleton() : (
                    <>
                      {!selected && (
                        <Alert severity="info" variant="outlined">
                          Usa el panel lateral para abrir un modulo o una pagina y trabajar sobre sus pruebas.
                        </Alert>
                      )}

                      {selected && !selected.pageName && (
                        <ModuleOverview
                          selected={selected}
                          modules={modules}
                          onRefresh={loadModules}
                          onNotify={(message, severity = 'success') => setFeedback({ message, severity })}
                        />
                      )}

                      {selected?.pageName && (
                        <Stack spacing={2}>
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

                          {activeTab === 'API' && <ApiTestTab selected={selected} onNotify={(message, severity = 'success') => setFeedback({ message, severity })} />}
                          {activeTab === 'UI' && <UiTestTab selected={selected} onNotify={(message, severity = 'success') => setFeedback({ message, severity })} />}
                          {activeTab === 'E2E' && <E2eTab selected={selected} onNotify={(message, severity = 'success') => setFeedback({ message, severity })} />}
                        </Stack>
                      )}
                    </>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Box>
      </Box>

      <Snackbar
        open={Boolean(feedback.message)}
        autoHideDuration={3200}
        onClose={() => setFeedback((current) => ({ ...current, message: '' }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setFeedback((current) => ({ ...current, message: '' }))} severity={feedback.severity} variant="filled">
          {feedback.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
