import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Grid,
  IconButton,
  Stack,
  TextField,
  Typography,
  Alert,
  Chip,
  CircularProgress,
} from '@mui/material';
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import ImageSearchRoundedIcon from '@mui/icons-material/ImageSearchRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import CompareRoundedIcon from '@mui/icons-material/CompareRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AddToSuiteDialog from '@/features/suites/components/AddToSuiteDialog';
import {
  getUiTests,
  startComponentPicker,
  getComponentPickerStatus,
  closeComponentPicker,
  saveUiTest,
  runUiTest,
  deleteUiTest,
  approveBaseline,
} from '@/features/uiTests/services/uiTests';
import type { SelectedModule } from '@/shared/store/useModuleStore';
import { useSessionStore } from '@/shared/store/useSessionStore';
import type { UiTest, UiTestComponent, UiTestComponentCandidate, UiTestRuleType } from '@/shared/types/platform';
import { formatRunTime, resolveAutomationUrl } from '@/shared/utils/platform';
import EmptyState from '@/shared/components/EmptyState';
import TabPanelHeader from '@/shared/components/TabPanelHeader';
import { RowsSkeleton } from '@/shared/components/Skeletons';

const availableRules: Array<{ value: UiTestRuleType; label: string; helper: string }> = [
  { value: 'numbers-only', label: 'Solo numeros', helper: 'Valida que el campo no mantenga letras.' },
  { value: 'non-negative', label: 'Sin negativos', helper: 'Valida que el campo no mantenga valores negativos.' },
  { value: 'required', label: 'Obligatorio', helper: 'Valida que el componente marque requerido en el DOM.' },
];

interface Props {
  selected: SelectedModule;
  onNotify: (message: string, severity?: 'success' | 'error' | 'info') => void;
}

