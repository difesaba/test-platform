import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import {
  Autocomplete, TextField, Box, Stack, Typography, Tooltip, Skeleton, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
} from '@mui/material';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import EastRoundedIcon from '@mui/icons-material/EastRounded';
import AppsRoundedIcon from '@mui/icons-material/AppsRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import type { Client } from '@/shared/types/platform';
import { T } from '@/shared/theme/launcherTokens';
import { EASE_OUT } from '@/shared/theme/motion';

type TypeKey = 'prueba' | 'replica' | 'produccion';
type Group = { empId: number; empNombre: string };

const TYPE_META: Record<TypeKey, { label: string; text: string; bg: string; border: string }> = {
  prueba:     { label: 'Pruebas',    text: T.primary.main, bg: T.primary.tint, border: T.primary.tintBorder },
  replica:    { label: 'Réplica',    text: T.warning.text, bg: T.warning.bg,   border: T.warning.border },
  produccion: { label: 'Producción', text: T.warning.text, bg: T.warning.bg,   border: T.warning.border },
};


interface Props {
  clients: Client[];
  loadingClients: boolean;
  enteringClientId: number | null;
  onEnter: (client: Client) => void;
}

export default function SessionLauncher({ clients, loadingClients, enteringClientId, onEnter }: Props) {
  const [group, setGroup] = useState<Group | null>(null);
  const [types, setTypes] = useState<Record<TypeKey, boolean>>({ prueba: true, replica: true, produccion: false });
  const [focusIdx, setFocusIdx] = useState(0);
  // Producción bloqueada por defecto; se habilita con confirmación explícita.
  const [prodUnlocked, setProdUnlocked] = useState(false);
  const [prodDialog, setProdDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Defensa en datos: sólo cargamos producción si el usuario la desbloqueó.
  const safeClients = useMemo(
    () => clients.filter((c) => prodUnlocked || c.entorno !== 'produccion'),
    [clients, prodUnlocked],
  );

  const groups = useMemo<Group[]>(() => {
    const map = new Map<number, string>();
    safeClients.forEach((c) => map.set(c.empId, c.empNombre));
    return [...map.entries()].map(([empId, empNombre]) => ({ empId, empNombre }))
      .sort((a, b) => a.empNombre.localeCompare(b.empNombre, 'es', { sensitivity: 'base' }));
  }, [safeClients]);

  const activeTypes = (['prueba', 'replica', 'produccion'] as TypeKey[]).filter((t) => types[t]);

  const results = useMemo(() => {
    if (!group) return [];
    return safeClients
      .filter((c) => c.empId === group.empId && activeTypes.includes(c.entorno as TypeKey))
      .sort((a, b) => a.appName.localeCompare(b.appName, 'es'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeClients, group, types]);

  useEffect(() => { setFocusIdx(0); }, [group, types]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleType = (t: TypeKey) => setTypes((s) => ({ ...s, [t]: !s[t] }));
  const verTodos = () => setTypes({ prueba: true, replica: true, produccion: prodUnlocked });
  const enableProd = () => { setProdUnlocked(true); setTypes((s) => ({ ...s, produccion: true })); setProdDialog(false); };

  const onListKeyDown = (e: ReactKeyboardEvent) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { const c = results[focusIdx]; if (c) onEnter(c); }
  };

  const filtroLabel = activeTypes.map((t) => TYPE_META[t].label).join(' o ');
  const locked = !group; // Paso 2 (tipo + entornos) en espera hasta elegir grupo

  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Box sx={{ background: T.surface.card, border: `1px solid ${T.border.card}`, borderRadius: `${T.radius.card}px`, p: 3 }}>
        <Typography sx={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.2px', color: T.text.primary }}>Iniciar sesión</Typography>
        <Typography sx={{ fontSize: 13, color: T.text.muted, mt: 0.6, lineHeight: 1.55, maxWidth: 620 }}>
          Elige el grupo empresarial y entra directo a su entorno. La sesión se resuelve con la key de login centralizado — sin credenciales por empresa.
        </Typography>

        <Typography variant="overline" sx={{ display: 'block', mt: 2.5, color: T.primary.main, letterSpacing: '.06em' }}>1 · Grupo empresarial</Typography>
        {/* Grupo (autocomplete) */}
        <Box sx={{ mt: 1 }}>
          <Autocomplete<Group>
            options={groups}
            value={group}
            loading={loadingClients}
            onChange={(_e, v) => setGroup(v)}
            openOnFocus
            isOptionEqualToValue={(o, v) => o.empId === v.empId}
            getOptionLabel={(o) => o.empNombre}
            noOptionsText="No hay grupos coincidentes"
            renderInput={(params) => (
              <TextField {...params} inputRef={inputRef} placeholder="Buscar grupo empresarial…"
                label="Grupo empresarial" />
            )}
          />
        </Box>

        <Box component="section" aria-labelledby="paso2-label" aria-disabled={locked}
          sx={{ mt: 2.5, opacity: locked ? 0.55 : 1, filter: locked ? 'saturate(.85)' : 'none', pointerEvents: locked ? 'none' : 'auto', transition: 'opacity .22s ease-out, filter .22s ease-out', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}>
          <Typography variant="overline" id="paso2-label" sx={{ display: 'block', color: locked ? T.text.muted : T.primary.main, letterSpacing: '.06em', transition: 'color .22s ease-out' }}>2 · Entorno</Typography>
        {/* Chips de tipo de entorno */}
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap
          role="group" aria-label="Tipo de entorno" aria-disabled={locked || undefined}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.text.secondary }}>Tipo de entorno:</Typography>
          <TypeChip label={TYPE_META.prueba.label} active={types.prueba} onClick={() => toggleType('prueba')} meta={TYPE_META.prueba} disabled={locked} />
          <TypeChip label={TYPE_META.replica.label} active={types.replica} onClick={() => toggleType('replica')} meta={TYPE_META.replica} disabled={locked} />
          {prodUnlocked ? (
            <TypeChip label={TYPE_META.produccion.label} active={types.produccion} onClick={() => toggleType('produccion')} meta={TYPE_META.produccion} disabled={locked} />
          ) : (
            <Tooltip title="Producción está bloqueada. Púlsala para habilitar el acceso.">
              <Box component="button" type="button" disabled={locked} onClick={() => setProdDialog(true)}
                aria-label="Producción, bloqueado. Activar para habilitar acceso a producción"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, height: 30, px: 1.25, borderRadius: `${T.radius.pill}px`, fontSize: 12.5, fontWeight: 600, color: T.text.disabled, background: T.surface.subtle, border: `1px solid ${T.border.card}`, cursor: 'pointer', userSelect: 'none', fontFamily: 'inherit' }}>
                <LockRoundedIcon sx={{ fontSize: 14 }} /> Producción
              </Box>
            </Tooltip>
          )}
        </Stack>
        {prodUnlocked ? (
          <Typography sx={{ mt: 1, fontSize: 12, color: TYPE_META.produccion.text, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <WarningAmberRoundedIcon sx={{ fontSize: 14 }} /> Producción habilitada — son entornos reales, opera con cuidado.
          </Typography>
        ) : (
          <Typography sx={{ mt: 1, fontSize: 12, color: T.text.muted }}>
            Producción requiere autorización. Pulsa el candado para habilitarla.
          </Typography>
        )}

        {/* Entornos del grupo seleccionado */}
        <Box sx={{ mt: 2.5 }} onKeyDown={onListKeyDown}>
          {loadingClients ? (
            <Stack spacing={1}>{[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={64} />)}</Stack>
          ) : !group ? (
            <EmptyHint icon={<AppsRoundedIcon sx={{ fontSize: 26, color: T.text.muted }} />}
              title="Selecciona un grupo empresarial" desc="Elige un grupo arriba para ver sus entornos disponibles." />
          ) : results.length === 0 ? (
            <EmptyHint icon={<AppsRoundedIcon sx={{ fontSize: 26, color: T.text.muted }} />}
              title="Sin entornos para este filtro"
              desc={`Este grupo no tiene entornos de tipo ${filtroLabel || 'seleccionado'}. Ajusta el tipo o míralos todos.`}
              action={<Button size="small" onClick={verTodos} sx={{ textTransform: 'none' }}>Ver todos</Button>} />
          ) : (
            <>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <SectionLabel text={`Entornos de ${group.empNombre}`} />
                <Typography sx={{ fontSize: 12, color: T.text.muted }}>{results.length}</Typography>
              </Stack>
              <Stack spacing={1}>
                {results.map((c, i) => (
                  <EnvCard key={c.id} client={c} entering={enteringClientId === c.id} focused={i === focusIdx} onEnter={onEnter} onHover={() => setFocusIdx(i)} />
                ))}
              </Stack>
            </>
          )}
        </Box>
        </Box>
      </Box>

      <Typography sx={{ fontSize: 12, color: T.text.muted, px: 0.5 }}>
        <b>⌘/Ctrl + K</b> enfoca el buscador · <b>↑/↓</b> y <b>Enter</b> para elegir el entorno.
      </Typography>

      {/* Confirmación para habilitar Producción */}
      <Dialog open={prodDialog} onClose={() => setProdDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberRoundedIcon sx={{ color: TYPE_META.produccion.text }} /> Habilitar acceso a Producción
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: T.text.secondary, lineHeight: 1.6 }}>
            Los entornos de <b>Producción</b> son reales: cualquier flujo o acción que ejecutes puede afectar datos productivos. Habilítalo sólo si sabes lo que vas a hacer.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setProdDialog(false)} sx={{ color: T.text.secondary, textTransform: 'none' }}>Cancelar</Button>
          <Button variant="contained" color="warning" onClick={enableProd} sx={{ textTransform: 'none' }}>Entiendo, habilitar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function SectionLabel({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0 }}>
      {icon}
      <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: T.text.muted }}>{text}</Typography>
    </Stack>
  );
}

