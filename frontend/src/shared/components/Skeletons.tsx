import { Box, Paper, Skeleton, Stack } from '@mui/material';
import { T } from '@/shared/theme/launcherTokens';

// Skeletons de carga (dataviz/emil): muestran la FORMA de lo que viene, en vez
// de un spinner que no dice nada. MuiSkeleton ya está tematizado (surface.subtle).
const panelSx = {
  p: 2.5,
  bgcolor: T.surface.card,
  borderColor: T.border.card,
  borderRadius: `${T.radius.card}px`,
  boxShadow: 'none',
} as const;

export function StatTiles({ count = 3 }: { count?: number }) {
  return (
    <Stack direction="row" flexWrap="wrap" useFlexGap gap={2} sx={{ mb: 3 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Paper key={i} variant="outlined" sx={{ ...panelSx, p: 2, flex: 1, minWidth: 156 }}>
          <Skeleton variant="text" width="55%" height={14} />
          <Skeleton variant="text" width="42%" height={34} />
        </Paper>
      ))}
    </Stack>
  );
}

// Skeleton de filas inline (sin Paper): para listas dentro de tabs/paneles que
// ya tienen su propio contenedor. Reserva el mismo alto que las filas reales.
export function RowsSkeleton({ rows = 5, height = 44 }: { rows?: number; height?: number }) {
  return (
    <Stack spacing={1.25}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} variant="rounded" width="100%" height={height} />
      ))}
    </Stack>
  );
}

export function ListPanel({ rows = 6, titleWidth = 180 }: { rows?: number; titleWidth?: number }) {
  return (
    <Paper variant="outlined" sx={panelSx}>
      <Skeleton variant="text" width={titleWidth} height={22} sx={{ mb: 2 }} />
      <Stack spacing={1.25}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} variant="rounded" width="100%" height={40} />
        ))}
      </Stack>
    </Paper>
  );
}

// Skeleton genérico de página analítica: fila de stat-tiles (opcional) + panel de filas.
export function PageSkeleton({ tiles = 3, rows = 6 }: { tiles?: number; rows?: number }) {
  return (
    <Box>
      {tiles > 0 && <StatTiles count={tiles} />}
      <ListPanel rows={rows} />
    </Box>
  );
}

// Skeleton del dashboard: refleja el layout 2 columnas (analíticas izq + Favoritos der).
export function DashboardSkeleton() {
  return (
    <Box>
      {/* Encabezado de sección + filtros de ventana */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2.5 }}>
        <Skeleton variant="text" width={220} height={26} />
        <Skeleton variant="rounded" width={230} height={30} />
      </Stack>
      <Stack direction={{ xs: 'column', lg: 'row' }} gap={2} alignItems="flex-start">
        {/* Columna izquierda: KPIs + gráfica + dos paneles */}
        <Box sx={{ flex: '1 1 0', minWidth: 0, width: '100%' }}>
          <StatTiles count={5} />
          <Paper variant="outlined" sx={{ ...panelSx, mb: 3 }}>
            <Skeleton variant="text" width={160} height={22} sx={{ mb: 2 }} />
            <Skeleton variant="rounded" width="100%" height={240} />
          </Paper>
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={2}>
            <Paper variant="outlined" sx={{ ...panelSx, flex: 1.4, minWidth: 320 }}>
              <Skeleton variant="text" width={160} height={22} sx={{ mb: 2 }} />
              <Skeleton variant="rounded" width="100%" height={200} />
            </Paper>
            <Paper variant="outlined" sx={{ ...panelSx, flex: 1, minWidth: 280 }}>
              <Skeleton variant="text" width={140} height={22} sx={{ mb: 2 }} />
              <Stack spacing={1}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} variant="rounded" width="100%" height={52} />
                ))}
              </Stack>
            </Paper>
          </Stack>
        </Box>
        {/* Columna derecha: Favoritos (lista) */}
        <Box sx={{ width: { xs: '100%', lg: 320 }, flexShrink: 0 }}>
          <Paper variant="outlined" sx={panelSx}>
            <Skeleton variant="text" width={110} height={22} sx={{ mb: 2 }} />
            <Stack spacing={1.5}>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} variant="rounded" width="100%" height={64} />
              ))}
            </Stack>
          </Paper>
        </Box>
      </Stack>
    </Box>
  );
}
