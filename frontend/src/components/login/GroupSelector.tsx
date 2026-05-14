import { Autocomplete, TextField } from '@mui/material';

interface GroupSelectorProps {
  groups: Array<{ empId: number; empNombre: string }>;
  selectedGroup: { empId: number; empNombre: string } | null;
  loading: boolean;
  onChange: (value: { empId: number; empNombre: string } | null) => void;
}

export function GroupSelector({ groups, selectedGroup, loading, onChange }: GroupSelectorProps) {
  return (
    <Autocomplete
      fullWidth
      options={groups}
      loading={loading}
      value={selectedGroup ?? null}
      onChange={(_event, value) => onChange(value ?? null)}
      isOptionEqualToValue={(option, value) => option.empId === value.empId}
      getOptionLabel={(option) => option.empNombre}
      noOptionsText="No hay grupos coincidentes"
      loadingText="Cargando grupos..."
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          label="Grupo empresarial"
          placeholder="Buscar empresa o holding"
          helperText="Este filtro define los entornos disponibles para la sesion."
        />
      )}
    />
  );
}
