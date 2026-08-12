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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddLinkRoundedIcon from '@mui/icons-material/AddLinkRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import AddToSuiteDialog from '@/features/suites/components/AddToSuiteDialog';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import ApiRoundedIcon from '@mui/icons-material/ApiRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RuleRoundedIcon from '@mui/icons-material/RuleRounded';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { getApiTests, saveApiTest, runApiTest, deleteApiTest } from '@/features/apiTests/services/apiTests';
import type { SelectedModule } from '@/shared/store/useModuleStore';
import { useSessionStore } from '@/shared/store/useSessionStore';
import SwaggerBrowser, { type SwaggerEndpoint } from '@/features/apiTests/components/SwaggerBrowser';
import ApiTestEditDialog from '@/features/apiTests/components/ApiTestEditDialog';
import type { ApiTest, ApiAssertion, ApiAssertionType, ApiExtraction } from '@/shared/types/platform';
import { RowsSkeleton } from '@/shared/components/Skeletons';
import { ASSERTION_META, ASSERTION_TYPES, newAssertionId, relativeBasePath } from '@/features/apiTests/models/assertions.model';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import { buildSelectionQuery, formatRunTime, resolvePath } from '@/shared/utils/platform';
import EmptyState from '@/shared/components/EmptyState';
import TabPanelHeader from '@/shared/components/TabPanelHeader';
import BatchSection from '@/features/apiTests/components/BatchSection';

const methodColors: Record<string, 'primary' | 'success' | 'warning' | 'secondary' | 'error'> = {
  GET: 'primary',
  POST: 'success',
  PUT: 'warning',
  PATCH: 'secondary',
  DELETE: 'error',
};

function defaultForType(type?: string) {
  if (type === 'integer' || type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'array') return [];
  return '';
}

function buildBodyExample(schema?: Record<string, unknown>): unknown {
  if (!schema) {
    return {};
  }

  if ('example' in schema) {
    return schema.example;
  }

  if (schema.type === 'object' && schema.properties && typeof schema.properties === 'object') {
    return Object.entries(schema.properties).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
      const property = value as Record<string, unknown>;
      accumulator[key] = property.example ?? property.default ?? (Array.isArray(property.enum) ? property.enum[0] : defaultForType(typeof property.type === 'string' ? property.type : undefined));
      return accumulator;
    }, {});
  }

  if (schema.type === 'array') {
    return [buildBodyExample(schema.items as Record<string, unknown> | undefined)];
  }

  return defaultForType(typeof schema.type === 'string' ? schema.type : undefined);
}

interface Props {
  selected: SelectedModule;
  onNotify: (message: string, severity?: 'success' | 'error' | 'info') => void;
  swaggerUrl?: string;
}

