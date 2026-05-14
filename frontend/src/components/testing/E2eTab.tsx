import { useCallback, useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import api from '../../api/client';
import type { SelectedModule } from '../../store/useModuleStore';
import { useSessionStore } from '../../store/useSessionStore';
import type { E2eRecording } from '../../types/platform';
import { buildSelectionQuery, formatRunTime, resolveAutomationUrl } from '../../utils/platform';

const statusMeta: Record<E2eRecording['status'], { label: string; color: 'default' | 'error' | 'success' | 'warning' }> = {
  idle: { label: 'Sin grabar', color: 'default' },
  recording: { label: 'Grabando', color: 'error' },
  ready: { label: 'Lista', color: 'success' },
  error: { label: 'Error', color: 'warning' },
};

interface Props {
  selected: SelectedModule;
  onNotify: (message: string, severity?: 'success' | 'error' | 'info') => void;
}

export default function E2eTab({ selected, onNotify }: Props) {
  const urlRaiz = useSessionStore((s) => s.urlRaiz);
  const [recordings, setRecordings] = useState<E2eRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewSpec, setViewSpec] = useState<string | null>(null);
  const [viewOutput, setViewOutput] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const effectiveUrl = resolveAutomationUrl(selected.pageUrl, urlRaiz) || url.trim();

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/e2e?${buildSelectionQuery(selected)}`)
      .then(({ data }) => {
        setRecordings(data);
        setExpandedIds((current) => current.filter((id) => data.some((item: E2eRecording) => item.id === id)));
      })
      .catch(() => onNotify('No se pudieron cargar los flujos E2E.', 'error'))
      .finally(() => setLoading(false));
  }, [onNotify, selected.moduleName, selected.pageName, selected.submoduleName]);

  useEffect(() => {
    load();
    setDialogOpen(false);
  }, [load, selected.moduleName, selected.pageName, selected.submoduleName]);

  // Poll every 3s while any recording is in 'recording' state (user has Chromium open)
  useEffect(() => {
    const hasActive = recordings.some((r) => r.status === 'recording');
    if (!hasActive) return;
    const interval = setInterval(() => {
      api.get(`/e2e?${buildSelectionQuery(selected)}`)
        .then(({ data }) => {
          setRecordings(data);
          const stillActive = data.some((r: E2eRecording) => r.status === 'recording');
          if (!stillActive) onNotify('Grabacion finalizada. El spec fue guardado.', 'success');
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(interval);
  }, [recordings, selected, onNotify]);

  const openDialog = () => {
    setName(selected.pageName ?? 'Flujo principal');
    setUrl(selected.pageUrl ?? '');
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim() || !effectiveUrl) {
      return;
    }

    setSaving(true);
    try {
      await api.post(`/e2e?${buildSelectionQuery(selected)}`, { name: name.trim(), url: effectiveUrl });
      onNotify('Flujo E2E creado.', 'success');
      setDialogOpen(false);
      load();
    } catch {
      onNotify('No fue posible guardar el flujo E2E.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async (id: string) => {
    try {
      await api.post(`/e2e/${id}/start?${buildSelectionQuery(selected)}`, effectiveUrl ? { url: effectiveUrl } : {});
      onNotify('Grabacion iniciada.', 'info');
      load();
    } catch {
      onNotify('No fue posible iniciar la grabacion.', 'error');
    }
  };

  const handleStop = async (id: string) => {
    try {
      await api.post(`/e2e/${id}/stop?${buildSelectionQuery(selected)}`);
      onNotify('Grabacion detenida.', 'success');
      setExpandedIds((ids) => [...new Set([...ids, id])]);
      load();
    } catch {
      onNotify('No fue posible detener la grabacion.', 'error');
    }
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    setExpandedIds((ids) => [...new Set([...ids, id])]);
    try {
      const { data } = await api.post(`/e2e/${id}/run?${buildSelectionQuery(selected)}`, effectiveUrl ? { url: effectiveUrl } : {});
      if (data?.ok) {
        onNotify(`Test OK — ${data.passed ?? 0} paso(s) correctos.`, 'success');
      } else {
        onNotify(`Test fallido — ${data?.failed ?? 0} fallo(s). Ver salida para detalles.`, 'error');
      }
      load();
    } catch {
      onNotify('No fue posible ejecutar el flujo E2E.', 'error');
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) {
      return;
    }

    try {
      await api.delete(`/e2e/${deleteId}?${buildSelectionQuery(selected)}`);
      onNotify('Flujo E2E eliminado.', 'success');
      setDeleteId(null);
      load();
    } catch {
      onNotify('No fue posible eliminar el flujo E2E.', 'error');
    }
  };

  const handleViewSpec = async (id: string) => {
    try {
      const { data } = await api.get(`/e2e/${id}/spec?${buildSelectionQuery(selected)}`);
      setViewSpec(data.spec || '(vacio)');
    } catch {
      onNotify('No fue posible cargar el codigo generado.', 'error');
    }
  };

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
          >
            <Box>
              <Typography variant="h5">Automatizacion E2E</Typography>
              <Typography variant="body2" color="text.secondary">
                Graba flujos, genera codigo Playwright y ejecuta recorridos completos del usuario.
              </Typography>
              {effectiveUrl && (
                <Typography variant="caption" color="primary.main">
                  {effectiveUrl}
                </Typography>
              )}
            </Box>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openDialog}>
              Nuevo flujo
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Alert severity="info" variant="outlined">
        Inicia la grabacion para abrir el navegador, recorre el flujo manualmente y luego detiene la sesion para guardar el spec.
      </Alert>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Flujos registrados
          </Typography>
          <Stack spacing={1.5}>
            {!loading && recordings.length > 0 && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="outlined" onClick={() => setExpandedIds(recordings.map((recording) => recording.id))}>
                  Expandir todos
                </Button>
                <Button variant="text" onClick={() => setExpandedIds([])}>
                  Colapsar todos
                </Button>
              </Stack>
            )}
            {loading && <Alert severity="info" variant="outlined">Cargando flujos E2E...</Alert>}
            {!loading && recordings.length === 0 && (
              <Alert severity="info" variant="outlined">
                Aun no hay flujos E2E configurados. Crea un flujo para registrar acciones de usuario y automatizarlas.
              </Alert>
            )}
            {!loading && recordings.map((recording) => (
              <Accordion
                key={recording.id}
                expanded={expandedIds.includes(recording.id)}
                onChange={(_event, isExpanded) => setExpandedIds((current) => (
                  isExpanded
                    ? [...current, recording.id]
                    : current.filter((id) => id !== recording.id)
                ))}
              >
                <AccordionSummary component="div" expandIcon={<ExpandMoreRoundedIcon />}>
                  <Stack direction="row" spacing={1.5} alignItems="center" flex={1} minWidth={0}>
                    <Chip label={statusMeta[recording.status].label} color={statusMeta[recording.status].color} size="small" />
                    <Box flex={1} minWidth={0}>
                      <Typography fontWeight={700} noWrap>
                        {recording.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        Ultima ejecucion: {formatRunTime(recording.lastResult?.runAt)}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5}>
                      {recording.status !== 'recording' && (
                        <IconButton size="small" color="error" onClick={(event) => {
                          event.stopPropagation();
                          handleStart(recording.id);
                        }}>
                          <FiberManualRecordRoundedIcon fontSize="small" />
                        </IconButton>
                      )}
                      {recording.status === 'recording' && (
                        <IconButton size="small" color="warning" onClick={(event) => {
                          event.stopPropagation();
                          handleStop(recording.id);
                        }}>
                          <StopRoundedIcon fontSize="small" />
                        </IconButton>
                      )}
                      {recording.status === 'ready' && (
                        <>
                          <IconButton
                            size="small"
                            color="primary"
                            disabled={runningId === recording.id}
                            onClick={(event) => { event.stopPropagation(); handleRun(recording.id); }}
                          >
                            {runningId === recording.id
                              ? <CircularProgress size={16} color="primary" />
                              : <PlayArrowRoundedIcon fontSize="small" />}
                          </IconButton>
                          <IconButton size="small" color="secondary" onClick={(event) => {
                            event.stopPropagation();
                            handleViewSpec(recording.id);
                          }}>
                            <DescriptionRoundedIcon fontSize="small" />
                          </IconButton>
                        </>
                      )}
                      <IconButton size="small" color="error" onClick={(event) => {
                        event.stopPropagation();
                        setDeleteId(recording.id);
                      }}>
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <TextField fullWidth label="URL inicial" value={recording.url} InputProps={{ readOnly: true }} />
                    {recording.lastResult ? (
                      <Stack spacing={1}>
                        <Alert severity={recording.lastResult.ok ? 'success' : 'error'} variant="outlined">
                          {recording.lastResult.passed} paso(s) correctos · {recording.lastResult.failed} fallo(s) · {formatRunTime(recording.lastResult.runAt)}
                        </Alert>
                        {recording.lastResult.output && (
                          <TextField
                            fullWidth
                            multiline
                            maxRows={10}
                            value={recording.lastResult.output}
                            InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }}
                            label="Salida"
                            size="small"
                          />
                        )}
                      </Stack>
                    ) : (
                      <Alert severity="info" variant="outlined">
                        Este flujo aun no registra resultados de ejecucion.
                      </Alert>
                    )}
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                      {recording.status !== 'recording' && (
                        <Button color="error" variant="contained" onClick={() => handleStart(recording.id)}>
                          Grabar
                        </Button>
                      )}
                      {recording.status === 'recording' && (
                        <Button color="warning" variant="contained" onClick={() => handleStop(recording.id)}>
                          Detener
                        </Button>
                      )}
                      {recording.status === 'ready' && (
                        <>
                          <Button variant="outlined" onClick={() => handleRun(recording.id)} disabled={runningId === recording.id}>
                            {runningId === recording.id ? 'Ejecutando...' : 'Reproducir'}
                          </Button>
                          <Button variant="outlined" onClick={() => handleViewSpec(recording.id)}>
                            Ver codigo generado
                          </Button>
                        </>
                      )}
                    </Stack>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nuevo flujo E2E</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <TextField autoFocus label="Nombre del flujo" value={name} onChange={(event) => setName(event.target.value)} />
            <TextField
              label="URL inicial"
              value={effectiveUrl || url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={Boolean(selected.pageUrl)}
              helperText={selected.pageUrl ? 'Se usa automaticamente la URL efectiva de la pagina seleccionada en el ambiente actual.' : 'Define la URL inicial para Playwright.'}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !name.trim() || !effectiveUrl}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} fullWidth maxWidth="xs">
        <DialogTitle>Eliminar flujo</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Se eliminara el flujo seleccionado y el historial asociado.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={Boolean(runningId)}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(viewSpec)} onClose={() => setViewSpec(null)} fullWidth maxWidth="lg">
        <DialogTitle>Codigo generado</DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline minRows={18} maxRows={18} value={viewSpec ?? ''} InputProps={{ readOnly: true }} />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewOutput)} onClose={() => setViewOutput(null)} fullWidth maxWidth="lg">
        <DialogTitle>Salida de ejecucion</DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline minRows={18} maxRows={18} value={viewOutput ?? ''} InputProps={{ readOnly: true }} />
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
