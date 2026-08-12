import {
  Alert, Box, Chip, Paper, Stack, Typography,
} from '@mui/material';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import { T } from '@/shared/theme/launcherTokens';
import PageHeader from '@/shared/layout/PageHeader';
import { PageSkeleton } from '@/shared/components/Skeletons';
import { useAlertas } from '@/features/alertas/hooks/useAlertas';

const TIPO_COLOR: Record<string, { color: string; bg: string }> = {
  e2e: { color: '#A78BFA', bg: '#241C3A' },
  ui: { color: '#38BDF8', bg: '#0C2733' },
  api: { color: '#4ADE80', bg: '#0E2A1E' },
};

function fmt(iso?: string) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; }
}

export default function AlertasPage() {
  const { rows, totals, loading, error } = useAlertas();

  return (
    <Box sx={{ bgcolor: T.surface.page }}>
      <Box sx={{ p: 3 }}>
        <PageHeader
          title="Alertas de fallos"
          subtitle="Flujos cuya última corrida falló. Ataca primero los de arriba (racha más larga)."
          icon={<NotificationsActiveRoundedIcon />}
        />

      {loading
        ? <PageSkeleton tiles={1} rows={6} />
        : error
        ? <Alert severity="error">{error}</Alert>
        : <>
            {/* Resumen */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: T.border.card }}>
                <Typography variant="h4" fontWeight={800} sx={{ color: T.error.text }}>{totals.alerts}</Typography>
                <Typography variant="caption" color="text.secondary">Flujos fallando ahora</Typography>
              </Paper>
            </Stack>

            {rows.length === 0 && (
              <Alert severity="success" variant="outlined">
                Sin fallos activos 🎉
              </Alert>
            )}

            <Stack spacing={1}>
              {rows.map((r) => (
                <Paper key={`${r.flowId}-${r.empresaNombre}-${r.entorno}`} variant="outlined"
                  sx={{ p: 1.75, borderColor: T.error.main, borderLeftWidth: 4 }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
                    <Box flex={1} minWidth={0}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography fontWeight={700} noWrap sx={{ color: T.text.primary }}>
                          {r.flowName ?? r.flowId}
                        </Typography>
                        {r.tipo && (
                          <Chip size="small" label={r.tipo.toUpperCase()}
                            sx={{ height: 18, bgcolor: TIPO_COLOR[r.tipo]?.bg, color: TIPO_COLOR[r.tipo]?.color, fontWeight: 700 }} />
                        )}
                        <Chip size="small" icon={<NotificationsActiveRoundedIcon />}
                          label={`Falla hace ${r.consecutiveFails} corrida(s)`}
                          sx={{ height: 20, bgcolor: T.error.bg, color: T.error.text, fontWeight: 700 }} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {[r.module, r.submodule, r.page].filter(Boolean).join(' › ')}
                        {(r.empresaNombre || r.entorno) && `  ·  ${[r.empresaNombre, r.entorno].filter(Boolean).join(' / ')}`}
                      </Typography>
                      {r.error && (
                        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontFamily: '"JetBrains Mono", ui-monospace, monospace', color: T.text.muted }} noWrap>
                          {r.error}
                        </Typography>
                      )}
                    </Box>

                    <Box sx={{ minWidth: 150, textAlign: { md: 'right' } }}>
                      <Typography variant="caption" color="text.secondary">Última corrida</Typography>
                      <Typography variant="body2" fontWeight={700} sx={{ color: T.text.primary }}>
                        {fmt(r.runAt)}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </>}
      </Box>
    </Box>
  );
}
