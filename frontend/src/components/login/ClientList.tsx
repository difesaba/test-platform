import { Autocomplete, Box, Chip, TextField } from '@mui/material';
import type { Client } from '../../types/platform';
import { getEnvironmentMeta } from '../../utils/platform';

interface ClientListProps {
  clients: Client[];
  selectedClientId: number | null;
  hasGroupSelected: boolean;
  onSelect: (client: Client) => void;
}

export function ClientList({ clients, selectedClientId, hasGroupSelected, onSelect }: ClientListProps) {
  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  return (
    <Autocomplete
      size="small"
      options={clients}
      value={selectedClient}
      disabled={!hasGroupSelected}
      onChange={(_, value) => { if (value) onSelect(value); }}
      getOptionLabel={(c) => c.appName}
      isOptionEqualToValue={(o, v) => o.id === v.id}
      noOptionsText={hasGroupSelected ? 'Sin entornos para este grupo' : 'Selecciona un grupo primero'}
      renderOption={(props, option) => {
        const env = getEnvironmentMeta(option.entorno);
        return (
          <Box component="li" {...props} key={option.id}
            sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
            <Box>
              <Box sx={{ fontWeight: 700, fontSize: '0.875rem' }}>{option.appName}</Box>
              <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{option.empresaNombre}</Box>
            </Box>
            <Chip label={env.label} color={env.color} size="small" variant="outlined" sx={{ flexShrink: 0 }} />
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField {...params} label="Entorno" placeholder="Buscar entorno..." />
      )}
    />
  );
}
