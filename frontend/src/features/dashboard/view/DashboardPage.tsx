import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Paper, Stack, Typography,
} from '@mui/material';
import { DashboardSkeleton } from '@/shared/components/Skeletons';
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import LaunchRoundedIcon from '@mui/icons-material/LaunchRounded';
import { T } from '@/shared/theme/launcherTokens';
import { EASE_OUT, cardHoverSx } from '@/shared/theme/motion';
import PageHeader from '@/shared/layout/PageHeader';
import { useDashboard } from '@/features/dashboard/hooks/useDashboard';
import type { HistoryDay } from '@/features/dashboard/models/dashboard.model';
import { useModuleStore, type SelectedModule } from '@/shared/store/useModuleStore';
import { useSessionStore } from '@/shared/store/useSessionStore';

// Semántica de estado (pasa/falla) — RESERVADAS, nunca usadas como "serie 3".
const PASS = '#22C55E';
const FAIL = '#EF4444';
// Serie de datos neutra (dataviz): índigo primario para línea/área.
const SERIES = T.primary.main;      // #818CF8
// Cromo del gráfico: rejilla tenue un paso sobre la superficie + línea base algo más marcada.
const GRID = T.border.divider;      // #1E293B
const BASELINE = T.border.divider2; // #2B3852
const AXIS = T.text.muted;          // #94A3B8

// Rectángulo con esquinas superiores redondeadas y base cuadrada (data-end de 4px anclado a la línea base).
function topRoundedRect(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} `
    + `L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

// Tooltip oscuro que sigue al puntero. Sin transición (emil): el cursor debe sentirse instantáneo.
function ChartTooltip({ leftPct, children }: { leftPct: number; children: ReactNode }) {
  return (
    <Box
      sx={{
        position: 'absolute', top: 4, left: `${leftPct}%`,
        transform: 'translateX(-50%)', zIndex: 2, pointerEvents: 'none',
        px: 1.25, py: 0.75, minWidth: 132, maxWidth: 200,
        bgcolor: T.surface.popover, border: `1px solid ${T.border.card}`,
        borderRadius: `${T.radius.card}px`, boxShadow: '0 6px 20px rgba(0,0,0,.35)',
      }}
    >
      {children}
    </Box>
  );
}

// Nota honesta cuando hay pocos días con datos: la gráfica no está rota, solo faltan corridas.
function SparseNote({ n }: { n: number }) {
  return (
    <Typography
      variant="caption"
      sx={{ display: 'block', textAlign: 'center', color: T.text.muted, mt: 1 }}
    >
      {n <= 1
        ? 'Aún muy pocas corridas para ver una tendencia — se irá dibujando con más ejecuciones.'
        : 'Pocas corridas en el período; la tendencia se afinará a medida que se acumulen ejecuciones.'}
    </Typography>
  );
}