export default function ApiTestTab({ selected, onNotify, swaggerUrl }: Props) {
  const { urlRaiz } = useSessionStore();
  const [tests, setTests] = useState<ApiTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [swaggerBase, setSwaggerBase] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<SwaggerEndpoint | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [addToSuiteTest, setAddToSuiteTest] = useState<ApiTest | null>(null);
  const [editTest, setEditTest] = useState<ApiTest | null>(null);
  const [historyTestId, setHistoryTestId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [testName, setTestName] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [expectedStatus, setExpectedStatus] = useState('200');
  const [assertions, setAssertions] = useState<ApiAssertion[]>([]);
  const [extract, setExtract] = useState<ApiExtraction[]>([]);
  const [saving, setSaving] = useState(false);

  const addAssertion = () => setAssertions((current) => [...current, { id: newAssertionId(), type: 'field-exists', target: '', value: '' }]);
  const updateAssertion = (id: string, patch: Partial<ApiAssertion>) =>
    setAssertions((current) => current.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const removeAssertion = (id: string) => setAssertions((current) => current.filter((a) => a.id !== id));

  const addExtraction = () => setExtract((current) => [...current, { id: newAssertionId(), name: '', path: '' }]);
  const updateExtraction = (id: string, patch: Partial<ApiExtraction>) =>
    setExtract((current) => current.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeExtraction = (id: string) => setExtract((current) => current.filter((e) => e.id !== id));

  const load = useCallback(() => {
    setLoading(true);
    return getApiTests(selected)
      .then((res) => {
        if (res.success && res.data) {
          const data = res.data;
          setTests(data);
          setExpandedIds((current) => current.filter((id) => data.some((test: ApiTest) => test.id === id)));
        } else {
          onNotify('No se pudieron cargar las pruebas API.', 'error');
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNotify, selected.moduleName, selected.pageName, selected.submoduleName]);

  useEffect(() => {
    load();
    setSelectedEndpoint(null);
  }, [load, selected.moduleName, selected.pageName, selected.submoduleName]);

  const smartDefault = (param: SwaggerEndpoint['parameters'][number]) => {
    if (param.example != null) return String(param.example);
    if (param.default != null) return String(param.default);
    if (param.enum?.length) return String(param.enum[0]);

    const normalizedName = param.name.toLowerCase();
    if (normalizedName.includes('fecha')) return new Date().toISOString().slice(0, 10);
    if (normalizedName.includes('nombre')) return 'Prueba';
    if (normalizedName.endsWith('id')) return '1';
    if (param.type === 'integer' || param.type === 'number') return '1';
    if (param.type === 'boolean') return 'true';
    return 'texto';
  };

  const handleSelectEndpoint = (endpoint: SwaggerEndpoint) => {
    setSelectedEndpoint(endpoint);
    setTestName(endpoint.summary);
    setExpectedStatus('200');

    const nextPath: Record<string, string> = {};
    const nextQuery: Record<string, string> = {};

    endpoint.parameters.forEach((param) => {
      const value = smartDefault(param);
      if (param.in === 'path') {
        nextPath[param.name] = value;
      }
      if (param.in === 'query') {
        nextQuery[param.name] = value;
      }
    });

    setParamValues(nextPath);
    setQueryValues(nextQuery);
    setBodyText(endpoint.bodySchema ? JSON.stringify(buildBodyExample(endpoint.bodySchema), null, 2) : '');
    setAssertions([]);
    setExtract([]);
  };

  const buildFinalUrl = () => {
    if (!selectedEndpoint) {
      return '';
    }

    const resolvedPath = resolvePath(selectedEndpoint.path, paramValues);
    const nonEmptyQuery = Object.fromEntries(Object.entries(queryValues).filter(([, value]) => value !== ''));
    const query = Object.keys(nonEmptyQuery).length ? `?${new URLSearchParams(nonEmptyQuery)}` : '';
    const fallbackBase = swaggerBase || urlRaiz?.replace(/\/v3$/i, '') || '';
    return `${fallbackBase}${resolvedPath}${query}`;
  };

  const handleSave = async (runAfterSave = false) => {
    if (!selectedEndpoint || !testName.trim()) {
      return;
    }

    setSaving(true);

    try {
      const cleanAssertions = assertions
        .map((a) => ({ ...a, target: a.target?.trim(), value: a.value?.trim() }))
        .filter((a) => {
          const meta = ASSERTION_META[a.type];
          if (meta.needsTarget && !a.target) return false;
          if (meta.needsValue && !a.value) return false;
          return true;
        });

      const cleanExtract = extract
        .map((e) => ({ ...e, name: e.name?.trim(), path: e.path?.trim() }))
        .filter((e) => e.name && e.path);

      // Guardamos la ruta relativa a la raíz de la empresa (todo cambia menos la urlRaiz entre empresas),
      // así la prueba corre contra cualquier empresa componiendo con su urlRaiz al ejecutar.
      const finalUrl = buildFinalUrl();
      const basePath = relativeBasePath(finalUrl, urlRaiz);

      const saveRes = await saveApiTest(selected, {
        name: testName.trim(),
        url: finalUrl,
        basePath,
        method: selectedEndpoint.method,
        headers: {},
        body: bodyText,
        expectedStatus: expectedStatus === '0' ? 0 : Number(expectedStatus) || 200,
        assertions: cleanAssertions,
        extract: cleanExtract,
      });

      if (!saveRes.success || !saveRes.data) {
        onNotify('No fue posible guardar la prueba API.', 'error');
        return;
      }
      const created = saveRes.data;

      if (runAfterSave) {
        const runRes = await runApiTest(created.id, selected);
        if (!runRes.success || !runRes.data) {
          onNotify('No fue posible guardar la prueba API.', 'error');
          return;
        }
        const result = runRes.data;
        setSelectedEndpoint(null);
        await load();
        setTests((current) => current.map((t) => t.id === created.id ? { ...t, lastResult: result } : t));
        setExpandedIds((current) => current.includes(created.id) ? current : [...current, created.id]);
        onNotify('Prueba guardada y ejecutada.', 'success');
      } else {
        setSelectedEndpoint(null);
        load();
        onNotify('Prueba API guardada.', 'success');
      }
    } catch {
      onNotify('No fue posible guardar la prueba API.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      const runRes = await runApiTest(id, selected);
      if (runRes.success && runRes.data) {
        const result = runRes.data;
        setTests((current) => current.map((t) => t.id === id ? { ...t, lastResult: result } : t));
        setExpandedIds((current) => current.includes(id) ? current : [...current, id]);
        onNotify('Prueba API ejecutada.', 'success');
      } else {
        onNotify('No fue posible ejecutar la prueba API.', 'error');
      }
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) {
      return;
    }

    const res = await deleteApiTest(deleteId, selected);
    if (res.success) {
      onNotify('Prueba API eliminada.', 'success');
      setDeleteId(null);
      load();
    } else {
      onNotify('No fue posible eliminar la prueba API.', 'error');
    }
  };

  const pathParams = selectedEndpoint?.parameters.filter((param) => param.in === 'path') ?? [];
  const queryParams = selectedEndpoint?.parameters.filter((param) => param.in === 'query') ?? [];
  const hasBody = selectedEndpoint && !['GET', 'HEAD', 'DELETE'].includes(selectedEndpoint.method);

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <TabPanelHeader
            title="Pruebas API"
            description="Crea casos desde Swagger, ajusta parametros y ejecutalos desde un solo flujo."
            primaryAction={
              <Button variant="contained" startIcon={<AddLinkRoundedIcon />} onClick={() => setBrowserOpen(true)}>
                Explorar Swagger
              </Button>
            }
          />
        </CardContent>
      </Card>

      {selectedEndpoint && (
        <Card>
          <CardContent>
            <Stack spacing={2.5}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip label={selectedEndpoint.method} color={methodColors[selectedEndpoint.method] ?? 'default'} />
                <Typography variant="h6">{selectedEndpoint.summary}</Typography>
                <Chip label={selectedEndpoint.path} icon={<ApiRoundedIcon />} variant="outlined" />
              </Stack>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Nombre de la prueba"
                    value={testName}
                    onChange={(event) => setTestName(event.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    select
                    fullWidth
                    label="Status esperado"
                    value={expectedStatus}
                    SelectProps={{ native: true }}
                    onChange={(event) => setExpectedStatus(event.target.value)}
                  >
                    <option value="200">200 OK</option>
                    <option value="201">201 Creado</option>
                    <option value="204">204 Sin contenido</option>
                    <option value="400">400 Error</option>
                    <option value="0">Cualquiera</option>
                  </TextField>
                </Grid>
              </Grid>

              {(pathParams.length > 0 || queryParams.length > 0) && (
                <Grid container spacing={2}>
                  {pathParams.map((param) => (
                    <Grid key={`path-${param.name}`} size={{ xs: 12, md: 6 }}>
                      <TextField
                        fullWidth
                        label={`Path · ${param.name}`}
                        helperText={param.description}
                        value={paramValues[param.name] ?? ''}
                        onChange={(event) => setParamValues((current) => ({ ...current, [param.name]: event.target.value }))}
                      />
                    </Grid>
                  ))}
                  {queryParams.map((param) => (
                    <Grid key={`query-${param.name}`} size={{ xs: 12, md: 6 }}>
                      <TextField
                        fullWidth
                        label={`Query · ${param.name}`}
                        helperText={param.description}
                        value={queryValues[param.name] ?? ''}
                        onChange={(event) => setQueryValues((current) => ({ ...current, [param.name]: event.target.value }))}
                      />
                    </Grid>
                  ))}
                </Grid>
              )}

              {hasBody && (
                <TextField
                  fullWidth
                  multiline
                  minRows={7}
                  label="Body JSON"
                  value={bodyText}
                  onChange={(event) => setBodyText(event.target.value)}
                />
              )}

              <Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <RuleRoundedIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2">Validaciones</Typography>
                  <Typography variant="caption" color="text.secondary">
                    (además del status: todas deben cumplirse)
                  </Typography>
                  <Box flex={1} />
                  <Button size="small" startIcon={<AddRoundedIcon />} onClick={addAssertion}>
                    Agregar
                  </Button>
                </Stack>
                {assertions.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Sin validaciones extra. Solo se comprueba el status HTTP esperado.
                  </Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {assertions.map((a) => {
                      const meta = ASSERTION_META[a.type];
                      return (
                        <Stack key={a.id} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                          <TextField
                            select
                            size="small"
                            label="Validación"
                            value={a.type}
                            SelectProps={{ native: true }}
                            sx={{ minWidth: 190 }}
                            onChange={(event) => updateAssertion(a.id, { type: event.target.value as ApiAssertionType })}
                          >
                            {ASSERTION_TYPES.map((t) => (
                              <option key={t} value={t}>{ASSERTION_META[t].label}</option>
                            ))}
                          </TextField>
                          {meta.needsTarget && (
                            <TextField
                              size="small"
                              label={meta.targetLabel}
                              placeholder={meta.targetPlaceholder}
                              value={a.target ?? ''}
                              onChange={(event) => updateAssertion(a.id, { target: event.target.value })}
                              sx={{ flex: 1, minWidth: 140 }}
                            />
                          )}
                          {meta.needsValue && (
                            <TextField
                              size="small"
                              label={meta.valueLabel}
                              placeholder={meta.valuePlaceholder}
                              value={a.value ?? ''}
                              onChange={(event) => updateAssertion(a.id, { value: event.target.value })}
                              sx={{ flex: 1, minWidth: 140 }}
                            />
                          )}
                          <IconButton size="small" color="error" onClick={() => removeAssertion(a.id)}>
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      );
                    })}
                  </Stack>
                )}
              </Box>

              <Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <AltRouteRoundedIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2">Variables de salida</Typography>
                  <Typography variant="caption" color="text.secondary">
                    (guarda datos de la respuesta para reusarlos en otra prueba de la suite con {'{{'}variable{'}}'})
                  </Typography>
                  <Box flex={1} />
                  <Button size="small" startIcon={<AddRoundedIcon />} onClick={addExtraction}>
                    Agregar
                  </Button>
                </Stack>
                {extract.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Sin variables. Útil para encadenar: p. ej. un POST guarda <code>data.id</code> como <code>nuevoId</code> y el siguiente GET usa <code>{'{{'}nuevoId{'}}'}</code>.
                  </Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {extract.map((e) => (
                      <Stack key={e.id} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                        <TextField
                          size="small"
                          label="Nombre variable"
                          placeholder="nuevoId"
                          value={e.name}
                          onChange={(event) => updateExtraction(e.id, { name: event.target.value })}
                          sx={{ flex: 1, minWidth: 140 }}
                        />
                        <TextField
                          size="small"
                          label="Campo (ruta)"
                          placeholder="data.id"
                          value={e.path}
                          onChange={(event) => updateExtraction(e.id, { path: event.target.value })}
                          sx={{ flex: 1, minWidth: 140 }}
                        />
                        <IconButton size="small" color="error" onClick={() => removeExtraction(e.id)}>
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Box>

              <Alert icon={<AutoFixHighRoundedIcon fontSize="inherit" />} severity="info" variant="outlined">
                URL final: {buildFinalUrl() || 'Completa los parametros para generar la URL.'}
              </Alert>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button variant="contained" onClick={() => handleSave(false)} disabled={saving || !testName.trim()}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </Button>
                <Button variant="outlined" onClick={() => handleSave(true)} disabled={saving || !testName.trim()}>
                  {saving ? 'Ejecutando...' : 'Guardar y probar'}
                </Button>
                <Button color="inherit" onClick={() => setSelectedEndpoint(null)}>
                  Cancelar
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Casos registrados
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
                icon={<AddLinkRoundedIcon sx={{ fontSize: 40 }} />}
                title="Sin pruebas API todavía"
                description="Usa el explorador de Swagger para crear tu primer caso."
                cta={<Button variant="contained" startIcon={<AddLinkRoundedIcon />} onClick={() => setBrowserOpen(true)}>Explorar Swagger</Button>}
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
                    <Chip label={test.method} color={methodColors[test.method] ?? 'default'} size="small" />
                    <Box flex={1} minWidth={0}>
                      <Typography fontWeight={700} noWrap>
                        {test.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        Esperado: HTTP {test.expectedStatus} · Ultima ejecucion: {formatRunTime(test.lastResult?.runAt)}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5}>
                      <IconButton size="small" color="primary" onClick={(event) => {
                        event.stopPropagation();
                        handleRun(test.id);
                      }}>
                        <PlayArrowRoundedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" title="Editar" onClick={(event) => {
                        event.stopPropagation();
                        setEditTest(test);
                      }}>
                        <EditRoundedIcon fontSize="small" />
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
                    <TextField
                      fullWidth
                      label={test.basePath ? 'Ruta (relativa a la empresa activa)' : 'URL'}
                      value={test.basePath || test.url}
                      helperText={test.basePath ? 'Se ejecuta contra la urlRaiz de la empresa/entorno activo.' : 'Prueba antigua con URL fija; se migra a ruta relativa al correrla.'}
                      InputProps={{ readOnly: true }}
                    />
                    {((test.assertions?.length ?? 0) > 0 || (test.extract?.length ?? 0) > 0) && !test.lastResult && (
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        {(test.assertions?.length ?? 0) > 0 && (
                          <Chip size="small" icon={<RuleRoundedIcon />} label={`${test.assertions!.length} validación(es)`} variant="outlined" />
                        )}
                        {(test.extract?.length ?? 0) > 0 && (
                          <Chip size="small" icon={<AltRouteRoundedIcon />} label={`${test.extract!.length} variable(s)`} variant="outlined" />
                        )}
                      </Stack>
                    )}
                    {test.lastResult ? (
                      <>
                        <Alert severity={test.lastResult.ok ? 'success' : 'error'} variant="outlined">
                          HTTP {test.lastResult.status} · {test.lastResult.time} ms · {formatRunTime(test.lastResult.runAt)}
                          {test.lastResult.statusOk === false && ' · status inesperado'}
                        </Alert>
                        {(test.lastResult.assertionResults?.length ?? 0) > 0 && (
                          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                              Validaciones
                            </Typography>
                            <Stack spacing={0.75}>
                              {test.lastResult.assertionResults!.map((ar) => (
                                <Stack key={ar.id} direction="row" spacing={1} alignItems="center">
                                  {ar.ok
                                    ? <CheckCircleRoundedIcon fontSize="small" color="success" />
                                    : <CancelRoundedIcon fontSize="small" color="error" />}
                                  <Typography variant="body2" color={ar.ok ? 'text.primary' : 'error'}>
                                    {ar.message}
                                  </Typography>
                                </Stack>
                              ))}
                            </Stack>
                          </Box>
                        )}
                        {test.lastResult.extracted && Object.keys(test.lastResult.extracted).length > 0 && (
                          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.25 }}>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                              <AltRouteRoundedIcon fontSize="small" color="action" />
                              <Typography variant="caption" color="text.secondary">
                                Variables extraídas (disponibles para las siguientes pruebas de la suite)
                              </Typography>
                            </Stack>
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                              {Object.entries(test.lastResult.extracted).map(([k, v]) => (
                                <Chip key={k} size="small" label={`${k} = ${v}`} sx={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }} />
                              ))}
                            </Stack>
                          </Box>
                        )}
                        <TextField
                          fullWidth
                          multiline
                          minRows={10}
                          maxRows={10}
                          label="Respuesta"
                          value={typeof test.lastResult.body === 'string'
                            ? test.lastResult.body
                            : JSON.stringify(test.lastResult.body, null, 2)}
                          InputProps={{ readOnly: true }}
                        />
                      </>
                    ) : (
                      <Alert severity="info" variant="outlined">
                        Este caso aun no registra respuesta.
                      </Alert>
                    )}
                    {(test.history?.length ?? 0) > 0 && (
                      <Box>
                        <Button variant="outlined" size="small" onClick={() => setHistoryTestId(test.id)}>
                          Historial ({test.history!.length})
                        </Button>
                      </Box>
                    )}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        </CardContent>
      </Card>

      {tests.length > 0 && (
        <BatchSection
          tests={tests}
          moduleName={selected.moduleName}
          submodule={selected.submoduleName}
          page={selected.pageName}
        />
      )}

      <SwaggerBrowser
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onSelect={handleSelectEndpoint}
        onApiBase={setSwaggerBase}
        apiBaseOverride={swaggerUrl}
      />

      <Dialog open={Boolean(historyTestId)} onClose={() => setHistoryTestId(null)} fullWidth maxWidth="md">
        <DialogTitle>
          Historial — {tests.find((t) => t.id === historyTestId)?.name}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {tests.find((t) => t.id === historyTestId)?.history?.map((entry, idx) => (
              <Box key={idx} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                <Alert
                  severity={entry.ok ? 'success' : 'error'}
                  variant="outlined"
                  sx={{ borderRadius: 0, border: 'none', borderBottom: '1px solid', borderColor: 'divider' }}
                >
                  HTTP {entry.status} · {entry.time}ms · {formatRunTime(entry.runAt)}
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
                  value={typeof entry.body === 'string' ? entry.body : JSON.stringify(entry.body, null, 2)}
                  InputProps={{ readOnly: true, sx: { fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11 } }}
                  size="small"
                />
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryTestId(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} fullWidth maxWidth="xs">
        <DialogTitle>Eliminar prueba API</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Esta accion eliminara el caso seleccionado de la pagina actual.
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
        tipo="api"
        test={addToSuiteTest ? { module: selected.moduleName, submodule: selected.submoduleName, page: selected.pageName, id: addToSuiteTest.id, name: addToSuiteTest.name } : null}
        onClose={() => setAddToSuiteTest(null)}
        onNotify={onNotify}
      />

      <ApiTestEditDialog
        open={!!editTest}
        test={editTest}
        selectionQuery={buildSelectionQuery(selected)}
        urlRaiz={urlRaiz}
        onClose={() => setEditTest(null)}
        onNotify={onNotify}
        onSaved={(updated) => {
          setTests((current) => current.map((t) => (t.id === updated.id ? updated : t)));
          setEditTest(null);
        }}
      />
    </Stack>
  );
}