function EmptyHint({ icon, title, desc, action }: { icon: ReactNode; title: string; desc: string; action?: ReactNode }) {
  return (
    <Stack alignItems="center" spacing={0.75} sx={{ py: 5, textAlign: 'center' }} role="status">
      <Box sx={{ width: 52, height: 52, borderRadius: '13px', background: T.surface.subtle, border: `1px solid ${T.border.card}`, display: 'grid', placeItems: 'center', mb: 0.5 }}>{icon}</Box>
      <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.text.primary }}>{title}</Typography>
      <Typography sx={{ fontSize: 12.5, color: T.text.muted, maxWidth: 320, lineHeight: 1.5 }}>{desc}</Typography>
      {action && <Box sx={{ mt: 0.5 }}>{action}</Box>}
    </Stack>
  );
}

function TypeChip({ label, active, onClick, meta, disabled }: { label: string; active: boolean; onClick: () => void; meta: { text: string; bg: string; border: string }; disabled?: boolean }) {
  return (
    <Box onClick={disabled ? undefined : onClick} role="checkbox" aria-checked={active} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      sx={{ display: 'inline-flex', alignItems: 'center', height: 30, px: 1.4, borderRadius: `${T.radius.pill}px`, fontSize: 12.5, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', userSelect: 'none', transition: `background-color 140ms ${EASE_OUT}, border-color 140ms ${EASE_OUT}, color 140ms ${EASE_OUT}`, '@media (prefers-reduced-motion: reduce)': { transition: 'none' }, color: active ? meta.text : T.text.muted, background: active ? meta.bg : T.surface.card, border: `1px solid ${active ? meta.border : T.border.input}` }}>
      {label}
    </Box>
  );
}

function EnvCard({ client, entering, focused, onEnter, onHover }: { client: Client; entering: boolean; focused?: boolean; onEnter: (c: Client) => void; onHover?: () => void }) {
  const meta = TYPE_META[(client.entorno as TypeKey)] ?? TYPE_META.prueba;
  const initials = (client.empresaNombre || client.appName || '?').trim().slice(0, 2).toUpperCase();
  return (
    <Box onClick={() => onEnter(client)} onMouseEnter={onHover}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: '12px', cursor: 'pointer', background: focused ? T.surface.selected : T.surface.card, border: `1px solid ${focused ? T.primary.main : T.border.card}`, boxShadow: focused ? `0 0 0 3px ${T.primary.tint}` : 'none', transition: `border-color 140ms ${EASE_OUT}, background-color 140ms ${EASE_OUT}, box-shadow 140ms ${EASE_OUT}`, '@media (hover: hover)': { '&:hover': { borderColor: T.primary.main }, '&:hover .env-cta': { opacity: 1 } }, '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}>
      <Box sx={{ width: 38, height: 38, flexShrink: 0, borderRadius: '11px', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14, color: '#fff', background: `linear-gradient(135deg, ${T.primary.dark}, ${T.primary.main})` }}>{initials}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
          <Typography noWrap sx={{ fontSize: 14, fontWeight: 700, color: T.text.primary }}>{client.appName}</Typography>
          <Box sx={{ fontSize: 11, fontWeight: 700, px: 0.85, py: '2px', borderRadius: '5px', color: meta.text, background: meta.bg, border: `1px solid ${meta.border}`, flexShrink: 0 }}>{meta.label}</Box>
        </Stack>
        <Typography noWrap sx={{ fontSize: 12.5, color: T.text.muted }}>{client.empresaNombre}</Typography>
      </Box>
      <Box component="button" className="env-cta" onClick={(e) => { e.stopPropagation(); onEnter(client); }} disabled={entering}
        sx={{ height: 34, px: 1.6, borderRadius: `${T.radius.chip}px`, border: 'none', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.6, flexShrink: 0, background: T.primary.main, color: '#fff', cursor: entering ? 'default' : 'pointer', opacity: entering ? 0.7 : (focused ? 1 : 0.55), transition: `opacity 140ms ${EASE_OUT}, background-color 140ms ${EASE_OUT}`, '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}>
        {entering ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <>Ingresar <EastRoundedIcon sx={{ fontSize: 15 }} /></>}
      </Box>
    </Box>
  );
}
