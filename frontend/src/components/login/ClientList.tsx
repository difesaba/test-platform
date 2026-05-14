import { Chip, List, ListItemButton, ListItemText, Paper, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { Client } from '../../types/platform';
import { getEnvironmentMeta } from '../../utils/platform';

interface ClientListProps {
  clients: Client[];
  selectedClientId: number | null;
  hasGroupSelected: boolean;
  onSelect: (client: Client) => void;
}

export function ClientList({ clients, selectedClientId, hasGroupSelected, onSelect }: ClientListProps) {
  const theme = useTheme();

  return (
    <Paper
      variant="outlined"
      sx={{ maxHeight: 200, overflowY: 'auto' }}
    >
      <List disablePadding>
        {!hasGroupSelected && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            Selecciona un grupo para visualizar sus entornos.
          </Typography>
        )}

        {hasGroupSelected && clients.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No hay entornos registrados para este grupo.
          </Typography>
        )}

        {clients.map((client) => {
          const environment = getEnvironmentMeta(client.entorno);
          const isSelected = selectedClientId === client.id;

          return (
            <ListItemButton
              key={client.id}
              selected={isSelected}
              onClick={() => onSelect(client)}
              alignItems="flex-start"
              sx={isSelected ? { bgcolor: `${theme.palette.primary.main}14` } : undefined}
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
    </Paper>
  );
}
