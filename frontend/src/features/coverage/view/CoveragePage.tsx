import { useState } from 'react';
import {
  Alert, Box, Chip, Collapse, LinearProgress, Paper, Stack, Typography,
} from '@mui/material';
import { PageSkeleton } from '@/shared/components/Skeletons';
import DonutLargeRoundedIcon from '@mui/icons-material/DonutLargeRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import { T } from '@/shared/theme/launcherTokens';
import { rowHoverSx, disclosureSpinSx } from '@/shared/theme/motion';
import PageHeader from '@/shared/layout/PageHeader';
import { useCoverage } from '@/features/coverage/hooks/useCoverage';

// Metadatos de los tres tipos de prueba para los chips de desglose.
const TYPE_META = [
  { key: 'e2e', label: 'E2E', color: '#A78BFA', bg: '#241C3A' },
  { key: 'ui', label: 'UI', color: '#38BDF8', bg: '#0C2733' },
  { key: 'api', label: 'API', color: '#4ADE80', bg: '#0E2A1E' },
] as const;

/**
 * Vista del Mapa de cobertura: solo composición y render. La carga y el cruce con el catálogo
 * viven en useCoverage (integrator agent: la página consume un hook, no los servicios).
 */
export default function CoveragePage() {
  const { perModule, totals, loading, error } = useCoverage();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Box sx={{ bgcolor: T.surface.page }}>
      <Box sx={{ p: 3 }}>
        <PageHeader
          title="Mapa de cobertura"
          subtitle="Qué páginas tienen pruebas E2E, UI o API y dónde están los huecos."
          icon={<DonutLargeRoundedIcon />}
        />

      {loading
        ? <PageSkeleton tiles={4} rows={5} />
        : error
        ? <Alert severity="error">{error}</Alert>
        : <>
            {/* Resumen */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: T.border.card }}>
                <Typography variant="h4" fontWeight={800} sx={{ color: T.primary.main }}>{totals.pct}%</Typography>
                <Typography variant="caption" color="text.secondary">Cobertura (cualquier tipo)</Typography>
                <LinearProgress variant="determinate" value={totals.pct} sx={{ mt: 1, height: 8, borderRadius: 4 }} />
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: T.border.card }}>
                <Typography variant="h4" fontWeight={800} sx={{ color: T.success.text }}>{totals.covered}</Typography>
                <Typography variant="caption" color="text.secondary">Páginas con pruebas</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: T.border.card }}>
                <Typography variant="h4" fontWeight={800} sx={{ color: T.text.primary }}>{totals.total - totals.covered}</Typography>
                <Typography variant="caption" color="text.secondary">Páginas sin cubrir (de {totals.total})</Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, flex: 1, borderColor: T.border.card }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>Pruebas por tipo</Typography>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  {TYPE_META.map((t) => (
                    <Chip key={t.key} size="small"
                      label={`${t.label} ${totals[t.key]}`}
                      sx={{ bgcolor: t.bg, color: t.color, fontWeight: 700 }} />
                  ))}
                </Stack>
              </Paper>
            </Stack>

            {/* Por módulo */}
            <Stack spacing={1.5}>
              {perModule.map((m) => {
                const pct = m.total ? Math.round((m.covered / m.total) * 100) : 0;
                const isOpen = open === m.name;
                return (
                  <Paper key={m.name} variant="outlined" sx={{ borderColor: T.border.card, overflow: 'hidden' }}>
                    <Box role="button" tabIndex={0}
                      onClick={() => setOpen(isOpen ? null : m.name)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : m.name); } }}
                      sx={{ px: 2, py: 1.5, cursor: 'pointer', ...rowHoverSx, '&:focus-visible': { outline: '2px solid', outlineColor: T.primary.main, outlineOffset: '-2px' } }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <KeyboardArrowRightRoundedIcon fontSize="small" sx={{ color: T.text.muted, ...disclosureSpinSx(isOpen) }} />
                        <Typography variant="body1" fontWeight={800} sx={{ flex: 1, color: T.text.primary }}>{m.name}</Typography>
                        <Chip size="small" label={`${m.covered}/${m.total}`} sx={{ bgcolor: m.covered > 0 ? T.success.bg : T.surface.subtle, color: m.covered > 0 ? T.success.text : T.text.muted, fontWeight: 700 }} />
                        <Typography variant="body2" fontWeight={700} sx={{ minWidth: 44, textAlign: 'right', color: pct >= 50 ? T.success.text : pct > 0 ? T.warning.text : T.text.muted }}>{pct}%</Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={pct} sx={{ mt: 1, height: 6, borderRadius: 3 }} />
                    </Box>
                    <Collapse in={isOpen} unmountOnExit>
                      <Box sx={{ borderTop: `1px solid ${T.border.divider}`, maxHeight: 360, overflow: 'auto' }}>
                        {m.rows.length === 0
                          ? <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Este módulo no tiene páginas.</Typography>
                          : m.rows.map((p) => (
                            <Stack key={`${p.chain}/${p.page}`} direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 0.9, borderBottom: `1px solid ${T.border.divider}` }}>
                              {p.count > 0
                                ? <CheckCircleRoundedIcon sx={{ fontSize: 17, color: T.success.text }} />
                                : <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 17, color: T.text.disabled }} />}
                              <Box flex={1} minWidth={0}>
                                <Typography variant="body2" noWrap sx={{ color: p.count > 0 ? T.text.primary : T.text.secondary, fontWeight: p.count > 0 ? 700 : 400 }}>{p.page}</Typography>
                                <Typography variant="caption" color="text.secondary" noWrap>{p.chain}</Typography>
                              </Box>
                              {p.count > 0 && (
                                <Stack direction="row" spacing={0.5}>
                                  {TYPE_META.filter((t) => p[t.key] > 0).map((t) => (
                                    <Chip key={t.key} size="small"
                                      label={`${t.label} ${p[t.key]}`}
                                      sx={{ height: 20, bgcolor: t.bg, color: t.color, fontWeight: 700, '& .MuiChip-label': { px: 0.75 } }} />
                                  ))}
                                </Stack>
                              )}
                            </Stack>
                          ))}
                      </Box>
                    </Collapse>
                  </Paper>
                );
              })}
            </Stack>
          </>}
      </Box>
    </Box>
  );
}
