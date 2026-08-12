import { useEffect, useState } from 'react';
import { Box, Stack, Typography, TextField, Button, Snackbar, Alert } from '@mui/material';
import { PageSkeleton } from '@/shared/components/Skeletons';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import { getModules, setModuleSwagger } from '@/features/platform/services/catalog';
import type { ModuleItem } from '@/shared/types/platform';
import { T } from '@/shared/theme/launcherTokens';
import PageHeader from '@/shared/layout/PageHeader';

export default function ConfiguracionPage() {
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' }>({ msg: '', sev: 'success' });

  useEffect(() => {
    getModules()
      .then((res) => {
        if (res.success && res.data) {
          setModules(res.data);
          const map: Record<string, string> = {};
          res.data.forEach((m) => { map[m.name] = m.swaggerUrl ?? ''; });
          setUrls(map);
        } else setSnack({ msg: 'No se pudo cargar la lista de módulos.', sev: 'error' });
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (name: string) => {
    setSavingName(name);
    const res = await setModuleSwagger(name, (urls[name] ?? '').trim());
    if (res.success) setSnack({ msg: `Swagger de ${name} guardado.`, sev: 'success' });
    else setSnack({ msg: 'No fue posible guardar.', sev: 'error' });
    setSavingName(null);
  };

  return (
    <Box minHeight="100%" sx={{ bgcolor: T.surface.page }}>
      <Box sx={{ maxWidth: 820, mx: 'auto', p: { xs: 2, md: 3 } }}>
        <PageHeader title="Configuración" subtitle="Swagger por módulo" />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Define la ruta de Swagger de cada módulo. La pestaña API la usa al explorar endpoints y
          la reapunta al host de la empresa activa (solo cambia el host entre empresas), así que
          puedes poner solo la ruta (ej. <code>/V3/ADPRO/api/swagger/docs/v1</code>) o una URL completa.
        </Typography>

        {loading ? (
          <PageSkeleton tiles={0} rows={6} />
        ) : (
          <Stack spacing={1.5}>
            {modules.map((m) => (
              <Box key={m.name} sx={{ p: 2, borderRadius: `${T.radius.card}px`, border: `1px solid ${T.border.card}`, bgcolor: T.surface.card }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                  <Typography variant="subtitle2" sx={{ minWidth: 96, fontWeight: 700 }}>{m.name}</Typography>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="/V3/ADPRO/api/swagger/docs/v1  ·  o  ·  https://…/swagger/docs/v1"
                    inputProps={{ 'aria-label': `Swagger de ${m.name}` }}
                    value={urls[m.name] ?? ''}
                    onChange={(e) => setUrls((u) => ({ ...u, [m.name]: e.target.value }))}
                  />
                  <Button variant="contained" startIcon={<SaveRoundedIcon />} disabled={savingName === m.name} onClick={() => save(m.name)} sx={{ flexShrink: 0 }}>
                    {savingName === m.name ? 'Guardando…' : 'Guardar'}
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <Snackbar open={!!snack.msg} autoHideDuration={3000} onClose={() => setSnack((s) => ({ ...s, msg: '' }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, msg: '' }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
