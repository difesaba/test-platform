import { useEffect, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import { T } from '@/shared/theme/launcherTokens';
import { getSuites, createSuite, addFlowToSuite } from '@/features/suites/services/suite';
import type { E2eSuite, SuiteType } from '@/features/suites/models/suite.model';

/** Referencia a una prueba (e2e/ui/api) para agregarla a una suite. */
export interface SuiteTestRef { module: string; submodule?: string; page?: string; id: string; name: string; }

interface Props {
  open: boolean;
  tipo: SuiteType;
  test: SuiteTestRef | null;
  onClose: () => void;
  onNotify: (message: string, severity?: 'success' | 'error' | 'info') => void;
}

const TIPO_LABEL: Record<SuiteType, string> = { e2e: 'E2E', ui: 'UI', api: 'API' };

/**
 * Diálogo reutilizable para agregar una prueba a una suite de su mismo tipo (o crear una nueva).
 * Compartido por los tabs E2E/UI/API — una sola implementación (no duplicar), per los agentes.
 */
export default function AddToSuiteDialog({ open, tipo, test, onClose, onNotify }: Props) {
  const [suites, setSuites] = useState<E2eSuite[]>([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const label = TIPO_LABEL[tipo];

  useEffect(() => {
    if (!open) return;
    setNewName('');
    getSuites(tipo).then((r) => setSuites(r.success && r.data ? r.data : []));
  }, [open, tipo]);

  const dto = () => ({ module: test!.module, submodule: test!.submodule, page: test!.page, flowId: test!.id, name: test!.name });

  const addExisting = async (suiteId: string) => {
    if (!test) return;
    setBusy(true);
    const r = await addFlowToSuite(suiteId, dto());
    setBusy(false);
    if (r.success) { onNotify('Prueba agregada a la suite.', 'success'); onClose(); }
    else onNotify(r.error ?? 'No se pudo agregar a la suite.', 'error');
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name || !test) return;
    setBusy(true);
    const cs = await createSuite({ name, tipo });
    if (!cs.success || !cs.data) { setBusy(false); onNotify(cs.error ?? 'No se pudo crear la suite.', 'error'); return; }
    const r = await addFlowToSuite(cs.data.id, dto());
    setBusy(false);
    if (r.success) { onNotify('Suite creada y prueba agregada.', 'success'); onClose(); }
    else onNotify(r.error ?? 'No se pudo agregar a la suite.', 'error');
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><LayersRoundedIcon color="primary" /> Agregar a suite {label}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Prueba: <b>{test?.name}</b></Typography>
        {suites.length > 0 && (
          <>
            <Typography variant="caption" sx={{ color: T.text.muted, letterSpacing: 1, fontWeight: 700 }}>SUITES {label} EXISTENTES</Typography>
            <Stack sx={{ mt: 0.5, mb: 2, border: `1px solid ${T.border.card}`, borderRadius: 1, maxHeight: 200, overflow: 'auto' }}>
              {suites.map((s) => {
                const ya = s.flows.some((f) => f.flowId === test?.id);
                return (
                  <Stack key={s.id} direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, borderBottom: `1px solid ${T.border.divider}` }}>
                    <Box flex={1} minWidth={0}>
                      <Typography variant="body2" fontWeight={700} noWrap>{s.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{s.flows.length} prueba(s)</Typography>
                    </Box>
                    {ya
                      ? <Chip size="small" label="Ya está" sx={{ height: 22, bgcolor: T.surface.subtle }} />
                      : <Button size="small" variant="outlined" disabled={busy} onClick={() => addExisting(s.id)}>Agregar</Button>}
                  </Stack>
                );
              })}
            </Stack>
          </>
        )}
        <Typography variant="caption" sx={{ color: T.text.muted, letterSpacing: 1, fontWeight: 700 }}>NUEVA SUITE {label}</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
          <TextField size="small" fullWidth placeholder="Nombre de la suite" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button variant="contained" disabled={!newName.trim() || busy} onClick={createAndAdd}>Crear</Button>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>Cerrar</Button></DialogActions>
    </Dialog>
  );
}
