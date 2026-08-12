import {
  Alert, Box, Chip, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import { PageSkeleton } from '@/shared/components/Skeletons';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import { T } from '@/shared/theme/launcherTokens';
import PageHeader from '@/shared/layout/PageHeader';
import { useRequisitos } from '@/features/requisitos/hooks/useRequisitos';
import type { FlowRef } from '@/features/requisitos/models/requisitos.model';

const NO_REQ = '(sin requisito)';

function fmt(iso?: string) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; }
}

// Puntito de estado de la última corrida: verde=pasó, rojo=falló, gris=sin ejecutar.
function StatusDot({ flow }: { flow: FlowRef }) {
  const color = flow.lastOk === true ? T.success.text : flow.lastOk === false ? T.error.main : T.text.muted;
  const label = flow.lastOk === true ? `Pasó · ${fmt(flow.lastRunAt)}` : flow.lastOk === false ? `Falló · ${fmt(flow.lastRunAt)}` : 'Sin ejecutar';
  return (
    <Tooltip title={label}>
      <Box sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
    </Tooltip>
  );
}

export default function RequisitosPage() {
  const { rows, totals, loading, error } = useRequisitos();

  const coverageColor = (passing: number, total: number) =>
    total > 0 && passing === total ? T.success.text : passing === 0 ? T.error.text : T.warning.text;

  return (
    <Box sx={{ bgcolor: T.surface.page }}>
      <Box sx={{ p: 3 }}>
        <PageHeader
          title="Trazabilidad a requisitos"
          subtitle="Flujos E2E agrupados por requisito (HU, ticket, Jira…) con el estado de su última corrida."
          icon={<AssignmentTurnedInRoundedIcon />}
        />

      {loading
        ? <PageSkeleton tiles={0} rows={7} />
        : error
        ? <Alert severity="error">{error}</Alert>
        : <>
            {/* Resumen */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: T.border.card }}>
                <Typography variant="h4" fontWeight={800} sx={{ color: T.primary.main }}>{totals.requirements}</Typography>
                <Typography variant="caption" color="text.secondary">Requisitos</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: T.border.card }}>
                <Typography variant="h4" fontWeight={800} sx={{ color: T.text.primary }}>{totals.flows}</Typography>
                <Typography variant="caption" color="text.secondary">Flujos ligados</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: T.border.card }}>
                <Typography variant="h4" fontWeight={800} sx={{ color: T.success.text }}>{totals.fullyCovered}</Typography>
                <Typography variant="caption" color="text.secondary">Requisitos 100% verdes</Typography>
              </Paper>
            </Stack>

            {rows.length === 0 && (
              <Alert severity="info" variant="outlined">
                Aún no hay flujos. Liga tus flujos E2E a un requisito con la acción "Ligar requisito" y aquí verás la cobertura.
              </Alert>
            )}

            <Stack spacing={1.5}>
              {rows.map((r) => {
                const muted = r.requirement === NO_REQ;
                return (
                  <Paper key={r.requirement} variant="outlined"
                    sx={{ p: 2, borderColor: muted ? T.border.card : T.border.card, opacity: muted ? 0.8 : 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Typography fontWeight={800} noWrap
                        sx={{ color: muted ? T.text.muted : T.text.primary, fontStyle: muted ? 'italic' : 'normal' }}>
                        {r.requirement}
                      </Typography>
                      <Box flex={1} />
                      <Chip size="small" label={`${r.passing}/${r.total}`}
                        sx={{ height: 22, fontWeight: 800,
                          bgcolor: r.passing === r.total && r.total > 0 ? T.success.bg : T.warning.bg,
                          color: coverageColor(r.passing, r.total) }} />
                    </Stack>

                    <Stack spacing={0.5}>
                      {r.flows.map((f) => (
                        <Stack key={f.flowId} direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                          <StatusDot flow={f} />
                          <Typography variant="body2" fontWeight={600} noWrap sx={{ color: T.text.primary }}>
                            {f.flowName ?? f.flowId}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {[f.module, f.submodule, f.page].filter(Boolean).join(' › ')}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </>}
      </Box>
    </Box>
  );
}
