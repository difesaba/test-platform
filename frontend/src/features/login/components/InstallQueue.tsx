import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Box, Stack, Typography, InputBase } from '@mui/material';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import DoneRoundedIcon from '@mui/icons-material/DoneRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';
import BusinessRoundedIcon from '@mui/icons-material/BusinessRounded';
import api from '@/shared/api/client';
import { T, STATE_META, type StateKey } from '@/shared/theme/launcherTokens';
import { rowHoverSx, disclosureSpinSx } from '@/shared/theme/motion';
import { RowsSkeleton } from '@/shared/components/Skeletons';

interface AddonRequest {
  id: number;
  addonNumber: number | null;
  grupo: string;
  asunto: string;
  empresa: string;
  sucursal: string;
  responsable: string;
  fecha: string;
  fechaVencimiento: string;
  estado: number;
  loginUrl: string | null;
  urlRaiz: string | null;
}

type Tab = 'pending' | 'error' | 'recorded';

const fmtDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

const pill = (bg: string, color: string) => ({
  fontSize: 11, fontWeight: 700, borderRadius: `${T.radius.pill}px`, px: 1, py: '2px',
  background: bg, color, lineHeight: 1.6, whiteSpace: 'nowrap' as const,
});

export default function InstallQueue() {
  const [addons, setAddons] = useState<AddonRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasRecording, setHasRecording] = useState(false);

  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('pending');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState(true);
  const [states, setStates] = useState<Record<number, StateKey>>({});
  const [errMsgs, setErrMsgs] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.get('/addons')
      .then(({ data }) => setAddons(data as AddonRequest[]))
      .catch((e: any) => setErrorMsg(e?.response?.data?.error ?? e?.message ?? 'Error'))
      .finally(() => setLoading(false));
    api.get('/addons/recording-status').then(({ data }) => setHasRecording(Boolean(data?.hasRecording))).catch(() => {});
  }, []);

  const effState = (a: AddonRequest): StateKey => states[a.id] ?? (a.estado === 3 ? 'installed' : 'pending');
  const setBusyId = (id: number, on: boolean) =>
    setBusy((b) => { const n = new Set(b); on ? n.add(id) : n.delete(id); return n; });

  const counts = useMemo(() => {
    const c = { pending: 0, error: 0, recorded: 0 };
    addons.forEach((a) => { const s = effState(a); if (s !== 'installed') (c as any)[s]++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addons, states]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const visible = addons.filter((a) => {
      const s = effState(a);
      if (s === 'installed') return false;
      if (s !== tab) return false;
      if (needle) {
        const hay = `${a.asunto} ${a.empresa} ${a.grupo} ${a.responsable} ${a.addonNumber ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const byCo: Record<string, AddonRequest[]> = {};
    visible.forEach((a) => { (byCo[a.empresa || 'Sin empresa'] ||= []).push(a); });
    return Object.entries(byCo).map(([name, items]) => ({
      name,
      grupo: items[0].grupo,
      items,
      count: items.length,
      errors: items.filter((i) => effState(i) === 'error').length,
      isOpen: open[name] !== false,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addons, q, tab, states, open]);

  const install = async (a: AddonRequest) => {
    if (!a.urlRaiz || !a.loginUrl || a.addonNumber == null) return;
    setBusyId(a.id, true);
    try {
      const { data } = await api.post(`/addons/${a.id}/instalar`, { loginUrl: a.loginUrl, urlRaiz: a.urlRaiz, addonNumber: a.addonNumber });
      if (data?.ok) {
        setStates((s) => ({ ...s, [a.id]: 'installed' }));
        setSelected((sel) => { const n = new Set(sel); n.delete(a.id); return n; });
      } else {
        setStates((s) => ({ ...s, [a.id]: 'error' }));
        setErrMsgs((m) => ({ ...m, [a.id]: data?.message ?? 'La instalación falló.' }));
      }
    } catch (e: any) {
      setStates((s) => ({ ...s, [a.id]: 'error' }));
      setErrMsgs((m) => ({ ...m, [a.id]: e?.response?.data?.message ?? e?.message ?? 'Error al instalar.' }));
    } finally {
      setBusyId(a.id, false);
    }
  };

  const record = async (a: AddonRequest) => {
    if (!a.urlRaiz || !a.loginUrl) return;
    const already = effState(a) === 'recorded';
    if (already) { setStates((s) => { const n = { ...s }; delete n[a.id]; return n; }); return; }
    setBusyId(a.id, true);
    try {
      await api.post('/addons/record', { loginUrl: a.loginUrl, urlRaiz: a.urlRaiz });
      setHasRecording(true);
      setStates((s) => ({ ...s, [a.id]: 'recorded' }));
    } catch { /* noop */ } finally { setBusyId(a.id, false); }
  };

  const installSelected = async () => {
    const ids = [...selected];
    for (const id of ids) { const a = addons.find((x) => x.id === id); if (a) await install(a); }
    setSelected(new Set());
  };

  const EMPTY: Record<Tab, [string, string]> = {
    pending:  ['Sin pendientes', 'Todas las solicitudes de este filtro están resueltas.'],
    error:    ['Ningún error', 'Ninguna instalación falló — nada que reintentar.'],
    recorded: ['Sin flujos grabados', 'Graba un flujo para instalarlo automáticamente después.'],
  };

  const tabs: Array<{ k: Tab; label: string; n: number }> = [
    { k: 'pending', label: 'Pendientes', n: counts.pending },
    { k: 'error', label: 'Errores', n: counts.error },
    { k: 'recorded', label: 'Grabadas', n: counts.recorded },
  ];

  return (
    <Box sx={{
      background: T.surface.card, border: `1px solid ${T.border.card}`, borderRadius: `${T.radius.card}px`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden', maxHeight: 760,
    }}>
      {/* Header */}
      <Box sx={{ p: '16px 18px 12px', borderBottom: `1px solid ${T.border.divider}` }}>
        <Stack direction="row" alignItems="center" spacing={1.1}>
          <SettingsRoundedIcon sx={{ color: T.primary.main, fontSize: 18 }} />
          <Typography sx={{ fontSize: 15, fontWeight: 600, flex: 1, color: T.text.primary }}>Instalaciones</Typography>
          <Box sx={pill(T.border.divider, T.text.secondary)}>{counts.pending + counts.error + counts.recorded}</Box>
        </Stack>

        <Box sx={{ position: 'relative', mt: 1.5 }}>
          <SearchRoundedIcon sx={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.text.faint, fontSize: 18 }} />
          <InputBase
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar addon, empresa, responsable…"
            sx={{
              width: '100%', height: 36, pl: '34px', pr: 1.5, fontSize: 13, color: T.text.primary,
              border: `1px solid ${T.border.input}`, borderRadius: `${T.radius.input}px`, background: T.surface.input,
              '&.Mui-focused': { borderColor: T.primary.main, boxShadow: `0 0 0 3px ${T.primary.tint}` },
            }}
          />
        </Box>

        <Stack direction="row" spacing={0.75} sx={{ mt: 1.25 }} role="tablist">
          {tabs.map((t) => {
            const on = tab === t.k;
            return (
              <Box key={t.k} role="tab" aria-selected={on} onClick={() => setTab(t.k)}
                sx={{
                  flex: 1, height: 32, borderRadius: `${T.radius.chip}px`, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                  fontSize: 12, fontWeight: 600,
                  border: `1px solid ${on ? T.primary.main : T.border.card}`,
                  background: on ? T.primary.tint : T.surface.card,
                  color: on ? T.primary.dark : T.text.muted,
                }}>
                {t.label}
                <Box sx={{ ...pill(on ? T.primary.main : T.border.divider, on ? '#fff' : T.text.muted), px: 0.75 }}>{t.n}</Box>
              </Box>
            );
          })}
        </Stack>
      </Box>

      {/* Recorded notice */}
      {hasRecording && notice && (
        <Box sx={{ m: '12px 14px 0', p: '10px 12px', borderRadius: '10px', background: T.success.bg, border: `1px solid ${T.success.border}`, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <DoneRoundedIcon sx={{ color: T.success.text, fontSize: 16, mt: '1px' }} />
          <Typography sx={{ flex: 1, fontSize: 12, color: T.success.text, lineHeight: 1.5 }}>
            Flujo grabado — <b>Instalar</b> ejecuta la instalación automáticamente.
          </Typography>
          <CloseRoundedIcon onClick={() => setNotice(false)} sx={{ fontSize: 15, color: T.text.muted, cursor: 'pointer' }} />
        </Box>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <Box sx={{ m: '12px 14px 0', p: '10px 12px', borderRadius: '10px', background: T.primary.tint, border: `1px solid ${T.primary.tintBorder}`, display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Typography sx={{ flex: 1, fontSize: 12, fontWeight: 600, color: T.primary.dark }}>
            {selected.size} seleccionada{selected.size > 1 ? 's' : ''}
          </Typography>
          <ActionBtn label="Limpiar" onClick={() => setSelected(new Set())} variant="outline" small />
          <ActionBtn label="Instalar" icon={<PlayArrowRoundedIcon sx={{ fontSize: 15 }} />} onClick={installSelected} variant="primary" small />
        </Box>
      )}

      {/* List */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: '12px 14px 16px' }}>
        {loading && <RowsSkeleton rows={4} height={56} />}
        {!loading && errorMsg && (
          <Box sx={{ p: '10px 12px', borderRadius: '10px', background: T.warning.bg, border: `1px solid ${T.warning.border}` }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: T.warning.text }}>Torre no disponible</Typography>
            <Typography sx={{ fontSize: 12, color: T.warning.text, wordBreak: 'break-all' }}>{errorMsg}</Typography>
          </Box>
        )}

        {!loading && !errorMsg && groups.length === 0 && (
          <Stack alignItems="center" spacing={0.75} sx={{ py: 6, textAlign: 'center' }}>
            <Box sx={{ width: 46, height: 46, borderRadius: '12px', background: T.surface.subtle, border: `1px solid ${T.border.card}`, display: 'grid', placeItems: 'center', mb: 0.5 }}>
              <DoneRoundedIcon sx={{ color: T.text.faint }} />
            </Box>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.text.primary }}>
              {q ? 'Ningún resultado' : EMPTY[tab][0]}
            </Typography>
            <Typography sx={{ fontSize: 12, color: T.text.muted, maxWidth: 250, lineHeight: 1.5 }}>
              {q ? `Ningún resultado para “${q}”.` : EMPTY[tab][1]}
            </Typography>
          </Stack>
        )}

        {!loading && !errorMsg && groups.map((g) => (
          <Box key={g.name} sx={{ mb: 1.25, border: `1px solid ${T.border.divider2}`, borderRadius: '12px', overflow: 'hidden' }}>
            <Box onClick={() => setOpen((o) => ({ ...o, [g.name]: !(o[g.name] !== false) }))}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.1, p: '11px 12px', background: T.surface.subtle, cursor: 'pointer', ...rowHoverSx }}>
              <KeyboardArrowRightRoundedIcon sx={{ fontSize: 18, color: T.text.faint, ...disclosureSpinSx(g.isOpen) }} />
              <BusinessRoundedIcon sx={{ fontSize: 16, color: T.text.muted }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, color: T.text.primary }}>{g.name}</Typography>
                {g.grupo && <Typography noWrap sx={{ fontSize: 12, color: T.text.muted }}>{g.grupo}</Typography>}
              </Box>
              {g.errors > 0 && <Box sx={pill(T.error.bg, T.error.main)}>{g.errors} error</Box>}
              <Box sx={pill(T.border.divider, T.text.secondary)}>{g.count}</Box>
            </Box>

            {g.isOpen && g.items.map((a) => {
              const st = effState(a);
              const meta = STATE_META[st];
              const isErr = st === 'error';
              const isRec = st === 'recorded';
              const sel = selected.has(a.id);
              const isBusy = busy.has(a.id);
              const canInstall = Boolean(a.urlRaiz && a.loginUrl && a.addonNumber != null && hasRecording);
              return (
                <Box key={a.id} sx={{
                  p: '13px 12px', borderTop: `1px solid ${T.border.divider}`,
                  background: sel ? T.surface.selected : isErr ? T.error.bg : T.surface.card,
                  boxShadow: isErr ? `inset 3px 0 0 ${T.error.main}` : sel ? `inset 3px 0 0 ${T.primary.main}` : 'none',
                }}>
                  <Stack direction="row" spacing={1.25} alignItems="flex-start">
                    <Box role="checkbox" aria-checked={sel} onClick={() => setSelected((s) => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}
                      sx={{
                        width: 17, height: 17, mt: '2px', flexShrink: 0, borderRadius: `${T.radius.checkbox}px`, cursor: 'pointer',
                        display: 'grid', placeItems: 'center',
                        border: sel ? 'none' : `1.5px solid ${T.border.input}`, background: sel ? T.primary.main : T.surface.input,
                      }}>
                      {sel && <DoneRoundedIcon sx={{ fontSize: 12, color: '#fff' }} />}
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={0.9} alignItems="center" flexWrap="wrap" sx={{ mb: 0.6 }} useFlexGap>
                        <Box sx={{ ...pill(meta.bg, meta.text), border: `1px solid ${meta.border}`, borderRadius: '5px' }}>{meta.label}</Box>
                        {a.addonNumber != null && (
                          <Box sx={{ fontSize: 11, fontWeight: 600, color: T.text.secondary, background: T.surface.subtle, border: `1px solid ${T.border.card}`, borderRadius: '5px', px: 0.9, py: '2px', fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>#{a.addonNumber}</Box>
                        )}
                      </Stack>

                      <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: isErr ? T.error.text : T.text.primary }}>{a.asunto}</Typography>
                      {a.sucursal && <Typography noWrap sx={{ fontSize: 12, color: T.text.muted, mt: 0.4 }}>{a.sucursal}</Typography>}

                      <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" sx={{ mt: 0.9 }}>
                        {a.responsable && <Typography sx={{ fontSize: 12, color: T.text.muted }}>{a.responsable}</Typography>}
                        <Typography sx={{ color: T.text.faint }}>·</Typography>
                        <Typography sx={{ fontSize: 12, color: T.text.muted, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtDate(a.fecha)} → {fmtDate(a.fechaVencimiento)}
                        </Typography>
                      </Stack>

                      {isErr && (
                        <Box sx={{ display: 'flex', gap: 0.9, mt: 1.1, p: '8px 10px', borderRadius: '8px', background: T.error.bg, border: `1px solid ${T.error.border}` }}>
                          <WarningAmberRoundedIcon sx={{ color: T.error.main, fontSize: 15, mt: '1px' }} />
                          <Typography sx={{ flex: 1, fontSize: 12, color: T.error.text, lineHeight: 1.45 }}>{errMsgs[a.id] ?? 'La instalación falló.'}</Typography>
                        </Box>
                      )}

                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.4 }}>
                        <ActionBtn
                          label={isBusy ? 'Instalando…' : isErr ? 'Reintentar' : 'Instalar'}
                          icon={isBusy ? undefined : <PlayArrowRoundedIcon sx={{ fontSize: 15 }} />}
                          onClick={() => install(a)}
                          variant={isErr ? 'error' : 'primary'}
                          disabled={!canInstall || isBusy}
                        />
                        <ActionBtn
                          label={isRec ? 'Grabada' : 'Grabar'}
                          icon={isRec ? <DoneRoundedIcon sx={{ fontSize: 15 }} /> : <FiberManualRecordRoundedIcon sx={{ fontSize: 13 }} />}
                          onClick={() => record(a)}
                          variant={isRec ? 'success' : 'outline'}
                          disabled={!a.urlRaiz || !a.loginUrl || isBusy}
                        />
                      </Stack>
                    </Box>
                  </Stack>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function ActionBtn({ label, icon, onClick, variant, disabled, small }: {
  label: string; icon?: ReactNode; onClick: () => void;
  variant: 'primary' | 'outline' | 'error' | 'success'; disabled?: boolean; small?: boolean;
}) {
  const styles: Record<string, any> = {
    primary: { background: T.primary.main, color: '#fff', border: 'none' },
    error:   { background: T.error.main, color: '#fff', border: 'none' },
    success: { background: T.success.bg, color: T.success.text, border: `1px solid ${T.success.border}` },
    outline: { background: T.surface.card, color: T.text.secondary, border: `1px solid ${T.border.input}` },
  };
  return (
    <Box component="button" onClick={onClick} disabled={disabled}
      sx={{
        height: small ? 28 : 32, px: small ? 1.25 : 1.6, borderRadius: `${T.radius.chip}px`,
        fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 0.6, fontFamily: 'inherit',
        opacity: disabled ? 0.55 : 1, ...styles[variant],
      }}>
      {icon}{label}
    </Box>
  );
}