export default function UiTestTab({ selected, onNotify }: Props) {
  const urlRaiz = useSessionStore((s) => s.urlRaiz);
  const [tests, setTests] = useState<UiTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [addToSuiteTest, setAddToSuiteTest] = useState<UiTest | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [detectedComponents, setDetectedComponents] = useState<UiTestComponentCandidate[]>([]);
  const [configuredComponents, setConfiguredComponents] = useState<UiTestComponent[]>([]);
  const [selectedComponentSelector, setSelectedComponentSelector] = useState('');
  const [selectedRules, setSelectedRules] = useState<UiTestRuleType[]>([]);
  const [inspecting, setInspecting] = useState(false);
  const [pickerSessionId, setPickerSessionId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const detectedCardRef = useRef<HTMLDivElement>(null);
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;
  const effectiveUrl = resolveAutomationUrl(selected.pageUrl, urlRaiz) || url.trim();

  useEffect(() => {
    if (detectedComponents.length === 0) return;
    const id = setTimeout(() => {
      detectedCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    return () => clearTimeout(id);
  }, [detectedComponents, dialogOpen]);

  const load = useCallback(() => {
    setLoading(true);
    getUiTests(selected)
      .then((res) => {
        if (res.success && res.data) {
          const data = res.data;
          setTests(data);
          setExpandedIds((current) => current.filter((id) => data.some((test: UiTest) => test.id === id)));
        } else {
          onNotifyRef.current(`No se pudieron cargar las capturas UI. (${res.error ?? 'sin respuesta'})`, 'error');
        }
      })
      .finally(() => setLoading(false));
  // onNotify accedido via ref — no incluir como dep para evitar que load se recree al mostrar notificaciones
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.moduleName, selected.pageName, selected.submoduleName]);

  useEffect(() => {
    load();
    setDialogOpen(false);
  }, [load, selected.moduleName, selected.pageName, selected.submoduleName]);

  useEffect(() => {
    if (!pickerSessionId) return undefined;

    const intervalId = window.setInterval(async () => {
      const res = await getComponentPickerStatus(pickerSessionId);
      if (res.success && res.data) {
        const data = res.data;
        if (data.status === 'selected' && data.component) {
          setDetectedComponents([data.component]);
          setSelectedComponentSelector(data.component.selector);
          setPickerSessionId(null);
          setInspecting(false);
          setDialogOpen(true);
          onNotifyRef.current('Componente seleccionado. Asigna reglas y guarda.', 'success');
        }
        if (data.status === 'closed') {
          setPickerSessionId(null);
          setInspecting(false);
        }
      } else {
        setPickerSessionId(null);
        setInspecting(false);
        onNotifyRef.current('No fue posible leer la seleccion del componente.', 'error');
      }
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [pickerSessionId]);

  const openDialog = () => {
    setName(selected.pageName ?? 'Captura principal');
    setUrl(selected.pageUrl ?? '');
    setDetectedComponents([]);
    setConfiguredComponents([]);
    setSelectedComponentSelector('');
    setSelectedRules([]);
    setDialogOpen(true);
  };

  const handleCloseDialog = async () => {
    if (pickerSessionId) {
      await closeComponentPicker(pickerSessionId);
    }
    setPickerSessionId(null);
    setInspecting(false);
    setDialogOpen(false);
  };

  const handleInspectComponents = async () => {
    if (!effectiveUrl) {
      onNotify('Define la URL antes de abrir el selector.', 'info');
      return;
    }

    setInspecting(true);
    setDetectedComponents([]);
    const res = await startComponentPicker(effectiveUrl);
    if (res.success && res.data) {
      setPickerSessionId(res.data.sessionId ?? null);
      onNotify('Chromium abierto. Hace clic sobre el campo que quieres validar y vuelve aqui.', 'info');
    } else {
      onNotify('No fue posible abrir Chromium para seleccionar el componente.', 'error');
      setInspecting(false);
    }
  };

  const handleToggleRule = (rule: UiTestRuleType, checked: boolean) => {
    setSelectedRules((current) => (
      checked ? [...current, rule] : current.filter((value) => value !== rule)
    ));
  };

  const handleAddConfiguredComponent = () => {
    const detectedComponent = detectedComponents.find((item) => item.selector === selectedComponentSelector);
    if (!detectedComponent || selectedRules.length === 0) {
      return;
    }

    const nextComponent: UiTestComponent = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: detectedComponent.label,
      selector: detectedComponent.selector,
      tagName: detectedComponent.tagName,
      inputType: detectedComponent.inputType,
      rules: selectedRules,
    };

    setConfiguredComponents((current) => {
      const filtered = current.filter((item) => item.selector !== nextComponent.selector);
      return [...filtered, nextComponent];
    });
    setSelectedRules([]);
  };

  const handleRemoveConfiguredComponent = (id: string) => {
    setConfiguredComponents((current) => current.filter((item) => item.id !== id));
  };

  const handleCreate = async () => {
    if (!name.trim() || !effectiveUrl) {
      return;
    }

    setSaving(true);
    try {
      const res = await saveUiTest(selected, {
        name: name.trim(),
        url: effectiveUrl,
        components: configuredComponents,
      });
      if (res.success) {
        onNotify('Captura UI guardada.', 'success');
        setDialogOpen(false);
        setPickerSessionId(null);
        setInspecting(false);
        setName('');
        setUrl('');
        setDetectedComponents([]);
        setConfiguredComponents([]);
        setSelectedComponentSelector('');
        setSelectedRules([]);
        load();
      } else {
        onNotify('No fue posible guardar la captura UI.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      const res = await runUiTest(id, selected, { url: effectiveUrl || undefined });
      if (res.success) {
        onNotify('Captura ejecutada correctamente.', 'success');
        load();
        setExpandedIds((current) => current.includes(id) ? current : [...current, id]);
      } else {
        onNotify('No fue posible ejecutar la captura UI.', 'error');
      }
    } finally {
      setRunningId(null);
    }
  };

  const handleApproveBaseline = async (id: string) => {
    setApprovingId(id);
    try {
      const res = await approveBaseline(id, selected);
      if (res.success) {
        onNotify('Baseline actualizada con la captura actual.', 'success');
        load();
      } else {
        onNotify('No fue posible aprobar la baseline.', 'error');
      }
    } finally {
      setApprovingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) {
      return;
    }

    const res = await deleteUiTest(deleteId, selected);
    if (res.success) {
      onNotify('Captura UI eliminada.', 'success');
      setDeleteId(null);
      load();
    } else {
      onNotify('No fue posible eliminar la captura UI.', 'error');
    }
  };

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <TabPanelHeader
            title="Validacion visual"
            description="Guarda capturas, vuelve a ejecutarlas y revisa resultados visuales en contexto."
            primaryAction={
              <Button variant="contained" startIcon={<AddPhotoAlternateRoundedIcon />} onClick={openDialog}>
                Nueva captura
              </Button>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Capturas registradas
          </Typography>
          <Stack spacing={1.5}>
            {!loading && tests.length > 0 && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="outlined" onClick={() => setExpandedIds(tests.map((test) => test.id))}>
                  Expandir todos
                </Button>
                <Button variant="text" onClick={() => setExpandedIds([])}>
                  Colapsar todos
                </Button>
              </Stack>
            )}
            {loading && <RowsSkeleton rows={5} />}
            {!loading && tests.length === 0 && (
              <EmptyState
                icon={<AddPhotoAlternateRoundedIcon sx={{ fontSize: 40 }} />}
                title="Sin capturas todavía"
                description="Crea una captura para automatizar validaciones visuales de esta página."
                cta={<Button variant="contained" startIcon={<AddPhotoAlternateRoundedIcon />} onClick={openDialog}>Nueva captura</Button>}
              />
            )}
            {!loading && tests.map((test) => (
              <Accordion
                key={test.id}
                expanded={expandedIds.includes(test.id)}
                onChange={(_event, isExpanded) => setExpandedIds((current) => (
                  isExpanded
                    ? [...current, test.id]
                    : current.filter((id) => id !== test.id)
                ))}
              >
                <AccordionSummary component="div" expandIcon={<ExpandMoreRoundedIcon />}>
                  <Stack direction="row" spacing={1.5} alignItems="center" flex={1} minWidth={0}>
                    <ImageSearchRoundedIcon color="primary" />
                    <Box flex={1} minWidth={0}>
                      <Typography fontWeight={700} noWrap>
                        {test.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {test.lastResult?.ok ? 'Correcto' : test.lastResult ? 'Con error' : 'Sin ejecutar'}
                      </Typography>
                    </Box>
                    {Array.isArray(test.components) && test.components.length > 0 && (
                      <Typography variant="body2" color="text.secondary">
                        {test.components.length} componente(s)
                      </Typography>
                    )}
                    <Stack direction="row" spacing={0.5}>
                      <IconButton size="small" color="primary" disabled={Boolean(runningId)} onClick={(event) => {
                        event.stopPropagation();
                        handleRun(test.id);
                      }}>
                        {runningId === test.id
                          ? <CircularProgress size={16} color="inherit" />
                          : <PlayArrowRoundedIcon fontSize="small" />}
                      </IconButton>
                      <IconButton size="small" title="Agregar a suite" onClick={(event) => {
                        event.stopPropagation();
                        setAddToSuiteTest(test);
                      }}>
                        <LayersRoundedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={(event) => {
                        event.stopPropagation();
                        setDeleteId(test.id);
                      }}>
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={2}>
                    <TextField fullWidth label="URL" value={test.url} InputProps={{ readOnly: true }} />
                    {Array.isArray(test.components) && test.components.length > 0 && (
                      <Stack spacing={1.5}>
                        <Typography variant="subtitle1">Reglas configuradas</Typography>
                        {test.components.map((component) => (
                          <Card key={component.id} variant="outlined">
                            <CardContent>
                              <Stack spacing={1}>
                                <Typography fontWeight={700}>{component.name}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {component.selector}
                                </Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  {component.rules.map((rule) => (
                                    <Chip
                                      key={`${component.id}-${rule}`}
                                      size="small"
                                      variant="outlined"
                                      label={availableRules.find((item) => item.value === rule)?.label ?? rule}
                                    />
                                  ))}
                                </Stack>
                              </Stack>
                            </CardContent>
                          </Card>
                        ))}
                      </Stack>
                    )}
                    {!test.lastResult && (
                      <Alert severity="info" variant="outlined">
                        Esta captura aun no se ha ejecutado.
                      </Alert>
                    )}
                    {test.lastResult && (
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 4 }}>
                          <Card>
                            <CardContent>
                              <Typography variant="body2" color="text.secondary">Estado</Typography>
                              <Typography variant="h6" color={test.lastResult.ok ? 'success.main' : 'error.main'}>
                                {test.lastResult.ok ? 'Correcto' : 'Con error'}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {test.lastResult.loadTime} ms · {formatRunTime(test.lastResult.runAt)}
                              </Typography>
                              {test.lastResult.error && (
                                <Typography variant="body2" color="error.main">
                                  {test.lastResult.error}
                                </Typography>
                              )}
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid size={{ xs: 12, md: 8 }}>
                          {test.lastResult.screenshot && (
                            <Box height={360} overflow="auto" border={1} borderColor="divider" borderRadius={1}>
                              <Box
                                component="img"
                                src={`data:image/png;base64,${test.lastResult.screenshot}`}
                                alt={`Captura de ${test.name}`}
                                width="100%"
                                display="block"
                                onClick={() => setPreviewImage(test.lastResult?.screenshot ?? null)}
                              />
                            </Box>
                          )}
                          {test.lastResult.visual && test.lastResult.visual !== 'na' && (
                            <Stack spacing={1.5} mt={2}>
                              <Typography variant="subtitle2">Regresion visual</Typography>
                              {test.lastResult.visual === 'baseline' && (
                                <Chip
                                  icon={<CompareRoundedIcon />}
                                  label="Baseline capturada"
                                  color="default"
                                  variant="outlined"
                                  size="small"
                                  sx={{ alignSelf: 'flex-start' }}
                                />
                              )}
                              {test.lastResult.visual === 'ok' && (
                                <Chip
                                  icon={<CheckCircleRoundedIcon />}
                                  label="Sin cambios visuales"
                                  color="success"
                                  size="small"
                                  sx={{ alignSelf: 'flex-start' }}
                                />
                              )}
                              {test.lastResult.visual === 'diff' && (
                                <>
                                  <Chip
                                    icon={<CompareRoundedIcon />}
                                    label={`⚠ Cambió ${test.lastResult.mismatchPct ?? 0}%`}
                                    color="warning"
                                    size="small"
                                    sx={{ alignSelf: 'flex-start' }}
                                  />
                                  {test.lastResult.diff && (
                                    <>
                                      <Box height={360} overflow="auto" border={1} borderColor="divider" borderRadius={1}>
                                        <Box
                                          component="img"
                                          src={`data:image/png;base64,${test.lastResult.diff}`}
                                          alt={`Diferencias de ${test.name}`}
                                          width="100%"
                                          display="block"
                                          sx={{ cursor: 'zoom-in' }}
                                          onClick={() => setPreviewImage(test.lastResult?.diff ?? null)}
                                        />
                                      </Box>
                                      <Typography variant="caption" color="text.secondary">
                                        Diferencias resaltadas vs baseline
                                      </Typography>
                                      <Button
                                        variant="outlined"
                                        color="warning"
                                        size="small"
                                        startIcon={<CheckCircleRoundedIcon />}
                                        disabled={approvingId === test.id}
                                        onClick={() => handleApproveBaseline(test.id)}
                                        sx={{ alignSelf: 'flex-start' }}
                                      >
                                        {approvingId === test.id ? 'Aprobando…' : 'Aprobar como baseline'}
                                      </Button>
                                    </>
                                  )}
                                </>
                              )}
                            </Stack>
                          )}
                        </Grid>
                      </Grid>
                    )}
                    {Array.isArray(test.lastResult?.componentResults) && test.lastResult.componentResults.length > 0 && (
                      <Stack spacing={1.5}>
                        <Typography variant="subtitle1">Resultado por componente</Typography>
                        {test.lastResult.componentResults.map((result) => (
                          <Card key={`${test.id}-${result.componentId}`} variant="outlined">
                            <CardContent>
                              <Stack spacing={1}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Chip label={result.ok ? 'OK' : 'Con fallos'} color={result.ok ? 'success' : 'error'} size="small" />
                                  <Typography fontWeight={700}>{result.name}</Typography>
                                </Stack>
                                <Typography variant="body2" color="text.secondary">
                                  {result.selector}
                                </Typography>
                                {result.checks.map((check) => (
                                  <Alert key={`${result.componentId}-${check.rule}`} severity={check.ok ? 'success' : 'error'} variant="outlined">
                                    <strong>{availableRules.find((item) => item.value === check.rule)?.label ?? check.rule}:</strong> {check.message}
                                    {check.actualValue ? ` Valor final: ${check.actualValue}` : ''}
                                  </Alert>
                                ))}
                                {result.screenshot && (
                                  <Box
                                    component="img"
                                    src={`data:image/png;base64,${result.screenshot}`}
                                    alt={`Foco en ${result.name}`}
                                    sx={{ maxWidth: '100%', borderRadius: 1, border: 1, borderColor: 'divider', cursor: 'zoom-in' }}
                                    onClick={() => setPreviewImage(result.screenshot ?? null)}
                                  />
                                )}
                              </Stack>
                            </CardContent>
                          </Card>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>Nueva captura UI</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <TextField autoFocus label="Nombre" value={name} onChange={(event) => setName(event.target.value)} />
            <TextField
              label="URL"
              value={effectiveUrl || url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={Boolean(selected.pageUrl)}
              helperText={selected.pageUrl ? 'Se usa automaticamente la URL efectiva de la pagina seleccionada en el ambiente actual.' : 'Define la URL que Playwright debe abrir.'}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="outlined" startIcon={<AutoAwesomeRoundedIcon />} onClick={handleInspectComponents} disabled={inspecting || !effectiveUrl}>
                {inspecting ? 'Esperando seleccion...' : 'Seleccionar campo en Chromium'}
              </Button>
              <Typography variant="body2" color="text.secondary">
                Abre Chromium en la pagina real. Hace clic sobre el campo que quieres validar.
              </Typography>
            </Stack>

            {pickerSessionId && (
              <Alert severity="info" variant="outlined">
                Chromium esta abierto. Navegá a la pantalla que quieras, hace clic sobre el campo y volvé aquí.
              </Alert>
            )}

            {detectedComponents.length > 0 && (
              <Card ref={detectedCardRef} variant="outlined">
                <CardContent>
                  <Stack spacing={2}>
                    <Alert severity="success" variant="outlined">
                      Campo seleccionado. Asigna las reglas de validacion y hace clic en <strong>Agregar</strong>. Cuando termines, usa <strong>Guardar</strong>.
                    </Alert>
                    <TextField
                      select
                      fullWidth
                      label="Componente detectado"
                      value={selectedComponentSelector}
                      SelectProps={{ native: true }}
                      onChange={(event) => setSelectedComponentSelector(event.target.value)}
                    >
                      <option value="">Selecciona un componente</option>
                      {detectedComponents.map((component) => (
                        <option key={component.selector} value={component.selector}>
                          {component.label} [{component.tagName}{component.inputType ? `:${component.inputType}` : ''}]
                        </option>
                      ))}
                    </TextField>

                    <FormGroup>
                      {availableRules.map((rule) => (
                        <FormControlLabel
                          key={rule.value}
                          control={(
                            <Checkbox
                              checked={selectedRules.includes(rule.value)}
                              onChange={(event) => handleToggleRule(rule.value, event.target.checked)}
                            />
                          )}
                          label={`${rule.label} - ${rule.helper}`}
                        />
                      ))}
                    </FormGroup>

                    <Button variant="contained" onClick={handleAddConfiguredComponent} disabled={!selectedComponentSelector || selectedRules.length === 0}>
                      Agregar componente a la prueba
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            )}

            {configuredComponents.length > 0 && (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle1">Componentes configurados</Typography>
                    {configuredComponents.map((component) => (
                      <Stack key={component.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                        <Box>
                          <Typography fontWeight={700}>{component.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {component.selector}
                          </Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {component.rules.map((rule) => (
                              <Chip key={`${component.id}-${rule}`} size="small" label={availableRules.find((item) => item.value === rule)?.label ?? rule} variant="outlined" />
                            ))}
                          </Stack>
                        </Box>
                        <Button color="error" onClick={() => handleRemoveConfiguredComponent(component.id)}>
                          Quitar
                        </Button>
                      </Stack>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 3, pb: 2 }}>
          {!configuredComponents.length && (
            <Alert severity="warning" variant="outlined" sx={{ mb: 0 }}>
              Seleccioná un campo en Chromium, asignale una regla (Solo numeros, Sin negativos u Obligatorio) y hacé clic en <strong>Agregar componente</strong>.
            </Alert>
          )}
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={handleCloseDialog}>Cancelar</Button>
            <Button variant="contained" onClick={handleCreate} disabled={saving || !name.trim() || !effectiveUrl || configuredComponents.length === 0}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} fullWidth maxWidth="xs">
        <DialogTitle>Eliminar captura</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Se eliminara la captura seleccionada de la pagina actual.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={Boolean(runningId)}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>

      <AddToSuiteDialog
        open={!!addToSuiteTest}
        tipo="ui"
        test={addToSuiteTest ? { module: selected.moduleName, submodule: selected.submoduleName, page: selected.pageName, id: addToSuiteTest.id, name: addToSuiteTest.name } : null}
        onClose={() => setAddToSuiteTest(null)}
        onNotify={onNotify}
      />

      <Dialog open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} fullWidth maxWidth="lg">
        <DialogTitle>Vista ampliada</DialogTitle>
        <DialogContent>
          {previewImage && (
            <Box
              component="img"
              src={`data:image/png;base64,${previewImage}`}
              alt="Vista ampliada de captura"
              width="100%"
              display="block"
              borderRadius={1}
            />
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
