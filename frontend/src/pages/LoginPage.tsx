import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Paper, Snackbar, Stack, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import api from '../api/client';
import { useSessionStore } from '../store/useSessionStore';
import type { Client, EmpresaOption, SucursalOption } from '../types/platform';
import { ENVIRONMENT_ORDER } from '../utils/platform';
import { LoginSidebar } from '../components/login/LoginSidebar';
import { LoginStepper } from '../components/login/LoginStepper';
import { GroupSelector } from '../components/login/GroupSelector';
import { ClientList } from '../components/login/ClientList';
import { AccessForm } from '../components/login/AccessForm';

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

    api.get('/clients/sinco')
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

    const clients = allClients
      .filter((client) => client.empId === selectedGroup.empId)
      .sort((left, right) => (
        ENVIRONMENT_ORDER.indexOf(left.entorno) - ENVIRONMENT_ORDER.indexOf(right.entorno)
        || left.empresaNombre.localeCompare(right.empresaNombre, 'es')
      ));

    console.log('[Grupo]', selectedGroup.empNombre, '| empId:', selectedGroup.empId);
    console.table(clients.map(c => ({ id: c.id, empId: c.empId, entorno: c.entorno, empresaNombre: c.empresaNombre, appName: c.appName })));

    return clients;
  }, [allClients, selectedGroup]);

  const resetAuth = () => {
    setEmpresas([]);
    setEmpresaId('');
    setSucursales([]);
    setSucursalId('');
    setStep(1);
  };

  const handleGroupChange = (value: { empId: number; empNombre: string } | null) => {
    setSelectedGroup(value);
    setSelectedClient(null);
    resetAuth();
  };

  const handleGetEmpresas = async (client?: Client) => {
    const target = client ?? selectedClient;
    if (!target) return;

    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/empresas', { urlIngresar: target.loginUrl });
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

  const handleGetSucursales = async (resolvedEmpresaId?: string) => {
    const target = selectedClient;
    if (!target) return;

    const idToUse = resolvedEmpresaId ?? empresaId;
    if (!idToUse) return;

    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/sucursales', {
        urlRaiz: target.urlRaiz,
        clienteId: 1,
        empresaId: Number(idToUse),
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
      const selectedEmpresa = empresas.find((item) => String(item.IdEmpresa || item.Id || '') === empresaId);
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
        empNombre: selectedGroup?.empNombre ?? '',
        entornoNombre: (selectedClient as any)?.appName ?? '',
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

  const handleClientSelect = (client: Client) => {
    setSelectedClient(client);
    resetAuth();
    handleGetEmpresas(client);
  };


  const handleEmpresaChange = (id: string) => {
    setEmpresaId(id);
    setSucursales([]);
    setSucursalId('');
    setStep(2);
  };

  const selectedEmpresa = empresas.find((item) => String(item.IdEmpresa || item.Id || '') === empresaId);
  const selectedSucursal = sucursales.find((item) => String(item.Id) === sucursalId);

  const activeStep = (() => {
    if (!selectedGroup) return 0;
    if (!selectedClient) return 1;
    if (sucursalId) return 3;
    if (empresaId) return 2;
    return 2;
  })();

  return (
    <Box minHeight="100vh" px={isDesktop ? 4 : 2} py={isDesktop ? 5 : 3}>
      <Box maxWidth={1360} mx="auto">
        <Stack direction={isDesktop ? 'row' : 'column'} spacing={3} alignItems="stretch">
          {isDesktop && (
            <Box width={320} flexShrink={0}>
              <LoginSidebar
                groupCount={allGroups.length}
                clientCount={allClients.length}
                selectedEntorno={selectedClient?.entorno}
              />
            </Box>
          )}

          <Box flex={1} minWidth={0}>
            <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, height: '100%' }}>
              <Stack spacing={3}>
                <Box>
                  <Typography variant="h4">Iniciar sesion</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Selecciona el contexto de trabajo para ingresar al dashboard operativo.
                  </Typography>
                </Box>

                <LoginStepper activeStep={activeStep} />

                {error && <Alert severity="error">{error}</Alert>}

                <GroupSelector
                  groups={allGroups}
                  selectedGroup={selectedGroup}
                  loading={loadingClients}
                  onChange={handleGroupChange}
                />

                <ClientList
                  clients={groupClients}
                  selectedClientId={selectedClient?.id ?? null}
                  hasGroupSelected={Boolean(selectedGroup)}
                  onSelect={handleClientSelect}
                />

                <AccessForm
                  step={step}
                  loading={loading}
                  empresas={empresas}
                  empresaId={empresaId}
                  sucursales={sucursales}
                  sucursalId={sucursalId}
                  selectedEmpresaNombre={selectedEmpresa?.Nombre}
                  selectedSucursalNombre={selectedSucursal?.Nombre}
                  onEmpresaChange={handleEmpresaChange}
                  onGetSucursales={(id) => handleGetSucursales(id)}
                  onSucursalChange={setSucursalId}
                  onLogin={handleLogin}
                />
              </Stack>
            </Paper>
          </Box>
        </Stack>
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
