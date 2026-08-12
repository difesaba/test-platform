import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Stack, Typography, Chip, FormControlLabel, Switch } from '@mui/material';
import CircleRoundedIcon from '@mui/icons-material/CircleRounded';
import { useSessionStore } from '@/shared/store/useSessionStore';
import { T } from '@/shared/theme/launcherTokens';
import PageHeader from '@/shared/layout/PageHeader';

type ChipColor = 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info';

interface AuditEvent {
  id: string;
  ts: string;
  type: 'structural' | 'execution';
  action: string;
  target: string;
  empresaNombre?: string;
  entorno?: string;
  urlRaiz?: string;
  meta?: { passed?: number; failed?: number; ok?: boolean };
}

const actionColor = (a: string): ChipColor => {
  if (a === 'crear') return 'success';
  if (a === 'eliminar') return 'error';
  if (a === 'ejecutar') return 'primary';
  if (a === 'renombrar' || a === 'editar' || a === 'configurar') return 'info';
  return 'default';
};
const entColor = (e?: string): ChipColor => {
  if (e === 'produccion') return 'error';
  if (e === 'replica') return 'warning';
  if (e === 'prueba') return 'info';
  return 'default';
};
const entLabel = (e?: string) =>
  e === 'produccion' ? 'Producción' : e === 'replica' ? 'Réplica' : e === 'prueba' ? 'Pruebas' : (e ?? '—');
const fmt = (ts: string) => {
  try { return new Date(ts).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ts; }
};

export default function AuditoriaPage() {
  const { empresa, sucursal } = useSessionStore();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    const es = new EventSource('/api/audit/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data) as AuditEvent;
        if (!e?.id || seen.current.has(e.id)) return;
        seen.current.add(e.id);
        setEvents((cur) => [e, ...cur].slice(0, 500));
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  const myEnt = sucursal?.entorno;
  const myEmp = empresa?.nombre;
  const shown = useMemo(() => (
    onlyMine ? events.filter((e) => e.type === 'execution' || (e.empresaNombre === myEmp && e.entorno === myEnt)) : events
  ), [events, onlyMine, myEmp, myEnt]);

  return (
    <Box minHeight="100%" sx={{ bgcolor: T.surface.page }}>
      <Box sx={{ maxWidth: 980, mx: 'auto', p: { xs: 2, md: 3 } }}>
        <PageHeader
          title="Auditoría"
          actions={
            <Stack direction="row" alignItems="center" spacing={1}>
              <Chip size="small" aria-live="polite" label={connected ? 'En vivo' : 'Desconectado'} color={connected ? 'success' : 'default'} variant={connected ? 'filled' : 'outlined'} />
              <FormControlLabel control={<Switch size="small" checked={onlyMine} onChange={(_e, v) => setOnlyMine(v)} />} label={<Typography variant="body2">Solo mi contexto</Typography>} />
            </Stack>
          }
        />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Registro en vivo de cambios y ejecuciones. Los cambios de estructura (módulos, páginas, submódulos) son globales y se ven siempre, etiquetados con el entorno donde se hicieron. Las ejecuciones se filtran a tu empresa y entorno.
        </Typography>

        {shown.length === 0 ? (
          <Typography variant="body2" sx={{ color: T.text.muted, py: 6, textAlign: 'center' }}>
            Sin eventos todavía. Aparecerán aquí en cuanto ocurran.
          </Typography>
        ) : (
          <Stack spacing={0.75} aria-live="polite" aria-relevant="additions">
            {shown.map((e) => (
              <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, borderRadius: `${T.radius.card}px`, border: `1px solid ${T.border.card}`, bgcolor: T.surface.card }}>
                <CircleRoundedIcon sx={{ fontSize: 9, color: e.type === 'execution' ? T.primary.main : T.text.muted }} />
                <Typography variant="caption" sx={{ color: T.text.muted, fontVariantNumeric: 'tabular-nums', minWidth: 132 }}>{fmt(e.ts)}</Typography>
                <Chip size="small" label={e.action} color={actionColor(e.action)} sx={{ textTransform: 'capitalize', minWidth: 84 }} />
                <Typography variant="body2" noWrap title={e.target} sx={{ flex: 1, minWidth: 0, color: T.text.primary }}>{e.target}</Typography>
                {e.type === 'execution' && e.meta && (
                  <Chip size="small" variant="outlined" color={e.meta.ok ? 'success' : 'error'} label={e.meta.ok ? 'Pasó' : 'Falló'} />
                )}
                {(e.empresaNombre || e.entorno) && (
                  <Chip size="small" variant="outlined" color={entColor(e.entorno)} label={[e.empresaNombre, entLabel(e.entorno)].filter(Boolean).join(' · ')} sx={{ maxWidth: 300 }} />
                )}
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
