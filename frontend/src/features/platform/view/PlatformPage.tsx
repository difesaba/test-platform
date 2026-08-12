import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Box,
  Breadcrumbs,
  IconButton,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  Alert,
} from '@mui/material';
import WidgetsRoundedIcon from '@mui/icons-material/WidgetsRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import ApiRoundedIcon from '@mui/icons-material/ApiRounded';
import ScreenshotMonitorRoundedIcon from '@mui/icons-material/ScreenshotMonitorRounded';
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import ApiTestTab from '@/features/apiTests/components/ApiTestTab';
import UiTestTab from '@/features/uiTests/components/UiTestTab';
import E2eTab from '@/features/e2e/components/E2eTab';
import ModuleOverview from '@/features/platform/components/ModuleOverview';
import { useModuleStore, type SelectedModule } from '@/shared/store/useModuleStore';
import { useSessionStore } from '@/shared/store/useSessionStore';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import type { SubmoduleItem } from '@/shared/types/platform';
import { resolveAutomationUrl } from '@/shared/utils/platform';
import { T } from '@/shared/theme/launcherTokens';
import { cardHoverSx } from '@/shared/theme/motion';

const tabs = [
  { value: 'E2E',   label: 'E2E',   icon: <PlayCircleOutlineRoundedIcon fontSize="small" /> },
  { value: 'UI',    label: 'UI',    icon: <ScreenshotMonitorRoundedIcon fontSize="small" /> },
  { value: 'API',   label: 'API',   icon: <ApiRoundedIcon fontSize="small" /> },
] as const;

type TabValue = typeof tabs[number]['value'];

