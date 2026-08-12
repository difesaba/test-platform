import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Paper, Snackbar, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import { T } from '@/shared/theme/launcherTokens';
import { rowHoverSx } from '@/shared/theme/motion';
import PageHeader from '@/shared/layout/PageHeader';
import { RowsSkeleton } from '@/shared/components/Skeletons';
import { formatRunTime } from '@/shared/utils/platform';
import {
  getSuites, createSuite, deleteSuite, removeFlowFromSuite, runSuite, getSuiteRuns,
} from '@/features/suites/services/suite';
import type { E2eSuite, E2eSuiteRun, SuiteType } from '@/features/suites/models/suite.model';

type Notify = { msg: string; sev: 'success' | 'error' | 'info' } | null;

export default function SuitesPage() {
  const [tipo, setTipo] = useState<SuiteType>('e2e');
  const [suites, setSuites] = useState<E2eSuite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<E2eSuiteRun[]>([]);
  const [running, setRunning] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStop, setNewStop] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [notify, setNotify] = useState<Notify>(null);
  const [submitting, setSubmitting] = useState(false);

  const clickKeys = (fn: () => void) => (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  };

  const selected = useMemo(() => suites.find((s) => s.id === selectedId) ?? null, [suites, selectedId]);

  const loadSuites = useCallback(async (keep?: string) => {
    setLoading(true);
    const res = await getSuites(tipo);
    if (res.success && res.data) {
      setSuites(res.data);
      setSelectedId((prev) => keep ?? (res.data!.some((s) => s.id === prev) ? prev : null) ?? res.data![0]?.id ?? null);
    } else {
      setNotify({ msg: res.error ?? 'No se pudieron cargar las suites', sev: 'error' });
    }
    setLoading(false);
  }, [tipo]);

  useEffect(() => { loadSuites(); }, [loadSuites]);

  // Historial de la suite seleccionada.
  useEffect(() => {
    if (!selectedId) { setRuns([]); return; }
    let cancel = false;
    getSuiteRuns(selectedId, 20).then((res) => { if (!cancel) setRuns(res.success && res.data ? res.data : []); });
    return () => { cancel = true; };
  }, [selectedId]);

  const doCreate = async () => {
    setSubmitting(true);
    try {
      const res = await createSuite({ name: newName, description: newDesc || undefined, tipo, stopOnFailure: newStop });
      if (res.success && res.data) {
        setNewOpen(false); setNewName(''); setNewDesc(''); setNewStop(false);
        setNotify({ msg: 'Suite creada', sev: 'success' });
        await loadSuites(res.data.id);
      } else setNotify({ msg: res.error ?? 'No se pudo crear la suite', sev: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const doDelete = async () => {
    if (!deleteId) return;
    setSubmitting(true);
    try {
      const res = await deleteSuite(deleteId);
      setDeleteId(null);
      if (res.success) { setNotify({ msg: 'Suite eliminada', sev: 'success' }); setSelectedId(null); await loadSuites(); }
      else setNotify({ msg: res.error ?? 'No se pudo eliminar', sev: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const doRemoveFlow = async (flowId: string) => {
    if (!selected) return;
    const res = await removeFlowFromSuite(selected.id, flowId);
    if (res.success) await loadSuites(selected.id);
    else setNotify({ msg: res.error ?? 'No se pudo quitar el flujo', sev: 'error' });
  };

  const doRun = async () => {
    if (!selected) return;
    setRunning(true);
    const res = await runSuite(selected.id);
    setRunning(false);
    if (res.success && res.data) {
      setNotify({ msg: `Suite ejecutada · ${res.data.passed}/${res.data.total} pasaron`, sev: res.data.ok ? 'success' : 'error' });
      const rr = await getSuiteRuns(selected.id, 20);
      if (rr.success && rr.data) setRuns(rr.data);
    } else setNotify({ msg: res.error ?? 'No se pudo ejecutar la suite', sev: 'error' });
  };

  const lastRun = runs[0];

  return (
    <Box sx={{ bgcolor: T.surface.page }}>
      <Box sx={{ p: 3 }}>
        <PageHeader
          title="Suites"
          subtitle="Agrupá pruebas del mismo tipo y ejecutalas en orden con resultado consolidado."
          icon={<LayersRoundedIcon />}
          actions={<Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setNewOpen(true)}>Nueva suite</Button>}
        />
        {/* Selector de tipo: cada suite agrupa pruebas de un solo tipo. */}
        <Tabs value={tipo} onChange={(_e, v) => { setSelectedId(null); setTipo(v); }} sx={{ mb: 2, minHeight: 36 }}>
          <Tab value="e2e" label="E2E" sx={{ minHeight: 36, textTransform: 'none' }} />
          <Tab value="ui" label="UI" sx={{ minHeight: 36, textTransform: 'none' }} />
          <Tab value="api" label="API" sx={{ minHeight: 36, textTransform: 'none' }} />
        </Tabs>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
        {/* Lista */}
        <Paper variant="outlined" sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0, borderColor: T.border.card, overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${T.border.divider}` }}>
            <Typography variant="caption" sx={{ color: T.text.muted, letterSpacing: 1, fontWeight: 700 }}>SUITES · {suites.length}</Typography>
          </Box>
          {loading
            ? <Box sx={{ p: 2 }}><RowsSkeleton rows={4} height={56} /></Box>
            : suites.length === 0
            ? <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Sin suites todavía. Creá la primera con "Nueva suite".</Typography>
            : <Stack>
                {suites.map((s) => (
                  <Box key={s.id} role="button" tabIndex={0}
                    onClick={() => setSelectedId(s.id)}
                    onKeyDown={clickKeys(() => setSelectedId(s.id))}
                    sx={{ px: 2, py: 1.25, cursor: 'pointer', borderBottom: `1px solid ${T.border.divider}`,
                      bgcolor: s.id === selectedId ? T.surface.selected : 'transparent', ...rowHoverSx,
                      '&:focus-visible': { outline: '2px solid', outlineColor: T.primary.main, outlineOffset: '-2px' } }}>
                    <Typography variant="body2" fontWeight={700} noWrap sx={{ color: T.text.primary }}>{s.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{s.flows.length} prueba(s)</Typography>
                  </Box>
                ))}
              </Stack>}
        </Paper>

        {/* Detalle */}
        <Box flex={1} minWidth={0} sx={{ width: '100%' }}>
          {!selected
            ? <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderColor: T.border.card }}>
                <Typography variant="body2" color="text.secondary">Seleccioná una suite para ver sus pruebas y su historial.</Typography>
              </Paper>
            : <Stack spacing={2}>
                {/* Encabezado detalle */}
                <Paper variant="outlined" sx={{ p: 2, borderColor: T.border.card }}>
                  <Stack direction="row" alignItems="flex-start" spacing={1}>
                    <Box flex={1} minWidth={0}>
                      <Typography variant="h6" fontWeight={800} sx={{ color: T.text.primary }}>{selected.name}</Typography>
                      {selected.description && <Typography variant="body2" color="text.secondary">{selected.description}</Typography>}
                    </Box>
                    <Button variant="contained" startIcon={running ? <CircularProgress size={16} color="inherit" /> : <PlayArrowRoundedIcon />}
                      disabled={running || selected.flows.length === 0} onClick={doRun}>
                      {running ? 'Ejecutando…' : 'Ejecutar suite'}
                    </Button>
                    <Tooltip title="Eliminar suite">
                      <IconButton color="error" onClick={() => setDeleteId(selected.id)}><DeleteOutlineRoundedIcon /></IconButton>
                    </Tooltip>
                  </Stack>

                  {lastRun && (
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${T.border.divider}` }}>
                      <Chip size="small" label={lastRun.ok ? 'Última: Pasó' : 'Última: Falló'}
                        sx={{ bgcolor: lastRun.ok ? T.success.bg : T.error.bg, color: lastRun.ok ? T.success.text : T.error.text, fontWeight: 700 }} />
                      <Typography variant="body2" color="text.secondary">{lastRun.passed}/{lastRun.total} pasaron · {formatRunTime(lastRun.runAt)}</Typography>
                    </Stack>
                  )}
                </Paper>

                {/* Flujos */}
                <Paper variant="outlined" sx={{ borderColor: T.border.card, overflow: 'hidden' }}>
                  <Box sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${T.border.divider}` }}>
                    <Typography variant="caption" sx={{ color: T.text.muted, letterSpacing: 1, fontWeight: 700 }}>FLUJOS · {selected.flows.length}</Typography>
                  </Box>
                  {selected.flows.length === 0
                    ? <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                        Esta suite no tiene pruebas. Agregalas desde el tab correspondiente (E2E/UI/API) con la acción "Agregar a suite".
                      </Typography>
                    : <Stack>
                        {[...selected.flows].sort((a, b) => a.order - b.order).map((f) => {
                          const lr = lastRun?.results.find((r) => r.flowId === f.flowId);
                          return (
                            <Stack key={f.flowId} direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.1, borderBottom: `1px solid ${T.border.divider}` }}>
                              {lr ? (lr.ok ? <CheckCircleRoundedIcon sx={{ fontSize: 18, color: T.success.text }} /> : <CancelRoundedIcon sx={{ fontSize: 18, color: T.error.text }} />)
                                  : <Box sx={{ width: 18 }} />}
                              <Box flex={1} minWidth={0}>
                                <Typography variant="body2" fontWeight={700} noWrap sx={{ color: T.text.primary }}>{f.name}</Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>{[f.module, f.page].filter(Boolean).join(' › ')}</Typography>
                              </Box>
                              {lr?.error && <Typography variant="caption" sx={{ color: T.error.text, maxWidth: 220 }} noWrap title={lr.error}>{lr.error}</Typography>}
                              <Tooltip title="Quitar de la suite">
                                <IconButton size="small" onClick={() => doRemoveFlow(f.flowId)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                              </Tooltip>
                            </Stack>
                          );
                        })}
                      </Stack>}
                </Paper>

                {/* Historial */}
                <Paper variant="outlined" sx={{ borderColor: T.border.card, overflow: 'hidden' }}>
                  <Box sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${T.border.divider}` }}>
                    <Typography variant="caption" sx={{ color: T.text.muted, letterSpacing: 1, fontWeight: 700 }}>HISTORIAL · {runs.length}</Typography>
                  </Box>
                  {runs.length === 0
                    ? <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Sin corridas todavía.</Typography>
                    : <Stack>
                        {runs.map((r) => (
                          <Stack key={r.id} direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1, borderBottom: `1px solid ${T.border.divider}` }}>
                            <Chip size="small" label={r.ok ? 'Pasó' : 'Falló'} sx={{ bgcolor: r.ok ? T.success.bg : T.error.bg, color: r.ok ? T.success.text : T.error.text, fontWeight: 700 }} />
                            <Typography variant="body2" sx={{ flex: 1 }} color="text.secondary">{r.passed}/{r.total} pasaron</Typography>
                            {r.entorno && <Chip size="small" variant="outlined" label={r.entorno} sx={{ height: 20 }} />}
                            <Typography variant="caption" color="text.secondary">{formatRunTime(r.runAt)}</Typography>
                          </Stack>
                        ))}
                      </Stack>}
                </Paper>
              </Stack>}
        </Box>
        </Stack>
      </Box>

      {/* Nueva suite */}
      <Dialog open={newOpen} onClose={() => setNewOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nueva suite {tipo.toUpperCase()}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth size="small" label="Nombre" value={newName} onChange={(e) => setNewName(e.target.value)} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth size="small" label="Descripción (opcional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} multiline minRows={2} />
          <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={newStop} onChange={(e) => setNewStop(e.target.checked)} />}
            label={<Typography variant="body2">Detener al primer fallo <Box component="span" sx={{ color: T.text.muted }}>(para pasos que dependen de los anteriores)</Box></Typography>} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={!newName.trim() || submitting} onClick={doCreate}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}>Crear</Button>
        </DialogActions>
      </Dialog>

      {/* Eliminar */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Eliminar suite</DialogTitle>
        <DialogContent><Typography color="text.secondary">Se eliminará la suite y su historial de corridas. Las pruebas no se borran.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancelar</Button>
          <Button color="error" variant="contained" disabled={submitting} onClick={doDelete}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}>Eliminar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!notify} autoHideDuration={4000} onClose={() => setNotify(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {notify ? <Alert severity={notify.sev} onClose={() => setNotify(null)} variant="filled">{notify.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
