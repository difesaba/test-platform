import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import ExtensionRoundedIcon from '@mui/icons-material/ExtensionRounded';
import api from '@/shared/api/client';
import { T } from '@/shared/theme/launcherTokens';
import { RowsSkeleton } from '@/shared/components/Skeletons';

interface AddonRequest {
  id: number;
  addonNumber: number | null;
  grupo: string;
  asunto: string;
  empresa: string;
  sucursal: string;
  responsable: string;
  fecha: string;
  fechaVencimiento: string;
  estado: number;
  cantidadReplicas: number;
  urlRaiz: string | null;
  loginUrl: string | null;
  addonUrl: string | null;
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

function EstadoChip({ estado }: { estado: number }) {
  const map: Record<number, { label: string; color: 'warning' | 'info' | 'success' | 'default' }> = {
    1: { label: 'Pendiente',   color: 'warning' },
    2: { label: 'En proceso',  color: 'info' },
    3: { label: 'Completado',  color: 'success' },
  };
  const cfg = map[estado] ?? { label: `Estado ${estado}`, color: 'default' };
  return <Chip label={cfg.label} color={cfg.color} size="small" />;
}

function isOverdue(fechaVencimiento: string): boolean {
  if (!fechaVencimiento) return false;
  return new Date(fechaVencimiento) < new Date();
}

export default function AddonsPage() {
  const [addons, setAddons] = useState<AddonRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/addons')
      .then(({ data }) => setAddons(data))
      .catch((e) => setError(e?.response?.data?.error ?? 'No se pudo cargar la lista de addons.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = addons.filter(a => a.estado !== 3);

  const handleInstalar = async (addon: AddonRequest) => {
    if (!addon.addonUrl) return;
    try {
      const { data } = await api.get('/torre/sso-url', { params: { loginUrl: addon.loginUrl ?? addon.addonUrl } });
      window.open(data.ssoUrl, '_blank');
    } catch {
      // fallback: abre directo — puede funcionar con las cookies del iframe de Torre
      window.open(addon.addonUrl, '_blank');
    }
  };

  return (
    <Box minHeight="100vh">
      <AppBar position="sticky">
        <Toolbar>
          <Stack direction="row" spacing={1.5} alignItems="center" flex={1}>
            <ExtensionRoundedIcon />
            <Typography variant="h6" fontWeight={800}>
              Solicitudes de Addons
            </Typography>
            {!loading && (
              <Chip
                label={`${pending.length} pendiente${pending.length !== 1 ? 's' : ''}`}
                color={pending.length > 0 ? 'warning' : 'success'}
                size="small"
              />
            )}
          </Stack>

          <Tooltip title="Recargar">
            <IconButton color="inherit" onClick={load} disabled={loading}>
              {loading ? <CircularProgress size={20} color="inherit" /> : <RefreshRoundedIcon />}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box px={3} py={3} maxWidth={1400} mx="auto">
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        )}

        {loading && <RowsSkeleton rows={5} height={52} />}

        {!loading && addons.length === 0 && !error && (
          <Box textAlign="center" py={8}>
            <ExtensionRoundedIcon sx={{ fontSize: 56, color: T.text.muted }} />
            <Typography variant="h6" color="text.secondary" mt={1}>
              No hay solicitudes de addons
            </Typography>
            <Typography variant="body2" sx={{ color: T.text.muted }}>
              El equipo no tiene mensajes de tipo ADDON pendientes.
            </Typography>
          </Box>
        )}

        {!loading && addons.length > 0 && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Addon</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Empresa</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Sucursal</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Responsable</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Vencimiento</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Acción</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {addons.map((addon) => {
                  const overdue = isOverdue(addon.fechaVencimiento) && addon.estado !== 3;
                  return (
                    <TableRow
                      key={addon.id}
                      sx={{ bgcolor: overdue ? T.error.bg : undefined }}
                    >
                      <TableCell>
                        {addon.addonNumber !== null ? (
                          <Chip
                            label={`#${addon.addonNumber}`}
                            color="primary"
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 700, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
                          />
                        ) : (
                          <Tooltip title={addon.asunto}>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 180, display: 'block' }}>
                              {addon.asunto}
                            </Typography>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 220 }}>
                          {addon.empresa}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 180 }}>
                          {addon.sucursal || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {addon.responsable}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          color={overdue ? 'error.main' : 'text.secondary'}
                          fontWeight={overdue ? 700 : 400}
                          noWrap
                        >
                          {fmtDate(addon.fechaVencimiento)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <EstadoChip estado={addon.estado} />
                      </TableCell>
                      <TableCell align="center">
                        {addon.addonUrl ? (
                          <Button
                            size="small"
                            variant="contained"
                            endIcon={<OpenInNewRoundedIcon fontSize="small" />}
                            onClick={() => handleInstalar(addon)}
                          >
                            Instalar
                          </Button>
                        ) : (
                          <Tooltip title="No se pudo resolver la URL de esta empresa en empresas.json">
                            <span>
                              <Button size="small" variant="outlined" disabled>
                                Sin URL
                              </Button>
                            </span>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
}