// Barras apiladas por día (SVG a mano). Verde=pasadas (base), rojo=falladas (arriba).
function DailyStackedBars({ days }: { days: HistoryDay[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (days.every((d) => d.total === 0)) {
    return (
      <Typography variant="body2" sx={{ color: T.text.muted, py: 4, textAlign: 'center' }}>
        Sin ejecuciones registradas en el período.
      </Typography>
    );
  }

  const W = 900, H = 264, padL = 44, padR = 14, padT = 16, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;
  const maxTotal = Math.max(1, ...days.map((d) => d.total));
  const withData = days.filter((d) => d.total > 0).length;
  const n = days.length;
  const slot = plotW / n;
  const barW = Math.min(22, slot * 0.62);
  const labelEvery = Math.ceil(n / 8);
  const gapPx = 2; // hueco de superficie entre segmentos apilados
  const hovered = hover !== null ? days[hover] : null;
  const xForBar = (i: number) => padL + slot * i + slot / 2;

  return (
    <Box sx={{ position: 'relative' }}>
      {hovered && hover !== null && (
        <ChartTooltip leftPct={(xForBar(hover) / W) * 100}>
          <Typography variant="caption" fontWeight={800} sx={{ color: T.text.primary }}>
            {hovered.date}
          </Typography>
          <Typography variant="caption" display="block" sx={{ color: T.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
            Total {hovered.total}
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: PASS }} />
            <Typography variant="caption" sx={{ color: T.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
              Pasadas {hovered.passed}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: FAIL }} />
            <Typography variant="caption" sx={{ color: T.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
              Falladas {hovered.failed}
            </Typography>
          </Stack>
        </ChartTooltip>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}
        role="img"
        aria-label={`Ejecuciones por día (barras apiladas de pasadas y falladas) a lo largo de ${days.length} días.`}
      >
        {/* Rejilla Y + etiquetas */}
        {[0, 0.5, 1].map((ratio) => {
          const y = padT + plotH * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={GRID} strokeWidth={1} />
              <text
                x={padL - 8} y={y + 3.5} textAnchor="end" fill={AXIS} fontSize={11}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {Math.round(maxTotal * ratio)}
              </text>
            </g>
          );
        })}

        {/* Barras por día */}
        {days.map((d, i) => {
          const cx = xForBar(i);
          const x = cx - barW / 2;
          const hp = plotH * (d.passed / maxTotal);
          const hf = plotH * (d.failed / maxTotal);
          const gap = hp > 0 && hf > 0 ? gapPx : 0;
          const showLabel = i % labelEvery === 0;
          const active = hover === i;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* Hit target de ancho completo */}
              <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="transparent" />
              {d.total === 0 && (
                <rect x={x} y={baseY - 2} width={barW} height={2} rx={1} fill={GRID} />
              )}
              {/* Pasadas (base, cuadrada); redondea arriba solo si no hay falladas encima */}
              {hp > 0 && hf === 0 && (
                <path d={topRoundedRect(x, baseY - hp, barW, hp, 4)} fill={PASS} opacity={active ? 1 : 0.92} />
              )}
              {hp > 0 && hf > 0 && (
                <rect x={x} y={baseY - hp} width={barW} height={hp} fill={PASS} opacity={active ? 1 : 0.92} />
              )}
              {/* Falladas (arriba, con hueco de superficie, data-end redondeado) */}
              {hf > 0 && (
                <path d={topRoundedRect(x, baseY - hp - gap - hf, barW, hf, 4)} fill={FAIL} opacity={active ? 1 : 0.92} />
              )}
              {showLabel && (
                <text x={cx} y={H - 9} textAnchor="middle" fill={AXIS} fontSize={11} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}

        {/* Línea base */}
        <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke={BASELINE} strokeWidth={1} />
      </svg>
      {withData < 3 && <SparseNote n={withData} />}
    </Box>
  );
}

// Línea de tasa de éxito por día (SVG a mano). Los días sin corridas rompen la línea (gap).
function PassRateLine({ days }: { days: HistoryDay[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (days.every((d) => d.total === 0)) {
    return (
      <Typography variant="body2" sx={{ color: T.text.muted, py: 4, textAlign: 'center' }}>
        Sin datos en el período.
      </Typography>
    );
  }

  const W = 900, H = 224, padL = 44, padR = 14, padT = 18, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = days.length;
  const baseY = padT + plotH;
  const xFor = (i: number) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yFor = (r: number) => padT + plotH * (1 - r / 100);
  const labelEvery = Math.ceil(n / 8);
  const gradId = 'prAreaFill';

  // Tasa por día: null si no hubo corridas (rompe la línea).
  const rates = days.map((d) => (d.total > 0 ? (d.passed / d.total) * 100 : null));

  // Segmentos: tramos de días CONSECUTIVOS con datos (los null cortan el tramo).
  type Pt = { i: number; x: number; y: number; r: number };
  const segments: Pt[][] = [];
  let cur: Pt[] = [];
  rates.forEach((r, i) => {
    if (r === null) { if (cur.length) { segments.push(cur); cur = []; } }
    else cur.push({ i, x: xFor(i), y: yFor(r), r });
  });
  if (cur.length) segments.push(cur);

  const hovered = hover !== null ? days[hover] : null;
  const hoveredRate = hover !== null ? rates[hover] : null;
  const step = plotW / Math.max(1, n);
  const showDots = n <= 14; // puntos por día solo cuando caben; si no, solo hover + extremo
  const lastPt = segments.length ? segments[segments.length - 1][segments[segments.length - 1].length - 1] : null;

  // Resumen accesible (además de aria-label): tasa más reciente disponible.
  const lastRate = [...rates].reverse().find((r) => r !== null);
  const withData = rates.filter((r) => r !== null).length;

  return (
    <Box sx={{ position: 'relative' }}>
      {hovered && hover !== null && (
        <ChartTooltip leftPct={(xFor(hover) / W) * 100}>
          <Typography variant="caption" fontWeight={800} sx={{ color: T.text.primary }}>
            {hovered.date}
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SERIES }} />
            <Typography variant="caption" sx={{ color: T.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
              {hoveredRate !== null ? `Tasa ${Math.round(hoveredRate * 10) / 10}%` : 'sin corridas'}
            </Typography>
          </Stack>
          <Typography variant="caption" display="block" sx={{ color: T.text.muted, fontVariantNumeric: 'tabular-nums' }}>
            Corridas {hovered.total}
          </Typography>
        </ChartTooltip>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}
        role="img"
        aria-label={`Tendencia de la tasa de éxito por día a lo largo de ${days.length} días.`
          + (lastRate != null ? ` Tasa más reciente ${Math.round(lastRate)}%.` : '')}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity={0.18} />
            <stop offset="100%" stopColor={SERIES} stopOpacity={0.012} />
          </linearGradient>
        </defs>

        {/* Rejilla Y (0/50/100) + etiquetas */}
        {[0, 50, 100].map((v) => {
          const y = yFor(v);
          return (
            <g key={v}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={GRID} strokeWidth={1} />
              <text
                x={padL - 8} y={y + 3.5} textAnchor="end" fill={AXIS} fontSize={11}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {v === 100 ? '100%' : v}
              </text>
            </g>
          );
        })}

        {/* Áreas (wash índigo) + líneas por segmento */}
        {segments.map((seg, si) => {
          if (seg.length === 1) return null;
          const areaD = `M ${seg[0].x} ${seg[0].y} `
            + seg.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ')
            + ` L ${seg[seg.length - 1].x} ${baseY} L ${seg[0].x} ${baseY} Z`;
          return <path key={`a${si}`} d={areaD} fill={`url(#${gradId})`} />;
        })}
        {segments.map((seg, si) => {
          if (seg.length === 1) {
            return <circle key={`d${si}`} cx={seg[0].x} cy={seg[0].y} r={3.5} fill={SERIES} stroke={T.surface.card} strokeWidth={2} />;
          }
          const pts = seg.map((p) => `${p.x},${p.y}`).join(' ');
          return (
            <polyline
              key={`l${si}`} points={pts} fill="none" stroke={SERIES} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round"
            />
          );
        })}

        {/* Puntos de datos sutiles (solo si caben), con anillo de superficie */}
        {showDots && segments.flatMap((seg, si) => (
          seg.length > 1 ? seg.map((p) => (
            <circle key={`p${si}-${p.i}`} cx={p.x} cy={p.y} r={3} fill={SERIES} stroke={T.surface.card} strokeWidth={2} />
          )) : []
        ))}

        {/* Marcador de extremo siempre visible */}
        {lastPt && !showDots && (
          <circle cx={lastPt.x} cy={lastPt.y} r={3.5} fill={SERIES} stroke={T.surface.card} strokeWidth={2} />
        )}

        {/* Línea base */}
        <line x1={padL} y1={baseY} x2={W - padR} y2={baseY} stroke={BASELINE} strokeWidth={1} />

        {/* Etiquetas X */}
        {days.map((d, i) => (
          i % labelEvery === 0 ? (
            <text key={`x${d.date}`} x={xFor(i)} y={H - 9} textAnchor="middle" fill={AXIS} fontSize={11} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {d.date.slice(5)}
            </text>
          ) : null
        ))}

        {/* Crosshair + dot al hacer hover */}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={xFor(hover)} y1={padT} x2={xFor(hover)} y2={baseY} stroke={SERIES} strokeWidth={1} opacity={0.35} />
            {hoveredRate !== null && (
              <circle cx={xFor(hover)} cy={yFor(hoveredRate)} r={4.5} fill={SERIES} stroke={T.surface.card} strokeWidth={2} />
            )}
          </g>
        )}

        {/* Hit targets por día */}
        {days.map((d, i) => (
          <rect
            key={`h${d.date}`} x={xFor(i) - step / 2} y={padT} width={step} height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {withData < 3 && <SparseNote n={withData} />}
    </Box>
  );
}

function LegendSwatch({ color }: { color: string }) {
  return <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: color, flexShrink: 0 }} />;
}

// Tabla equivalente para lectores de pantalla / teclado / táctil: los datos de las
// gráficas (hoy solo visibles al hover) quedan accesibles sin cambiar lo visual.
const srOnly = {
  position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
  overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
} as const;

function SrOnlyDataTable({ days }: { days: HistoryDay[] }) {
  const rows = days.filter((d) => d.total > 0);
  if (!rows.length) return null;
  return (
    <Box component="table" sx={srOnly}>
      <caption>Ejecuciones por día: pasadas, falladas, total y tasa de éxito</caption>
      <thead>
        <tr><th>Fecha</th><th>Pasadas</th><th>Falladas</th><th>Total</th><th>Tasa de éxito</th></tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.date}>
            <td>{d.date}</td>
            <td>{d.passed}</td>
            <td>{d.failed}</td>
            <td>{d.total}</td>
            <td>{Math.round((d.passed / d.total) * 100)}%</td>
          </tr>
        ))}
      </tbody>
    </Box>
  );
}

// Tile KPI (stat-tile dataviz): label apagado en mayúsculas + valor grande tabular. Delta opcional debajo.
function KpiTile({ label, value, color, children }: {
  label: string; value: ReactNode; color: string; children?: ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2, flex: 1, minWidth: 156, bgcolor: T.surface.card,
        borderColor: T.border.card, borderRadius: `${T.radius.card}px`, boxShadow: 'none',
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: T.text.muted, textTransform: 'uppercase', letterSpacing: '.6px', fontWeight: 700, fontSize: 11 }}
      >
        {label}
      </Typography>
      <Typography
        variant="h4" fontWeight={800}
        sx={{ color, mt: 0.5, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Typography>
      {children}
    </Paper>
  );
}

const WINDOWS: { label: string; days: number }[] = [
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
  { label: '90 días', days: 90 },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const { data, loading, error } = useDashboard(days);

  const { setSelected } = useModuleStore();
  const { empNombre, sucursal } = useSessionStore();

  // Fade sutil (~150ms) del bloque de resultados al montar — reemplaza el "pop" duro.
  const [resultsIn, setResultsIn] = useState(false);
  useEffect(() => {
    if (data && !loading && !error) {
      const id = requestAnimationFrame(() => setResultsIn(true));
      return () => cancelAnimationFrame(id);
    }
    setResultsIn(false);
    return undefined;
  }, [data, loading, error]);

  // Mismo key exacto que PlatformPage: los favoritos se comparten entre ambas vistas.
  const favsKey = 'tv_favs::' + (empNombre ?? '') + '::' + (sucursal?.entorno ?? '');
  const [favs, setFavs] = useState<SelectedModule[]>([]);
  useEffect(() => {
    try { setFavs(JSON.parse(localStorage.getItem(favsKey) || '[]')); } catch { setFavs([]); }
  }, [favsKey]);

  const openFav = (fav: SelectedModule) => {
    setSelected(fav);
    navigate('/platform');
  };

  const clickKeys = (fn: () => void) => (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  };

  const totals = data?.totals ?? { runs: 0, passed: 0, failed: 0, passRate: 0 };
  const rateColor = totals.passRate >= 90 ? PASS : totals.passRate >= 70 ? T.warning.text : FAIL;
  const delta = data?.deltaPassRate ?? 0;

  return (
    <Box sx={{ bgcolor: T.surface.page }}>
      <Box sx={{ p: 3, maxWidth: 1280, mx: 'auto' }}>
        <PageHeader
          title="Dashboard histórico"
          subtitle={`Tendencia de ejecuciones E2E (últimos ${days} días)`}
          icon={<QueryStatsRoundedIcon />}
        />

      {loading
        ? <DashboardSkeleton />
        : error
        ? <Alert severity="error">{error}</Alert>
        : <Box
            sx={{
              opacity: resultsIn ? 1 : 0,
              transition: `opacity 150ms ${EASE_OUT}`,
              '@media (prefers-reduced-motion: reduce)': { opacity: 1, transition: 'none' },
            }}
          >
            {/* (a) Encabezado de sección + filtros de ventana */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap sx={{ mb: 2.5 }}>
              <Typography variant="h6" fontWeight={800} sx={{ color: T.text.primary }}>Resumen de ejecuciones E2E</Typography>
              <Stack direction="row" spacing={1}>
                {WINDOWS.map((w) => (
                  <Button
                    key={w.days} size="small" disableElevation
                    variant={days === w.days ? 'contained' : 'outlined'}
                    onClick={() => setDays(w.days)}
                    sx={{ textTransform: 'none', minWidth: 72 }}
                  >
                    {w.label}
                  </Button>
                ))}
              </Stack>
            </Stack>

            {/* Layout 2 columnas: analíticas (izquierda) + Favoritos (derecha) */}
            <Stack direction={{ xs: 'column', lg: 'row' }} gap={2} alignItems="flex-start">
              <Box sx={{ flex: '1 1 0', minWidth: 0, width: '100%' }}>

            {/* (b) KPIs */}
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={2} sx={{ mb: 3 }}>
              <KpiTile label="Tasa de éxito" value={`${totals.passRate}%`} color={rateColor}>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>
                  {delta > 0 ? (
                    <Typography variant="caption" fontWeight={800} sx={{ color: PASS, fontVariantNumeric: 'tabular-nums' }}>▲ {delta}%</Typography>
                  ) : delta < 0 ? (
                    <Typography variant="caption" fontWeight={800} sx={{ color: FAIL, fontVariantNumeric: 'tabular-nums' }}>▼ {Math.abs(delta)}%</Typography>
                  ) : (
                    <Typography variant="caption" fontWeight={700} sx={{ color: T.text.muted }}>= sin cambio</Typography>
                  )}
                  <Typography variant="caption" sx={{ color: T.text.muted }}>vs período anterior</Typography>
                </Stack>
              </KpiTile>
              <KpiTile label="Corridas" value={totals.runs} color={T.text.primary} />
              <KpiTile label="Falladas" value={totals.failed} color={FAIL} />
              <KpiTile label="Flujos flaky" value={data?.flakyCount ?? 0} color={T.warning.text} />
              <KpiTile label="Fallando ahora" value={data?.failingNow ?? 0} color={FAIL} />
            </Stack>

            {/* (c) Ejecuciones por día */}
            <Paper variant="outlined" sx={{ p: 2.5, mb: 3, bgcolor: T.surface.card, borderColor: T.border.card, borderRadius: `${T.radius.card}px`, boxShadow: 'none' }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                <Typography fontWeight={700} sx={{ color: T.text.primary }}>Ejecuciones por día</Typography>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <LegendSwatch color={PASS} />
                    <Typography variant="caption" sx={{ color: T.text.secondary }}>Pasadas</Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <LegendSwatch color={FAIL} />
                    <Typography variant="caption" sx={{ color: T.text.secondary }}>Falladas</Typography>
                  </Stack>
                </Stack>
              </Stack>
              <DailyStackedBars days={data?.days ?? []} />
              <SrOnlyDataTable days={data?.days ?? []} />
            </Paper>

            {/* (d) Dos columnas: tasa de éxito por día + flujos fallando ahora */}
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={2} sx={{ mb: 3 }}>
              <Paper variant="outlined" sx={{ p: 2.5, flex: 1.4, minWidth: 320, bgcolor: T.surface.card, borderColor: T.border.card, borderRadius: `${T.radius.card}px`, boxShadow: 'none' }}>
                <Typography fontWeight={700} sx={{ color: T.text.primary, mb: 2 }}>Tasa de éxito por día</Typography>
                <PassRateLine days={data?.days ?? []} />
              </Paper>

              <Paper variant="outlined" sx={{ p: 2.5, flex: 1, minWidth: 280, bgcolor: T.surface.card, borderColor: T.border.card, borderRadius: `${T.radius.card}px`, boxShadow: 'none' }}>
                <Typography fontWeight={700} sx={{ color: T.text.primary, mb: 2 }}>Flujos fallando ahora</Typography>
                {(!data || data.topFailing.length === 0) ? (
                  <Typography variant="body2" sx={{ color: T.text.muted, py: 3, textAlign: 'center' }}>
                    Sin fallos activos 🎉
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {data.topFailing.map((f, i) => (
                      <Box
                        key={`${f.module}-${f.page}-${i}`}
                        sx={{
                          borderLeft: `3px solid ${FAIL}`, bgcolor: T.surface.subtle,
                          borderRadius: '6px', px: 1.5, py: 1,
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography fontWeight={700} noWrap sx={{ color: T.text.primary, flex: 1, minWidth: 0 }}>
                            {f.flowName ?? f.module}
                          </Typography>
                          <Chip
                            size="small" label={`×${f.consecutiveFails}`}
                            sx={{ height: 20, bgcolor: T.error.bg, color: FAIL, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
                          />
                        </Stack>
                        <Typography variant="caption" display="block" noWrap sx={{ color: T.text.muted }}>
                          {[f.module, f.submodule, f.page].filter(Boolean).join(' › ')}
                        </Typography>
                        {(f.empresaNombre || f.entorno) && (
                          <Typography variant="caption" display="block" noWrap sx={{ color: T.text.muted }}>
                            {[f.empresaNombre, f.entorno].filter(Boolean).join(' / ')}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Stack>
              </Box>{/* fin columna izquierda */}

              <Box sx={{ width: { xs: '100%', lg: 320 }, flexShrink: 0, position: { lg: 'sticky' }, top: { lg: 0 } }}>
            {/* (e) Favoritos — acceso rápido a páginas marcadas desde la plataforma */}
            <Paper variant="outlined" sx={{ p: 2.5, bgcolor: T.surface.card, borderColor: T.border.card, borderRadius: `${T.radius.card}px`, boxShadow: 'none' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: favs.length > 0 ? 2 : 1.5 }}>
                <StarRoundedIcon sx={{ color: T.warning.text }} />
                <Typography fontWeight={800} sx={{ color: T.text.primary }}>Favoritos</Typography>
              </Stack>
              {favs.length > 0 ? (
                <Stack spacing={1.5}>
                  {favs.map((fav) => (
                    <Box
                      key={[fav.moduleName, ...(fav.submodulePath ?? []), fav.pageName].join('/')}
                      role="button"
                      tabIndex={0}
                      onClick={() => openFav(fav)}
                      onKeyDown={clickKeys(() => openFav(fav))}
                      sx={{
                        width: '100%', p: 2,
                        borderRadius: T.radius.card + 'px', border: '1px solid ' + T.border.card,
                        bgcolor: T.surface.card, cursor: 'pointer',
                        '&:focus-visible': { outline: '2px solid', outlineColor: T.primary.main, outlineOffset: 2 },
                        ...cardHoverSx,
                      }}
                    >
                      <Stack direction="row" alignItems="flex-start" spacing={1}>
                        <StarRoundedIcon sx={{ color: T.warning.text, fontSize: 18, mt: '2px', flexShrink: 0 }} />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}>
                            {[fav.moduleName, ...(fav.submodulePath ?? (fav.submoduleName ? [fav.submoduleName] : []))].join(' › ')}
                          </Typography>
                          <Typography variant="body2" noWrap sx={{ fontWeight: 700, color: 'text.primary' }}>
                            {fav.pageName}
                          </Typography>
                        </Box>
                        <LaunchRoundedIcon sx={{ color: T.text.muted, fontSize: 16, mt: '2px', flexShrink: 0 }} />
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Stack spacing={1.5} alignItems="flex-start">
                  <Typography variant="body2" sx={{ color: T.text.muted }}>
                    Marca páginas como favoritas con la ⭐ desde la plataforma para tenerlas aquí a la mano.
                  </Typography>
                  <Button
                    size="small" variant="outlined" disableElevation
                    onClick={() => navigate('/platform')}
                    sx={{ textTransform: 'none' }}
                  >
                    Ir a la plataforma
                  </Button>
                </Stack>
              )}
            </Paper>
              </Box>{/* fin columna derecha */}
            </Stack>
          </Box>}
      </Box>
    </Box>
  );
}
