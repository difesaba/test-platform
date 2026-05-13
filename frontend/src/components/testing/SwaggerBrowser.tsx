import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import api from '../../api/client';
import { useSessionStore } from '../../store/useSessionStore';

export interface SwaggerEndpoint {
  method: string;
  path: string;
  summary: string;
  description?: string;
  parameters: SwaggerParam[];
  bodySchema?: Record<string, unknown>;
  operationId?: string;
}

export interface SwaggerParam {
  name: string;
  in: 'path' | 'query' | 'header' | 'body';
  description?: string;
  required: boolean;
  type?: string;
  example?: unknown;
  default?: unknown;
  enum?: unknown[];
}

const methodColors: Record<string, 'primary' | 'success' | 'warning' | 'secondary' | 'error'> = {
  GET: 'primary',
  POST: 'success',
  PUT: 'warning',
  PATCH: 'secondary',
  DELETE: 'error',
};

interface Props {
  open: boolean;
  onSelect: (endpoint: SwaggerEndpoint) => void;
  onClose: () => void;
  onApiBase?: (base: string) => void;
}

export default function SwaggerBrowser({ open, onSelect, onClose, onApiBase }: Props) {
  const { urlRaiz } = useSessionStore();
  const urlBase = urlRaiz ? urlRaiz.replace(/\/v3$/i, '') : '';

  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!urlBase) {
      setError('No hay una sesion activa para consultar Swagger.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    api.get(`/swagger-proxy?urlBase=${encodeURIComponent(urlBase)}`)
      .then(({ data }) => {
        setSpec(data);

        const swaggerUrl = typeof data._swaggerUrl === 'string' ? data._swaggerUrl : '';
        if (swaggerUrl && onApiBase) {
          onApiBase(swaggerUrl.replace(/\/swagger\/docs\/v\d+.*$/i, ''));
        }
      })
      .catch((requestError: unknown) => {
        const message = requestError && typeof requestError === 'object' && 'response' in requestError
          ? (requestError as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
        setError(message ?? 'No se pudo cargar el catalogo Swagger.');
      })
      .finally(() => setLoading(false));
  }, [onApiBase, open, urlBase]);

  const endpoints = useMemo<SwaggerEndpoint[]>(() => {
    if (!spec || typeof spec.paths !== 'object' || !spec.paths) {
      return [];
    }

    const definitions = typeof spec.definitions === 'object' && spec.definitions
      ? spec.definitions as Record<string, Record<string, unknown>>
      : {};

    return Object.entries(spec.paths as Record<string, Record<string, Record<string, unknown>>>)
      .flatMap(([path, methods]) => Object.entries(methods)
        .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
        .map(([method, operation]) => {
          const rawParameters = Array.isArray(operation.parameters) ? operation.parameters : [];

          const parameters = rawParameters
            .filter((parameter) => parameter && parameter.in !== 'body')
            .map((parameter) => ({
              name: String(parameter.name ?? ''),
              in: parameter.in as SwaggerParam['in'],
              description: typeof parameter.description === 'string' ? parameter.description : undefined,
              required: Boolean(parameter.required),
              type: typeof parameter.type === 'string'
                ? parameter.type
                : typeof parameter.schema?.type === 'string'
                  ? parameter.schema.type
                  : 'string',
              example: parameter.example ?? parameter['x-example'] ?? parameter.schema?.example,
              default: parameter.default ?? parameter.schema?.default,
              enum: Array.isArray(parameter.enum)
                ? parameter.enum
                : Array.isArray(parameter.schema?.enum)
                  ? parameter.schema.enum
                  : undefined,
            }));

          const bodyParameter = rawParameters.find((parameter) => parameter?.in === 'body');
          let bodySchema = bodyParameter?.schema as Record<string, unknown> | undefined;

          if (bodySchema?.$ref && typeof bodySchema.$ref === 'string') {
            const definitionName = bodySchema.$ref.replace('#/definitions/', '');
            bodySchema = definitions[definitionName] ?? bodySchema;
          }

          return {
            method: method.toUpperCase(),
            path,
            summary: typeof operation.summary === 'string'
              ? operation.summary
              : typeof operation.operationId === 'string'
                ? operation.operationId
                : path,
            description: typeof operation.description === 'string' ? operation.description : undefined,
            parameters,
            bodySchema,
            operationId: typeof operation.operationId === 'string' ? operation.operationId : undefined,
          };
        }))
      .sort((left, right) => left.path.localeCompare(right.path));
  }, [spec]);

  const filteredEndpoints = useMemo(() => {
    let result = endpoints;
    if (methodFilter) {
      result = result.filter((endpoint) => endpoint.method === methodFilter);
    }

    if (!search.trim()) {
      return result;
    }

    const normalizedQuery = search.toLowerCase();
    return result.filter((endpoint) => (
      endpoint.summary.toLowerCase().includes(normalizedQuery)
      || endpoint.path.toLowerCase().includes(normalizedQuery)
      || endpoint.description?.toLowerCase().includes(normalizedQuery)
    ));
  }, [endpoints, methodFilter, search]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: 480, lg: 560 },
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Stack spacing={2} sx={{ p: 3 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TravelExploreRoundedIcon color="primary" />
            <Box>
              <Typography variant="h6">Explorar API</Typography>
              <Typography variant="body2" color="text.secondary">
                Busca endpoints del Swagger del entorno activo.
              </Typography>
            </Box>
          </Stack>

          <TextField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por ruta, nombre o descripcion"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
          />

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {[null, 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
              <Button
                key={method ?? 'all'}
                size="small"
                variant={methodFilter === method ? 'contained' : 'outlined'}
                color={method ? methodColors[method] : 'inherit'}
                onClick={() => setMethodFilter(method)}
              >
                {method ?? 'Todos'}
              </Button>
            ))}
          </Stack>
        </Stack>

        <Divider />

        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <Stack spacing={1.5} sx={{ p: 2 }}>
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} variant="rounded" height={84} />
              ))}
            </Stack>
          )}

          {!loading && error && (
            <Box sx={{ p: 3 }}>
              <Typography color="error.main">{error}</Typography>
            </Box>
          )}

          {!loading && !error && (
            <List sx={{ py: 0 }}>
              {filteredEndpoints.map((endpoint) => (
                <ListItemButton
                  key={`${endpoint.method}-${endpoint.path}`}
                  onClick={() => {
                    onSelect(endpoint);
                    onClose();
                  }}
                  sx={{
                    py: 2,
                    px: 3,
                    alignItems: 'flex-start',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <ListItemText
                    primary={(
                      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                        <Chip label={endpoint.method} color={methodColors[endpoint.method] ?? 'default'} size="small" />
                        <Typography variant="subtitle2" fontWeight={700}>
                          {endpoint.summary}
                        </Typography>
                      </Stack>
                    )}
                    secondary={(
                      <Stack spacing={0.75} sx={{ mt: 1 }}>
                        <Typography variant="caption" color="primary.main">
                          {endpoint.path}
                        </Typography>
                        {endpoint.description && (
                          <Typography variant="body2" color="text.secondary">
                            {endpoint.description}
                          </Typography>
                        )}
                      </Stack>
                    )}
                  />
                </ListItemButton>
              ))}

              {!filteredEndpoints.length && (
                <Box sx={{ p: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    No se encontraron endpoints para la busqueda actual.
                  </Typography>
                </Box>
              )}
            </List>
          )}
        </Box>

        <Divider />
        <Box sx={{ px: 3, py: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {filteredEndpoints.length} endpoint(s) disponibles {spec && typeof spec.info === 'object' && spec.info && 'title' in spec.info ? `· ${String(spec.info.title)}` : ''}
          </Typography>
        </Box>
      </Box>
    </Drawer>
  );
}
