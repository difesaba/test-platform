import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  List,
  ListItemButton,
  ListItemText,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import BusinessRoundedIcon from '@mui/icons-material/BusinessRounded';
import DomainRoundedIcon from '@mui/icons-material/DomainRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded';
import StoreRoundedIcon from '@mui/icons-material/StoreRounded';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import api from '../api/client';
import { useSessionStore } from '../store/useSessionStore';
import type { Client, EmpresaOption, SucursalOption } from '../types/platform';
import { ENVIRONMENT_ORDER, getEnvironmentMeta } from '../utils/platform';

const steps = ['Entorno', 'Empresa', 'Sucursal'];

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuthenticated = useSessionStore((s) => s.setAuthenticated);
  const backendAvailable = useSessionStore((s) => s.backendAvailable);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  const [allClients, setAllClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<{ empId: number; empNombre: string } | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [sucursales, setSucursales] = useState<SucursalOption[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState('');

  useEffect(() => {
    if (!backendAvailable) {
      setLoadingClients(false);
      setError('El backend no esta disponible. Verifica el servidor y el puerto configurado para /api.');
      return;
    }

    api.get('/clients')
      .then(({ data }) => setAllClients(data))
      .catch(() => setError('No se pudo cargar la lista de entornos disponibles.'))
      .finally(() => setLoadingClients(false));
  }, [backendAvailable]);

  const allGroups = useMemo(() => {
    const map = new Map<number, string>();
    allClients.forEach((client) => {
      map.set(client.empId, client.empNombre);
    });

    return Array.from(map.entries())
      .map(([empId, empNombre]) => ({ empId, empNombre }))
      .sort((left, right) => left.empNombre.localeCompare(right.empNombre, 'es', { sensitivity: 'base' }));
  }, [allClients]);

  const groupClients = useMemo(() => {
    if (!selectedGroup) {
      return [];
    }

    return allClients
      .filter((client) => client.empId === selectedGroup.empId)
      .sort((left, right) => (
        ENVIRONMENT_ORDER.indexOf(left.entorno) - ENVIRONMENT_ORDER.indexOf(right.entorno)
        || left.empresaNombre.localeCompare(right.empresaNombre, 'es')
      ));
  }, [allClients, selectedGroup]);

  const resetAuth = () => {
    setEmpresas([]);
    setEmpresaId('');
    setSucursales([]);
    setSucursalId('');
    setStep(1);
  };

  const handleGroupChange = (_event: unknown, value: { empId: number; empNombre: string } | null) => {
    setSelectedGroup(value);
    setSelectedClient(null);
    resetAuth();
  };

  const handleClientSelect = (client: Client) => {
    setSelectedClient(client);
    resetAuth();
  };

  const handleGetEmpresas = async () => {
    if (!selectedClient) return;

    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/empresas', { urlIngresar: selectedClient.loginUrl });
      setEmpresas(data.empresas);
      setStep(2);
      setSnackbar('Empresas cargadas correctamente.');
    } catch (requestError: unknown) {
      const message = requestError && typeof requestError === 'object' && 'response' in requestError
        ? (requestError as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      setError(message ?? 'Error conectando con el entorno seleccionado.');
    } finally {
      setLoading(false);
    }
  };

  const handleGetSucursales = async () => {
    if (!selectedClient) return;

    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/sucursales', {
        urlRaiz: selectedClient.urlRaiz,
        clienteId: 1,
        empresaId: Number(empresaId),
      });
      setSucursales(data);
      setStep(3);
      setSnackbar('Sucursales disponibles cargadas.');
    } catch (requestError: unknown) {
      const message = requestError && typeof requestError === 'object' && 'response' in requestError
        ? (requestError as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      setError(message ?? 'Error obteniendo sucursales.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!selectedClient) return;

    setError('');
    setLoading(true);

    try {
      const selectedEmpresa = empresas.find((item) => String(item.IdEmpresa ?? item.Id) === empresaId);
      const selectedSucursal = sucursales.find((item) => String(item.Id) === sucursalId);

      await api.post('/auth/login', {
        urlRaiz: selectedClient.urlRaiz,
        clienteId: 1,
        empresaId: Number(empresaId),
        sucursalId: Number(sucursalId),
        entornoName: selectedSucursal?.entorno ?? 'produccion',
        empresaNombre: selectedEmpresa?.Nombre,
        sucursalNombre: selectedSucursal?.Nombre,
        empNombre: selectedGroup?.empNombre,
      });

      setAuthenticated(true, {
        urlRaiz: selectedClient.urlRaiz,
        empresa: { id: selectedEmpresa?.Id ?? selectedEmpresa?.IdEmpresa ?? 0, nombre: selectedEmpresa?.Nombre ?? '' },
        sucursal: { id: selectedSucursal?.Id ?? 0, nombre: selectedSucursal?.Nombre ?? '', entorno: selectedSucursal?.entorno ?? 'produccion' },
      });

      navigate('/platform');
    } catch (requestError: unknown) {
      const message = requestError && typeof requestError === 'object' && 'response' in requestError
        ? (requestError as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      setError(message ?? 'No fue posible iniciar sesion con la configuracion elegida.');
    } finally {
      setLoading(false);
    }
  };

  const selectedEnvironment = getEnvironmentMeta(selectedClient?.entorno);

  return (
    <Box minHeight="100vh" px={isDesktop ? 4 : 2} py={isDesktop ? 5 : 3}>
      <Box maxWidth={1360} mx="auto">
        <Grid container spacing={3} alignItems="stretch">
          <Grid size={{ xs: 12, lg: 4.5 }}>
            <Card>
              <CardContent>
                <Stack spacing={4} minHeight="100%" justifyContent="center">
                  <Stack spacing={2}>
                    <Chip icon={<BusinessRoundedIcon />} label="testPlatform" variant="outlined" color="primary" />
                    <Typography variant="h4">
                      Acceso corporativo para operar pruebas con un flujo claro.
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                      Selecciona grupo, entorno, empresa y sucursal en una sola vista, sin bloques visuales innecesarios.
                    </Typography>
                  </Stack>

                  <Stack spacing={2} divider={<Divider flexItem />}>
                    {[
                      {
                        icon: <ShieldOutlinedIcon color="primary" />,
                        title: 'Sesiones controladas',
                        text: 'La seleccion del contexto queda visible antes de ingresar.',
                      },
                      {
                        icon: <ChecklistRoundedIcon color="primary" />,
                        title: 'Proceso guiado',
                        text: 'Cada paso aparece solo cuando corresponde y reduce errores.',
                      },
                      {
                        icon: <InsightsRoundedIcon color="primary" />,
                        title: 'Operacion directa',
                        text: 'Menos ruido visual y mejor foco en la tarea de acceso.',
                      },
                    ].map((item) => (
                      <Stack key={item.title} direction="row" spacing={2} alignItems="flex-start">
                        {item.icon}
                        <Box>
                          <Typography variant="subtitle1" fontWeight={700}>
                            {item.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {item.text}
                          </Typography>
                        </Box>
                      </Stack>
                    ))}
                  </Stack>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip label={`${allGroups.length} grupos`} variant="outlined" size="small" />
                    <Chip label={`${allClients.length} entornos`} variant="outlined" size="small" />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, lg: 7.5 }}>
            <Card>
              <CardContent>
                <Stack spacing={3}>
                  <Stack direction={isDesktop ? 'row' : 'column'} spacing={1.5} justifyContent="space-between" alignItems={isDesktop ? 'center' : 'flex-start'}>
                    <Box>
                      <Typography variant="h4">Iniciar sesion</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Selecciona el contexto de trabajo para ingresar al dashboard operativo.
                    </Typography>
                  </Box>
                  <Chip icon={<DomainRoundedIcon />} label={selectedGroup?.empNombre ?? 'Sin grupo seleccionado'} variant="outlined" />
                </Stack>

                {isDesktop && (
                  <Stepper activeStep={step - 1} alternativeLabel>
                    {steps.map((label) => (
                      <Step key={label}>
                        <StepLabel>{label}</StepLabel>
                      </Step>
                    ))}
                  </Stepper>
                )}

                {error && <Alert severity="error">{error}</Alert>}

                  <Grid container spacing={3}>
                  <Grid size={{ xs: 12 }}>
                    <Autocomplete
                      fullWidth
                      options={allGroups}
                      loading={loadingClients}
                      value={selectedGroup}
                      onChange={handleGroupChange}
                      isOptionEqualToValue={(option, value) => option.empId === value.empId}
                      getOptionLabel={(option) => option.empNombre}
                      noOptionsText="No hay grupos coincidentes"
                      loadingText="Cargando grupos..."
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Grupo empresarial"
                          placeholder="Buscar empresa o holding"
                          helperText="Este filtro define los entornos disponibles para la sesion."
                        />
                      )}
                    />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Card variant="outlined">
                      <Stack spacing={1.5} p={2}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="subtitle1" fontWeight={700}>
                            Entornos disponibles
                          </Typography>
                          {selectedClient && <Chip label={selectedEnvironment.label} color={selectedEnvironment.color} size="small" />}
                        </Stack>

                        <List disablePadding>
                          {!selectedGroup && <ListItemText primary="Selecciona un grupo para visualizar sus entornos." />}
                          {selectedGroup && groupClients.length === 0 && <ListItemText primary="No hay entornos registrados para este grupo." />}

                          {groupClients.map((client) => {
                            const environment = getEnvironmentMeta(client.entorno);
                            const isSelected = selectedClient?.id === client.id;

                            return (
                              <ListItemButton
                                key={client.id}
                                selected={isSelected}
                                onClick={() => handleClientSelect(client)}
                                alignItems="flex-start"
                              >
                                <ListItemText
                                  primary={client.empresaNombre}
                                  secondary={client.urlRaiz}
                                  primaryTypographyProps={{ fontWeight: 700 }}
                                />
                                <Chip
                                  label={environment.label}
                                  color={environment.color}
                                  size="small"
                                  variant={isSelected ? 'filled' : 'outlined'}
                                />
                              </ListItemButton>
                            );
                          })}
                        </List>
                      </Stack>
                    </Card>
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Card variant="outlined">
                      <Stack spacing={2.5} p={isDesktop ? 3 : 2}>
                        <Typography variant="subtitle1" fontWeight={700}>
                          Configuracion de acceso
                        </Typography>

                        <Stack direction={isDesktop ? 'row' : 'column'} spacing={2} divider={<Divider flexItem orientation={isDesktop ? 'vertical' : 'horizontal'} />}>
                          <Stack direction="row" spacing={1.5} alignItems="center" flex={1}>
                            <ApartmentRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                Empresa
                              </Typography>
                              <Typography variant="body2">
                                {empresaId
                                  ? empresas.find((item) => String(item.IdEmpresa ?? item.Id) === empresaId)?.Nombre ?? 'Seleccionada'
                                  : 'Pendiente'}
                              </Typography>
                            </Box>
                          </Stack>

                          <Stack direction="row" spacing={1.5} alignItems="center" flex={1}>
                            <StoreRoundedIcon color="primary" />
                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                Sucursal
                              </Typography>
                              <Typography variant="body2">
                                {sucursalId
                                  ? sucursales.find((item) => String(item.Id) === sucursalId)?.Nombre ?? 'Seleccionada'
                                  : 'Pendiente'}
                              </Typography>
                            </Box>
                          </Stack>
                        </Stack>

                        <Button variant="contained" startIcon={<BusinessRoundedIcon />} onClick={handleGetEmpresas} disabled={!selectedClient || loading}>
                          {loading && step === 1 ? 'Conectando...' : 'Consultar empresas'}
                        </Button>

                        {step >= 2 && (
                          <TextField
                            select
                            fullWidth
                            label="Empresa"
                            value={empresaId}
                            SelectProps={{ native: true }}
                            onChange={(event) => setEmpresaId(event.target.value)}
                          >
                            <option value="">Selecciona una empresa</option>
                            {empresas.map((empresa) => {
                              const id = empresa.IdEmpresa ?? empresa.Id ?? 0;
                              return <option key={id} value={id}>{empresa.Nombre}</option>;
                            })}
                          </TextField>
                        )}

                        {step === 2 && (
                          <Button variant="outlined" startIcon={<ApartmentRoundedIcon />} onClick={handleGetSucursales} disabled={!empresaId || loading}>
                            {loading ? 'Cargando...' : 'Consultar sucursales'}
                          </Button>
                        )}

                        {step === 3 && (
                          <>
                            <TextField
                              select
                              fullWidth
                              label="Sucursal"
                              value={sucursalId}
                              SelectProps={{ native: true }}
                              onChange={(event) => setSucursalId(event.target.value)}
                            >
                              <option value="">Selecciona una sucursal</option>
                              {sucursales.map((sucursal) => {
                                const environment = getEnvironmentMeta(sucursal.entorno);
                                return <option key={sucursal.Id} value={sucursal.Id}>[{environment.label}] {sucursal.Nombre}</option>;
                              })}
                            </TextField>

                            <Button variant="contained" color="primary" size="large" startIcon={<LoginRoundedIcon />} onClick={handleLogin} disabled={!sucursalId || loading}>
                              {loading ? 'Ingresando...' : 'Entrar al dashboard'}
                            </Button>
                          </>
                        )}
                      </Stack>
                    </Card>
                  </Grid>
                  </Grid>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={3200}
        onClose={() => setSnackbar('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbar('')} severity="success" variant="filled">
          {snackbar}
        </Alert>
      </Snackbar>
    </Box>
  );
}
