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
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import ApiRoundedIcon from '@mui/icons-material/ApiRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import api from '../../api/client';
import type { SelectedModule } from '../../store/useModuleStore';
import { useSessionStore } from '../../store/useSessionStore';
import SwaggerBrowser, { type SwaggerEndpoint } from './SwaggerBrowser';
import type { ApiTest } from '../../types/platform';
import { buildSelectionQuery, formatRunTime, resolvePath } from '../../utils/platform';

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
}

export default function ApiTestTab({ selected, onNotify }: Props) {
  const { urlRaiz } = useSessionStore();
  const [tests, setTests] = useState<ApiTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [swaggerBase, setSwaggerBase] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<SwaggerEndpoint | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [testName, setTestName] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [expectedStatus, setExpectedStatus] = useState('200');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return api.get(`/api-tests?${buildSelectionQuery(selected)}`)
      .then(({ data }) => {
        setTests(data);
        setExpandedIds((current) => current.filter((id) => data.some((test: ApiTest) => test.id === id)));
      })
      .catch(() => onNotify('No se pudieron cargar las pruebas API.', 'error'))
      .finally(() => setLoading(false));
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
      const { data } = await api.post(`/api-tests?${buildSelectionQuery(selected)}`, {
        name: testName.trim(),
        url: buildFinalUrl(),
        method: selectedEndpoint.method,
        headers: {},
        body: bodyText,
        expectedStatus: expectedStatus === '0' ? 0 : Number(expectedStatus) || 200,
      });

      if (runAfterSave) {
        const { data: result } = await api.post(`/api-tests/${data.id}/run?${buildSelectionQuery(selected)}`);
        setSelectedEndpoint(null);
        await load();
        setTests((current) => current.map((t) => t.id === data.id ? { ...t, lastResult: result } : t));
        setExpandedIds((current) => current.includes(data.id) ? current : [...current, data.id]);
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
      const { data: result } = await api.post(`/api-tests/${id}/run?${buildSelectionQuery(selected)}`);
      setTests((current) => current.map((t) => t.id === id ? { ...t, lastResult: result } : t));
      setExpandedIds((current) => current.includes(id) ? current : [...current, id]);
      onNotify('Prueba API ejecutada.', 'success');
    } catch {
      onNotify('No fue posible ejecutar la prueba API.', 'error');
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) {
      return;
    }

    try {
      await api.delete(`/api-tests/${deleteId}?${buildSelectionQuery(selected)}`);
      onNotify('Prueba API eliminada.', 'success');
      setDeleteId(null);
      load();
    } catch {
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
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
          >
            <Box>
              <Typography variant="h5">Pruebas API</Typography>
              <Typography variant="body2" color="text.secondary">
                Crea casos desde Swagger, ajusta parametros y ejecutalos desde un solo flujo.
              </Typography>
              {selected.pageUrl && (
                <Typography variant="caption" color="primary.main">
                  {selected.pageUrl}
                </Typography>
              )}
            </Box>
            <Button variant="contained" startIcon={<AddLinkRoundedIcon />} onClick={() => setBrowserOpen(true)}>
              Explorar Swagger
            </Button>
          </Stack>
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
            Casos guardados
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
            {loading && <Alert severity="info" variant="outlined">Cargando pruebas API...</Alert>}
            {!loading && tests.length === 0 && (
              <Alert severity="info" variant="outlined">
                No hay pruebas API registradas. Usa el explorador Swagger para crear la primera.
              </Alert>
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
                    {test.lastResult ? (
                      <>
                        <Alert severity={test.lastResult.ok ? 'success' : 'error'} variant="outlined">
                          HTTP {test.lastResult.status} · {test.lastResult.time} ms · {formatRunTime(test.lastResult.runAt)}
                        </Alert>
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
                  </Stack>
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <SwaggerBrowser
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onSelect={handleSelectEndpoint}
        onApiBase={setSwaggerBase}
      />

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
    </Stack>
  );
}