// Identidad estable de una página en Recientes/Favoritos: preferimos la URL (única),
// con fallback a módulo + ruta + nombre. Evita duplicados entre entradas viejas y nuevas.
function recentKey(s: SelectedModule): string {
  if (s.pageUrl && s.pageUrl.trim()) return 'url:' + s.pageUrl.trim();
  const path = (s.submodulePath ?? (s.submoduleName ? [s.submoduleName] : [])).join('/');
  return [s.moduleName, path, s.pageName ?? ''].join('::');
}
function dedupRecents(list: SelectedModule[]): SelectedModule[] {
  const seen = new Set<string>();
  const out: SelectedModule[] = [];
  for (const s of list) {
    const k = recentKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

export default function PlatformPage() {
  const { sucursal, empNombre, urlRaiz } = useSessionStore();
  const { selected, setSelected } = useModuleStore();
  const { modules, loading, loadModules } = useCatalogStore();
  const destUrl = selected ? (resolveAutomationUrl(selected.pageUrl, urlRaiz) || '') : '';
  let destHost = '';
  try { destHost = destUrl ? new URL(destUrl).host : ''; } catch { destHost = ''; }
  const crumbSegs = (selected
    ? [
        selected.moduleName,
        ...(selected.submodulePath?.length ? selected.submodulePath : (selected.submoduleName ? [selected.submoduleName] : [])),
        ...(selected.pageName ? [selected.pageName] : []),
      ]
    : []).filter(Boolean) as string[];
  const destinoText = [destHost, ...crumbSegs]
    .filter(Boolean)
    .map((seg, i, arr) => (i === 0 || i === arr.length - 1 ? seg : (seg.length > 10 ? seg.slice(0, 8) + '…' : seg)))
    .join(' › ');

  const [activeTab, setActiveTab] = useState<TabValue>('E2E');
  const [feedback, setFeedback] = useState<{ message: string; severity: 'success' | 'error' | 'info' }>({
    message: '',
    severity: 'success',
  });

  const recentsKey = 'tv_recents::' + (empNombre ?? '') + '::' + (sucursal?.entorno ?? '');
  const [recents, setRecents] = useState<SelectedModule[]>([]);
  useEffect(() => {
    try { setRecents(dedupRecents(JSON.parse(localStorage.getItem(recentsKey) || '[]'))); } catch { setRecents([]); }
  }, [recentsKey]);
  useEffect(() => {
    if (!selected?.pageName) return;
    setRecents((cur) => {
      const next = dedupRecents([selected, ...cur]).slice(0, 6);
      try { localStorage.setItem(recentsKey, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, [selected, recentsKey]);

  const favsKey = 'tv_favs::' + (empNombre ?? '') + '::' + (sucursal?.entorno ?? '');
  const [favs, setFavs] = useState<SelectedModule[]>([]);
  useEffect(() => {
    try { setFavs(JSON.parse(localStorage.getItem(favsKey) || '[]')); } catch { setFavs([]); }
  }, [favsKey]);
  const favKey = (s: SelectedModule) => [s.moduleName, (s.submodulePath ?? []).join('/'), s.pageName].join('::');
  const isFav = (s: SelectedModule | null) => !!s?.pageName && favs.some((f) => favKey(f) === favKey(s));
  const toggleFav = (s: SelectedModule) => {
    setFavs((cur) => {
      const exists = cur.some((f) => favKey(f) === favKey(s));
      const next = exists ? cur.filter((f) => favKey(f) !== favKey(s)) : [s, ...cur].slice(0, 12);
      try { localStorage.setItem(favsKey, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const metrics = useMemo(() => {
    const countPages = (subs: SubmoduleItem[]): number => subs.reduce((acc, s) => acc + (s.pages?.length ?? 0) + countPages(s.submodules ?? []), 0);
    const pageCount = modules.reduce((total, module) => total + (module.pages?.length ?? 0) + countPages(module.submodules ?? []), 0);
    const submoduleCount = modules.reduce((total, module) => total + (module.submodules?.length ?? 0), 0);
    return { moduleCount: modules.length, pageCount, submoduleCount };
  }, [modules]);

  const clickKeys = (fn: () => void) => (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  };

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

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 3 }}>
      <Stack spacing={2}>
        {/* ── Content header ── */}
        <Box>
          {selected && crumbSegs.length > 0 && (
            <Breadcrumbs separator="›" sx={{ mb: 0.5 }}>
              {crumbSegs.map((seg, idx) => (
                <Typography
                  key={`${seg}-${idx}`}
                  variant="body2"
                  color={idx === crumbSegs.length - 1 ? 'text.primary' : 'text.secondary'}
                  sx={{ fontWeight: idx === crumbSegs.length - 1 ? 700 : 400 }}
                >
                  {seg}
                </Typography>
              ))}
            </Breadcrumbs>
          )}

          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={800}>
              {selected?.pageName ?? selected?.submoduleName ?? selected?.moduleName ?? 'Centro de control'}
            </Typography>
            {selected?.pageName && (
              <Tooltip title={isFav(selected) ? 'Quitar de favoritos' : 'Agregar a favoritos'}>
                <IconButton size="small" aria-label="Favorito" onClick={() => toggleFav(selected)}>
                  {isFav(selected) ? <StarRoundedIcon fontSize="small" sx={{ color: T.warning.text }} /> : <StarBorderRoundedIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            )}
          </Stack>

          {selected && destUrl && (
            <Box
              sx={{
                mt: 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                maxWidth: '100%',
                px: 1.25,
                py: 0.5,
                borderRadius: `${T.radius.pill}px`,
                border: `1px solid ${T.border.card}`,
                bgcolor: T.surface.card,
              }}
            >
              <Typography variant="caption" sx={{ color: T.text.muted, fontWeight: 700, flexShrink: 0 }}>
                Destino
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', color: T.text.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {destinoText}
              </Typography>
              <Tooltip title="Copiar URL">
                <IconButton size="small" onClick={() => { navigator.clipboard?.writeText(destUrl); setFeedback({ message: 'URL copiada.', severity: 'success' }); }}>
                  <ContentCopyRoundedIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Abrir en el ERP">
                <IconButton size="small" onClick={() => window.open(destUrl, '_blank', 'noopener')}>
                  <OpenInNewRoundedIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          {!loading && !selected?.pageName && (
            <Typography variant="caption" color="text.secondary" display="block" mt={0.75}>
              {metrics.moduleCount} módulos · {metrics.pageCount} páginas · {metrics.submoduleCount} submódulos
            </Typography>
          )}
        </Box>

        {/* ── Loading skeleton ── */}
        {loading && renderLoadingSkeleton()}

        {/* ── Content body ── */}
        {!loading && (
          <>
            {/* Landing — sin selección: Recientes + módulos */}
            {!selected && (
              <Stack spacing={3} sx={{ pt: 1 }}>
                {favs.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>Favoritos</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 1.5 }}>
                      {favs.map((r, i) => (
                        <Box key={i} role="button" tabIndex={0} onClick={() => setSelected(r)} onKeyDown={clickKeys(() => setSelected(r))} sx={{ p: 2, borderRadius: T.radius.card + 'px', border: '1px solid ' + T.border.card, bgcolor: T.surface.card, cursor: 'pointer', ...cardHoverSx, '&:focus-visible': { outline: '2px solid', outlineColor: T.primary.main, outlineOffset: 2 } }}>
                          <Stack direction="row" alignItems="flex-start" spacing={1}>
                            <StarRoundedIcon sx={{ color: T.warning.text, fontSize: 18, mt: '2px' }} />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="caption" noWrap sx={{ color: T.text.muted, display: 'block', mb: 0.25 }}>
                                {[r.moduleName, ...(r.submodulePath ?? (r.submoduleName ? [r.submoduleName] : []))].join(' › ')}
                              </Typography>
                              <Typography variant="body2" noWrap sx={{ fontWeight: 700, color: 'text.primary' }}>{r.pageName}</Typography>
                            </Box>
                          </Stack>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}
                {recents.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>Recientes</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 1.5 }}>
                      {recents.map((r, i) => (
                        <Box key={i} role="button" tabIndex={0} onClick={() => setSelected(r)} onKeyDown={clickKeys(() => setSelected(r))}
                          sx={{ p: 2, borderRadius: T.radius.card + 'px', border: '1px solid ' + T.border.card, bgcolor: T.surface.card, cursor: 'pointer', ...cardHoverSx, '&:focus-visible': { outline: '2px solid', outlineColor: T.primary.main, outlineOffset: 2 } }}>
                          <Typography variant="caption" noWrap sx={{ color: T.text.muted, display: 'block', mb: 0.5 }}>
                            {[r.moduleName, ...(r.submodulePath ?? (r.submoduleName ? [r.submoduleName] : []))].join(' › ')}
                          </Typography>
                          <Typography variant="body2" noWrap sx={{ fontWeight: 700, color: 'text.primary' }}>{r.pageName}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>Módulos</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 1.5 }}>
                    {modules.map((m) => (
                      <Box key={m.name} role="button" tabIndex={0} onClick={() => setSelected({ moduleName: m.name })} onKeyDown={clickKeys(() => setSelected({ moduleName: m.name }))}
                        sx={{ p: 2, borderRadius: T.radius.card + 'px', border: '1px solid ' + T.border.card, bgcolor: T.surface.card, cursor: 'pointer', ...cardHoverSx, '&:focus-visible': { outline: '2px solid', outlineColor: T.primary.main, outlineOffset: 2 } }}>
                        <Stack direction="row" spacing={1.25} alignItems="center">
                          <Box sx={{ width: 38, height: 38, flexShrink: 0, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: T.primary.tint, color: T.primary.main }}>
                            <WidgetsRoundedIcon fontSize="small" />
                          </Box>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>{m.name}</Typography>
                            <Typography variant="caption" noWrap sx={{ color: T.text.muted, display: 'block' }}>
                              {(m.submodules?.length ?? 0)} submódulos
                            </Typography>
                          </Box>
                        </Stack>
                      </Box>
                    ))}
                  </Box>
                </Box>
                {recents.length === 0 && (
                  <Typography variant="caption" sx={{ color: T.text.muted }}>
                    Abre una página desde un módulo o el buscador y aparecerá aquí en Recientes.
                  </Typography>
                )}
              </Stack>
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
                      swaggerUrl={modules.find((m) => m.name === selected.moduleName)?.swaggerUrl}
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
