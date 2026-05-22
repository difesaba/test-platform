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
  LinearProgress,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CollectionsRoundedIcon from '@mui/icons-material/CollectionsRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
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
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [enhancingId, setEnhancingId] = useState<string | null>(null);
  const [enhancedSpecData, setEnhancedSpecData] = useState<{ id: string; original: string; enhanced: string } | null>(null);
  const [acceptingEnhancement, setAcceptingEnhancement] = useState(false);
  const [historyRecId, setHistoryRecId] = useState<string | null>(null);
  const [screenshotsRecId, setScreenshotsRecId] = useState<string | null>(null);
  const [screenshotFiles, setScreenshotFiles] = useState<string[]>([]);
  const [screenshotsLoading, setScreenshotsLoading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
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

  // Poll every 5s while screenshot generation is in progress
  useEffect(() => {
    if (!generatingId) return;
    const interval = setInterval(() => {
      api.get(`/e2e/${generatingId}/screenshots?${buildSelectionQuery(selected)}`)
        .then(({ data }) => {
          if ((data.screenshots?.length ?? 0) > 0) {
            setGeneratingId(null);
            load();
            onNotify('Capturas generadas correctamente.', 'success');
          }
        })
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatingId, selected.moduleName, selected.pageName, selected.submoduleName]);

  useEffect(() => {
    if (!screenshotsRecId) { setScreenshotFiles([]); return; }
    setScreenshotsLoading(true);
    api.get(`/e2e/${screenshotsRecId}/screenshots?${buildSelectionQuery(selected)}`)
      .then(({ data }) => setScreenshotFiles(data.screenshots ?? []))
      .catch(() => onNotify('No se pudieron cargar las capturas.', 'error'))
      .finally(() => setScreenshotsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenshotsRecId, selected.moduleName, selected.pageName, selected.submoduleName]);

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
    setRecordings((prev) => prev.map((r) => r.id === id ? { ...r, lastResult: undefined } : r));
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

  const handleGenScreenshots = async (id: string) => {
    setGeneratingId(id);
    try {
      await api.post(`/e2e/${id}/gen-screenshots?${buildSelectionQuery(selected)}`);
    } catch {
      setGeneratingId(null);
      onNotify('No se pudo iniciar la generación de capturas.', 'error');
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

  const handleEnhanceWithAI = async (id: string) => {
    setEnhancingId(id);
    try {
      const { data } = await api.post(`/e2e/${id}/enhance-ai?${buildSelectionQuery(selected)}`);
      setEnhancedSpecData({ id, original: data.originalSpec, enhanced: data.enhancedSpec });
    } catch {
      onNotify('No fue posible mejorar el spec con IA. Verificá que el ANTHROPIC_API_KEY esté configurado.', 'error');
    } finally {
      setEnhancingId(null);
    }
  };

  const handleAcceptEnhancement = async () => {
    if (!enhancedSpecData) return;
    setAcceptingEnhancement(true);
    try {
      await api.post(`/e2e/${enhancedSpecData.id}/save-enhanced?${buildSelectionQuery(selected)}`, {
        enhancedSpec: enhancedSpecData.enhanced,
      });
      onNotify('Spec mejorado guardado. Ya podés ejecutarlo.', 'success');
      setEnhancedSpecData(null);
      load();
    } catch {
      onNotify('No fue posible guardar el spec mejorado.', 'error');
    } finally {
      setAcceptingEnhancement(false);
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
                      {(recording.status === 'idle' || recording.status === 'error') && (
                        <Tooltip title="Iniciar grabación">
                          <IconButton size="small" color="error" onClick={(event) => {
                            event.stopPropagation();
                            handleStart(recording.id);
                          }}>
                            <VideocamRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {recording.status === 'recording' && (
                        <Tooltip title="Detener grabación">
                          <IconButton size="small" color="warning" onClick={(event) => {
                            event.stopPropagation();
                            handleStop(recording.id);
                          }}>
                            <StopRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {recording.status === 'ready' && (
                        <>
                          <Tooltip title="Ejecutar test">
                            <span>
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
                            </span>
                          </Tooltip>
                          <Tooltip title="Ver código generado">
                            <IconButton size="small" color="secondary" onClick={(event) => {
                              event.stopPropagation();
                              handleViewSpec(recording.id);
                            }}>
                              <CodeRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={enhancingId === recording.id ? 'IA procesando...' : 'Mejorar con IA'}>
                            <span>
                              <IconButton
                                size="small"
                                color="success"
                                disabled={enhancingId === recording.id}
                                onClick={(event) => { event.stopPropagation(); handleEnhanceWithAI(recording.id); }}
                              >
                                {enhancingId === recording.id
                                  ? <CircularProgress size={16} color="success" />
                                  : <SmartToyRoundedIcon fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                          {(recording.lastResult?.screenshots?.length ?? 0) > 0 && (
                            <Tooltip title={`Ver capturas (${recording.lastResult!.screenshots!.length})`}>
                              <IconButton size="small" color="info" onClick={(event) => {
                                event.stopPropagation();
                                setScreenshotsRecId(recording.id);
                              }}>
                                <CollectionsRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </>
                      )}
                      <Tooltip title="Eliminar flujo">
                        <IconButton size="small" color="error" onClick={(event) => {
                          event.stopPropagation();
                          setDeleteId(recording.id);
                        }}>
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    {enhancingId === recording.id && (
                      <Box sx={{ '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } } }}>
                        <Alert
                          severity="info"
                          icon={<SmartToyRoundedIcon sx={{ animation: 'pulse 1.5s ease-in-out infinite' }} />}
                          sx={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, mb: 0 }}
                        >
                          IA analizando el spec... esto puede tomar hasta 20 segundos
                        </Alert>
                        <LinearProgress sx={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }} />
                      </Box>
                    )}
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
                      {(recording.status === 'idle' || recording.status === 'error') && (
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
                          <Button
                            variant="outlined"
                            startIcon={runningId === recording.id ? <CircularProgress size={14} color="primary" /> : <PlayArrowRoundedIcon />}
                            disabled={runningId === recording.id}
                            onClick={() => handleRun(recording.id)}
                          >
                            {runningId === recording.id ? 'Ejecutando...' : 'Reproducir'}
                          </Button>
                          <Button variant="outlined" startIcon={<CodeRoundedIcon />} onClick={() => handleViewSpec(recording.id)}>
                            Ver codigo generado
                          </Button>
                          <Button
                            variant="outlined"
                            color="success"
                            startIcon={enhancingId === recording.id ? <CircularProgress size={14} color="success" /> : <SmartToyRoundedIcon />}
                            disabled={enhancingId === recording.id}
                            onClick={() => handleEnhanceWithAI(recording.id)}
                          >
                            {enhancingId === recording.id ? 'IA analizando...' : 'Mejorar con IA'}
                          </Button>
                          {(recording.lastResult?.screenshots?.length ?? 0) > 0 && (
                            <Button variant="outlined" color="info" startIcon={<CollectionsRoundedIcon />} onClick={() => setScreenshotsRecId(recording.id)}>
                              Capturas ({recording.lastResult!.screenshots!.length})
                            </Button>
                          )}
                          {recording.lastResult?.hasPdf && (
                            <Button
                              variant="contained"
                              color="success"
                              startIcon={<PictureAsPdfRoundedIcon />}
                              onClick={() => {
                                const url = `/api/e2e/${recording.id}/doc.pdf?${buildSelectionQuery(selected)}`;
                                const a = document.createElement('a');
                                a.href = url; a.download = 'documentacion.pdf'; a.click();
                              }}
                            >
                              Descargar PDF
                            </Button>
                          )}
                          {(recording.history?.length ?? 0) > 0 && (
                            <Button variant="outlined" startIcon={<HistoryRoundedIcon />} onClick={() => setHistoryRecId(recording.id)}>
                              Historial ({recording.history!.length})
                            </Button>
                          )}
                          {recording.lastResult && (recording.lastResult.screenshots?.length ?? 0) === 0 && (
                            <Button
                              variant="outlined"
                              color="secondary"
                              startIcon={generatingId === recording.id ? <CircularProgress size={14} color="secondary" /> : <CollectionsRoundedIcon />}
                              disabled={generatingId === recording.id}
                              onClick={() => handleGenScreenshots(recording.id)}
                            >
                              {generatingId === recording.id ? 'Generando...' : 'Generar capturas'}
                            </Button>
                          )}
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

      <Dialog open={Boolean(screenshotsRecId)} onClose={() => { setScreenshotsRecId(null); setLightboxSrc(null); }} fullWidth maxWidth="lg">
        <DialogTitle>
          Capturas — {recordings.find((r) => r.id === screenshotsRecId)?.name}
        </DialogTitle>
        <DialogContent>
          {screenshotsLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}
          {!screenshotsLoading && screenshotFiles.length === 0 && (
            <Alert severity="info" variant="outlined">No se encontraron capturas para esta ejecucion.</Alert>
          )}
          {!screenshotsLoading && screenshotFiles.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1.5, mt: 1 }}>
              {screenshotFiles.map((file) => {
                const src = `/api/e2e/${screenshotsRecId}/screenshots/${file}?${buildSelectionQuery(selected)}`;
                return (
                  <Box key={file} sx={{ position: 'relative', cursor: 'pointer' }} onClick={() => setLightboxSrc(src)}>
                    <Box
                      component="img"
                      src={src}
                      alt={file}
                      sx={{ width: '100%', display: 'block', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                    />
                    <Typography
                      variant="caption"
                      sx={{ position: 'absolute', bottom: 4, left: 4, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', px: 0.5, borderRadius: 0.5, fontSize: 10 }}
                    >
                      {file.replace('.png', '').replace('step_', 'Paso ')}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setScreenshotsRecId(null); setLightboxSrc(null); }}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(historyRecId)} onClose={() => setHistoryRecId(null)} fullWidth maxWidth="md">
        <DialogTitle>
          Historial — {recordings.find((r) => r.id === historyRecId)?.name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {recordings.find((r) => r.id === historyRecId)?.history?.map((entry, idx) => (
              <Box key={idx} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                <Alert
                  severity={entry.ok ? 'success' : 'error'}
                  variant="outlined"
                  sx={{ borderRadius: 0, border: 'none', borderBottom: '1px solid', borderColor: 'divider' }}
                >
                  {entry.passed} paso(s) correctos · {entry.failed} fallo(s) · {formatRunTime(entry.runAt)}
                  {(entry.empresaNombre || entry.sucursalNombre) && (
                    <Typography variant="caption" display="block" sx={{ mt: 0.5, opacity: 0.85 }}>
                      {[entry.empresaNombre, entry.sucursalNombre].filter(Boolean).join(' — ')}
                    </Typography>
                  )}
                </Alert>
                <TextField
                  fullWidth
                  multiline
                  maxRows={6}
                  value={entry.output}
                  InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 11 } }}
                  size="small"
                />
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryRecId(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(lightboxSrc)} onClose={() => setLightboxSrc(null)} fullWidth maxWidth="xl">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Vista ampliada
          <Button component="a" href={lightboxSrc ?? ''} download>Descargar</Button>
        </DialogTitle>
        <DialogContent>
          <Box component="img" src={lightboxSrc ?? ''} alt="captura ampliada" sx={{ width: '100%', display: 'block' }} />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(enhancedSpecData)} onClose={() => !acceptingEnhancement && setEnhancedSpecData(null)} fullWidth maxWidth="xl">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoFixHighRoundedIcon color="success" />
          Spec mejorado por IA — revisá los cambios antes de guardar
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
                ORIGINAL
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={20}
                maxRows={28}
                value={enhancedSpecData?.original ?? ''}
                InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 11 } }}
              />
            </Box>
            <Box>
              <Typography variant="caption" color="success.main" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
                MEJORADO CON IA
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={20}
                maxRows={28}
                value={enhancedSpecData?.enhanced ?? ''}
                onChange={(e) => setEnhancedSpecData((prev) => prev ? { ...prev, enhanced: e.target.value } : null)}
                InputProps={{ sx: { fontFamily: 'monospace', fontSize: 11 } }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnhancedSpecData(null)} disabled={acceptingEnhancement}>
            Descartar
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={acceptingEnhancement ? <CircularProgress size={14} color="inherit" /> : <AutoFixHighRoundedIcon />}
            disabled={acceptingEnhancement}
            onClick={handleAcceptEnhancement}
          >
            {acceptingEnhancement ? 'Guardando...' : 'Aceptar y guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
