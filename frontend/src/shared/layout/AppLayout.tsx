import { useEffect, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Snackbar,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import WidgetsRoundedIcon from '@mui/icons-material/WidgetsRounded';
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded';
import DonutLargeRoundedIcon from '@mui/icons-material/DonutLargeRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import Sidebar from '@/features/platform/components/Sidebar';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useSessionStore } from '@/shared/store/useSessionStore';
import { useModuleStore } from '@/shared/store/useModuleStore';
import { logout } from '@/features/login/services/auth';
import { getEnvironmentMeta } from '@/shared/utils/platform';
import { T } from '@/shared/theme/launcherTokens';

const drawerWidth = 320;

type Severity = 'success' | 'error' | 'info';

// Rail de navegación: cada entrada apunta a una ruta y se resalta cuando está activa.
const RAIL_ITEMS: { label: string; route: string; icon: ReactNode }[] = [
  { label: 'Plataforma', route: '/platform', icon: <WidgetsRoundedIcon /> },
  { label: 'Dashboard', route: '/dashboard', icon: <QueryStatsRoundedIcon /> },
  { label: 'Cobertura', route: '/coverage', icon: <DonutLargeRoundedIcon /> },
  { label: 'Estabilidad (flaky)', route: '/flaky', icon: <BoltRoundedIcon /> },
  { label: 'Alertas', route: '/alertas', icon: <NotificationsActiveRoundedIcon /> },
  { label: 'Trazabilidad', route: '/requisitos', icon: <AssignmentTurnedInRoundedIcon /> },
  { label: 'Suites', route: '/suites', icon: <LayersRoundedIcon /> },
  { label: 'Auditoría', route: '/auditoria', icon: <FactCheckRoundedIcon /> },
  { label: 'Configuración', route: '/configuracion', icon: <SettingsRoundedIcon /> },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const isSmall = useMediaQuery(theme.breakpoints.up('sm'));

  const { empresa, sucursal, empNombre, entornoNombre, clear } = useSessionStore();
  const { modules, loading, loaded, loadModules } = useCatalogStore();
  const { setSelected } = useModuleStore();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [notify, setNotify] = useState<{ message: string; severity: Severity }>({ message: '', severity: 'success' });
  const [treeCollapsed, setTreeCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('testverse.moduleTree.collapsed') === '1'; } catch { return false; }
  });
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);

  const toggleTree = (v: boolean) => {
    setTreeCollapsed(v);
    try { localStorage.setItem('testverse.moduleTree.collapsed', v ? '1' : '0'); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!loaded) loadModules();
  }, [loaded, loadModules]);

  const environment = getEnvironmentMeta(sucursal?.entorno);
  const showTree = location.pathname.startsWith('/platform');

  // ⌘K global (desktop): si el árbol está colapsado, lo re-expande y enfoca la búsqueda.
  // Si está expandido, el propio Sidebar ya maneja ⌘K, así que aquí no hacemos nada.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        const treeVisible = location.pathname.startsWith('/platform');
        if (treeVisible && isDesktop && treeCollapsed) {
          e.preventDefault();
          toggleTree(false);
          setSearchFocusSignal((n) => n + 1);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [location.pathname, isDesktop, treeCollapsed]);

  const handleLogout = async () => {
    await logout();
    clear();
    navigate('/');
  };

  const railButton = (label: string, icon: ReactNode, active: boolean, onClick: () => void) => (
    <Tooltip key={label} title={label} placement="right">
      <IconButton
        onClick={onClick}
        sx={{
          color: active ? T.primary.main : T.text.secondary,
          bgcolor: active ? T.primary.tint : 'transparent',
          borderRadius: 2,
          '&:hover': { bgcolor: active ? T.primary.tint : T.surface.hover, color: active ? T.primary.main : T.text.primary },
        }}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );

  const railContent = (
    <>
      {RAIL_ITEMS.map((item) =>
        railButton(item.label, item.icon, location.pathname === item.route, () => {
          setMobileOpen(false);
          navigate(item.route);
        }),
      )}
      <Box sx={{ flex: 1 }} />
      {railButton('Actualizar módulos', <RefreshRoundedIcon />, false, () => loadModules())}
    </>
  );

  const treeContent = (
    <Sidebar
      modules={modules}
      loading={loading}
      onRefresh={loadModules}
      onNotify={(message, severity = 'success') => setNotify({ message, severity })}
      onNavigate={() => {
        setMobileOpen(false);
        navigate('/platform');
      }}
      collapsible={isDesktop}
      onCollapse={isDesktop ? () => toggleTree(true) : undefined}
      focusSearchSignal={searchFocusSignal}
    />
  );

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── Slim top bar ── */}
      <AppBar position="static" elevation={0} sx={{ flexShrink: 0, bgcolor: T.surface.card, color: T.text.primary, borderBottom: `1px solid ${T.border.card}` }}>
        <Toolbar>
          {!isDesktop && (
            <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)}>
              <MenuRoundedIcon />
            </IconButton>
          )}

          <Stack direction="row" spacing={1} alignItems="center" flex={1} minWidth={0}>
            <Box component="img" src="/testverse-icon.png" alt="TestVerse" sx={{ height: 30, width: 'auto', display: 'block' }} />
            <Typography variant="h6" fontWeight={800} color="inherit" noWrap>
              TestVerse
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
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mr: 1, maxWidth: 360, cursor: 'default' }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600, color: T.text.primary }}>
                  {empresa?.nombre ?? empNombre}
                </Typography>
                {sucursal?.nombre && (
                  <>
                    <Typography variant="body2" sx={{ color: T.text.faint }}>·</Typography>
                    <Typography variant="body2" noWrap sx={{ color: T.text.secondary }}>{sucursal.nombre}</Typography>
                  </>
                )}
              </Box>
            </Tooltip>
          )}

          <Chip
            label={environment.label}
            color={environment.color as 'success' | 'warning' | 'error'}
            size="small"
            sx={{ mr: 1 }}
          />

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

      {/* ── Banda de entorno (solo señaliza prod/prueba; en otros casos se funde con el tema) ── */}
      <Box sx={{
        flexShrink: 0,
        height: sucursal?.entorno === 'produccion' || sucursal?.entorno === 'prueba' ? '3px' : '1px',
        bgcolor: sucursal?.entorno === 'produccion' ? 'warning.main'
               : sucursal?.entorno === 'prueba'     ? 'info.main'
               : T.border.card,
      }} />

      {/* ── Alerta producción ── */}
      {sucursal?.entorno === 'produccion' && (
        <Alert severity="warning" variant="filled" sx={{ borderRadius: 0, py: 0.5 }}>
          Estás ejecutando pruebas en <strong>Producción</strong>. Verifica antes de correr pruebas destructivas.
        </Alert>
      )}

      {/* ── Body ── ocupa el alto restante; solo el contenido central hace scroll ── */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {/* Icon rail (desktop) */}
        {isDesktop && (
          <Box
            sx={{
              width: 64,
              flexShrink: 0,
              borderRight: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              height: '100%',
              overflowY: 'auto',
            }}
          >
            <Stack alignItems="center" spacing={0.5} sx={{ py: 1.5, minHeight: '100%' }}>
              {railContent}
            </Stack>
          </Box>
        )}

        {/* Module tree (desktop) — expandido */}
        {isDesktop && showTree && !treeCollapsed && (
          <Box
            width={drawerWidth}
            flexShrink={0}
            borderRight={1}
            borderColor="divider"
            bgcolor="background.paper"
            sx={{ height: '100%', overflow: 'hidden' }}
          >
            {treeContent}
          </Box>
        )}

        {/* Module tree (desktop) — colapsado a tira delgada */}
        {isDesktop && showTree && treeCollapsed && (
          <Box
            sx={{
              width: 40,
              flexShrink: 0,
              borderRight: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              height: '100%',
              overflowY: 'auto',
            }}
          >
            <Stack alignItems="center" spacing={0.5} sx={{ py: 1.5 }}>
              <Tooltip title="Expandir módulos" placement="right">
                <IconButton size="small" onClick={() => toggleTree(false)}>
                  <ChevronRightRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Divider flexItem sx={{ my: 0.5 }} />
              {modules.map((m) => (
                <Tooltip key={m.name} title={m.name} placement="right">
                  <IconButton
                    size="small"
                    onClick={() => { setSelected({ moduleName: m.name }); toggleTree(false); }}
                  >
                    <WidgetsRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ))}
            </Stack>
          </Box>
        )}

        {/* Mobile drawer: rail (horizontal) + module tree */}
        {!isDesktop && (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Stack
                direction="row"
                flexWrap="wrap"
                useFlexGap
                spacing={0.5}
                sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}
              >
                {railContent}
              </Stack>
              {showTree && (
                <Box sx={{ flex: 1, overflow: 'hidden' }}>
                  {treeContent}
                </Box>
              )}
            </Box>
          </Drawer>
        )}

        {/* Content */}
        <Box
          component="main"
          flex={1}
          minWidth={0}
          sx={{ height: '100%', overflow: 'auto', bgcolor: T.surface.page }}
        >
          <Outlet />
        </Box>
      </Box>

      {/* ── Snackbar (Sidebar feedback) ── */}
      <Snackbar
        open={Boolean(notify.message)}
        autoHideDuration={3200}
        onClose={() => setNotify((current) => ({ ...current, message: '' }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setNotify((current) => ({ ...current, message: '' }))}
          severity={notify.severity}
          variant="filled"
        >
          {notify.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
