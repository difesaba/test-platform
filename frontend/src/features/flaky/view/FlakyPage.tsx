import {
  Alert, Box, Chip, LinearProgress, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import { PageSkeleton } from '@/shared/components/Skeletons';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import { T } from '@/shared/theme/launcherTokens';
import PageHeader from '@/shared/layout/PageHeader';
import { useFlaky } from '@/features/flaky/hooks/useFlaky';
import type { FlakyRow } from '@/features/flaky/models/flaky.model';

const TIPO_COLOR: Record<string, { color: string; bg: string }> = {
  e2e: { color: '#A78BFA', bg: '#241C3A' },
  ui: { color: '#38BDF8', bg: '#0C2733' },
  api: { color: '#4ADE80', bg: '#0E2A1E' },
};

function fmt(iso?: string) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; }
}

// Puntitos de las últimas corridas: verde=pasó, rojo=falló. Se muestran del más viejo al más nuevo.
function RunDots({ recent }: { recent: FlakyRow['recent'] }) {
  const ordered = [...recent].reverse();
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {ordered.map((r, i) => (
        <Tooltip key={`${r.runAt}-${i}`} title={`${r.ok ? 'Pasó' : 'Falló'} · ${fmt(r.runAt)}`}>
          <Box sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: r.ok ? T.success.text : T.error.main, flexShrink: 0 }} />
        </Tooltip>
      ))}
    </Stack>
  );
}

export default function FlakyPage() {
  const { rows, totals, loading, error } = useFlaky();

  const stabilityColor = (pct: number, flaky: boolean) =>
    flaky ? T.warning.text : pct === 100 ? T.success.text : pct === 0 ? T.error.text : T.text.muted;

  return (
    <Box sx={{ bgcolor: T.surface.page }}>
      <Box sx={{ p: 3 }}>
        <PageHeader
          title="Estabilidad de pruebas"
          subtitle="Flujos que alternan pass/fail entre corridas (flaky). Ataca primero los de arriba."
          icon={<BoltRoundedIcon />}
        />

      {loading
        ? <PageSkeleton tiles={3} rows={6} />
        : error
        ? <Alert severity="error">{error}</Alert>
        : <>
            {/* Resumen */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: T.border.card }}>
                <Typography variant="h4" fontWeight={800} sx={{ color: T.warning.text }}>{totals.flaky}</Typography>
                <Typography variant="caption" color="text.secondary">Inestables (flaky)</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: T.border.card }}>
                <Typography variant="h4" fontWeight={800} sx={{ color: T.success.text }}>{totals.stable}</Typography>
                <Typography variant="caption" color="text.secondary">Estables (100% verdes)</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: T.border.card }}>
                <Typography variant="h4" fontWeight={800} sx={{ color: T.error.text }}>{totals.failing}</Typography>
                <Typography variant="caption" color="text.secondary">Siempre fallando</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: T.border.card }}>
                <Typography variant="h4" fontWeight={800} sx={{ color: T.text.primary }}>{totals.flows}</Typography>
                <Typography variant="caption" color="text.secondary">Flujos con historial</Typography>
              </Paper>
            </Stack>

            {rows.length === 0 && (
              <Alert severity="info" variant="outlined">
                Aún no hay suficiente historial. Corre tus flujos algunas veces y aquí verás cuáles son inestables.
              </Alert>
            )}

            <Stack spacing={1}>
              {rows.map((r) => (
                <Paper key={`${r.flowId}-${r.empresaNombre}-${r.entorno}`} variant="outlined"
                  sx={{ p: 1.75, borderColor: r.flaky ? T.warning.text : T.border.card, borderLeftWidth: r.flaky ? 4 : 1 }}>
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
                        {r.flaky && (
                          <Chip size="small" icon={<BoltRoundedIcon />} label="Flaky"
                            sx={{ height: 20, bgcolor: T.warning.bg, color: T.warning.text, fontWeight: 700 }} />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {[r.module, r.submodule, r.page].filter(Boolean).join(' › ')}
                        {(r.empresaNombre || r.entorno) && `  ·  ${[r.empresaNombre, r.entorno].filter(Boolean).join(' / ')}`}
                      </Typography>
                    </Box>

                    <Stack spacing={0.5} sx={{ minWidth: 150 }}>
                      <RunDots recent={r.recent} />
                      <Typography variant="caption" color="text.secondary">
                        {r.passed}/{r.total} verdes{r.flaky ? ` · ${r.transitions} cambios` : ''}
                      </Typography>
                    </Stack>

                    <Box sx={{ minWidth: 120 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                        <Typography variant="caption" color="text.secondary">Estabilidad</Typography>
                        <Typography variant="body2" fontWeight={800} sx={{ color: stabilityColor(r.stabilityPct, r.flaky) }}>
                          {r.stabilityPct}%
                        </Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={r.stabilityPct}
                        sx={{ mt: 0.5, height: 6, borderRadius: 3,
                          '& .MuiLinearProgress-bar': { bgcolor: stabilityColor(r.stabilityPct, r.flaky) } }} />
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
