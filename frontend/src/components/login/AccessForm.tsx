import { Autocomplete, Box, Button, CircularProgress, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded';
import StoreRoundedIcon from '@mui/icons-material/StoreRounded';
import type { EmpresaOption, SucursalOption } from '../../types/platform';

interface AccessFormProps {
  step: 1 | 2 | 3;
  loading: boolean;
  empresas: EmpresaOption[];
  empresaId: string;
  sucursales: SucursalOption[];
  sucursalId: string;
  selectedEmpresaNombre?: string;
  selectedSucursalNombre?: string;
  onEmpresaChange: (id: string) => void;
  onGetSucursales: (empresaId: string) => void;
  onSucursalChange: (id: string) => void;
  onLogin: () => void;
}

export function AccessForm({
  step,
  loading,
  empresas,
  empresaId,
  sucursales,
  sucursalId,
  selectedEmpresaNombre,
  selectedSucursalNombre,
  onEmpresaChange,
  onGetSucursales,
  onSucursalChange,
  onLogin,
}: AccessFormProps) {
  const selectedEmpresa = empresas.find((item) => String(item.IdEmpresa || item.Id || '') === empresaId) ?? null;
  const selectedSucursal = sucursales.find((item) => String(item.Id) === sucursalId) ?? null;

  return (
    <Paper variant="outlined">
      <Stack spacing={2.5} p={2.5}>
        <Typography variant="subtitle1" fontWeight={700}>
          Configuracion de acceso
        </Typography>

        {step === 1 && (
          <Box display="flex" alignItems="center" gap={1.5} py={1}>
            {loading ? (
              <CircularProgress size={18} />
            ) : null}
            <Typography variant="body2" color="text.secondary">
              {loading ? 'Conectando con el entorno...' : 'Selecciona un entorno para continuar'}
            </Typography>
          </Box>
        )}

        {step >= 2 && (
          <>
            <Autocomplete
              fullWidth
              options={empresas}
              value={selectedEmpresa ?? null}
              onChange={(_event, value) => {
                onEmpresaChange(value ? String(value.IdEmpresa || value.Id || '') : '');
              }}
              isOptionEqualToValue={(option, val) =>
                (option.IdEmpresa || option.Id || 0) === (val.IdEmpresa || val.Id || 0)
              }
              getOptionLabel={(option) => option.Nombre}
              noOptionsText="No hay empresas disponibles"
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  label="Empresa"
                  placeholder="Selecciona una empresa"
                />
              )}
            />
            {step === 2 && (
              <Button
                variant="outlined"
                startIcon={loading ? <CircularProgress size={16} /> : <ApartmentRoundedIcon />}
                onClick={() => onGetSucursales(empresaId)}
                disabled={!empresaId || Number(empresaId) === 0 || loading}
              >
                {loading ? 'Cargando sucursales...' : 'Consultar sucursales'}
              </Button>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <Autocomplete
              fullWidth
              options={sucursales}
              value={selectedSucursal ?? null}
              onChange={(_event, value) => {
                onSucursalChange(value ? String(value.Id) : '');
              }}
              isOptionEqualToValue={(option, value) => option.Id === value.Id}
              getOptionLabel={(option) => option.Nombre}
              noOptionsText="No hay sucursales disponibles"
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  label="Sucursal"
                  placeholder="Selecciona una sucursal"
                />
              )}
            />

            <Button
              variant="contained"
              startIcon={<LoginRoundedIcon />}
              onClick={onLogin}
              disabled={!sucursalId || loading}
            >
              {loading ? 'Ingresando...' : 'Entrar al dashboard'}
            </Button>
          </>
        )}

        <Divider />

        <Stack direction="row" spacing={3} divider={<Divider flexItem orientation="vertical" />}>
          <Stack direction="row" spacing={1.5} alignItems="center" flex={1}>
            <ApartmentRoundedIcon color="primary" fontSize="small" />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Empresa
              </Typography>
              <Typography variant="body2">
                {selectedEmpresaNombre ?? 'Pendiente'}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center" flex={1}>
            <StoreRoundedIcon color="primary" fontSize="small" />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Sucursal
              </Typography>
              <Typography variant="body2">
                {selectedSucursalNombre ?? 'Pendiente'}
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}
