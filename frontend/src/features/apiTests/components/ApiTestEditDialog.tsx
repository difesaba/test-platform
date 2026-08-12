import { useEffect, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, Stack, TextField, Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import RuleRoundedIcon from '@mui/icons-material/RuleRounded';
import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import { updateApiTest } from '@/features/apiTests/services/apiTests';
import type { ApiTest, ApiAssertion, ApiAssertionType, ApiExtraction } from '@/shared/types/platform';
import { ASSERTION_META, ASSERTION_TYPES, newAssertionId, relativeBasePath } from '@/features/apiTests/models/assertions.model';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
type KV = { id: string; key: string; value: string };

interface Props {
  open: boolean;
  test: ApiTest | null;
  selectionQuery: string;
  urlRaiz?: string;
  onClose: () => void;
  onNotify: (message: string, severity?: 'success' | 'error' | 'info') => void;
  onSaved: (updated: ApiTest) => void;
}

// ── Helpers de URL/query ─────────────────────────────────────────────
function splitUrl(url: string): { basePart: string; params: KV[] } {
  const qIdx = url.indexOf('?');
  if (qIdx < 0) return { basePart: url, params: [] };
  const basePart = url.slice(0, qIdx);
  const params: KV[] = [];
  const sp = new URLSearchParams(url.slice(qIdx + 1));
  sp.forEach((value, key) => params.push({ id: newAssertionId(), key, value }));
  return { basePart, params };
}

function joinUrl(basePart: string, params: KV[]): string {
  const usable = params.filter((p) => p.key.trim());
  if (!usable.length) return basePart;
  const qs = usable.map((p) => `${encodeURIComponent(p.key.trim())}=${encodeURIComponent(p.value)}`).join('&');
  return `${basePart}?${qs}`;
}

export default function ApiTestEditDialog({ open, test, selectionQuery, urlRaiz, onClose, onNotify, onSaved }: Props) {
  const [name, setName] = useState('');
  const [method, setMethod] = useState('GET');
  const [basePart, setBasePart] = useState('');
  const [params, setParams] = useState<KV[]>([]);
  const [headers, setHeaders] = useState<KV[]>([]);
  const [body, setBody] = useState('');
  const [expectedStatus, setExpectedStatus] = useState('200');
  const [assertions, setAssertions] = useState<ApiAssertion[]>([]);
  const [extract, setExtract] = useState<ApiExtraction[]>([]);
  const [saving, setSaving] = useState(false);

  // Cargar la prueba al abrir / cambiar de prueba.
  useEffect(() => {
    if (!test) return;
    const { basePart: bp, params: ps } = splitUrl(test.url ?? '');
    setName(test.name ?? '');
    setMethod((test.method ?? 'GET').toUpperCase());
    setBasePart(bp);
    setParams(ps);
    setHeaders(Object.entries(test.headers ?? {}).map(([key, value]) => ({ id: newAssertionId(), key, value: String(value) })));
    setBody(test.body ?? '');
    setExpectedStatus(String(test.expectedStatus ?? 200));
    setAssertions((test.assertions ?? []).map((a) => ({ ...a })));
    setExtract((test.extract ?? []).map((e) => ({ ...e })));
  }, [test]);

  const addParam = () => setParams((c) => [...c, { id: newAssertionId(), key: '', value: '' }]);
  const addHeader = () => setHeaders((c) => [...c, { id: newAssertionId(), key: '', value: '' }]);
  const patchKV = (set: React.Dispatch<React.SetStateAction<KV[]>>, id: string, patch: Partial<KV>) =>
    set((c) => c.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeKV = (set: React.Dispatch<React.SetStateAction<KV[]>>, id: string) =>
    set((c) => c.filter((r) => r.id !== id));

  const addAssertion = () => setAssertions((c) => [...c, { id: newAssertionId(), type: 'field-exists', target: '', value: '' }]);
  const updateAssertion = (id: string, patch: Partial<ApiAssertion>) => setAssertions((c) => c.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const removeAssertion = (id: string) => setAssertions((c) => c.filter((a) => a.id !== id));

  const addExtraction = () => setExtract((c) => [...c, { id: newAssertionId(), name: '', path: '' }]);
  const updateExtraction = (id: string, patch: Partial<ApiExtraction>) => setExtract((c) => c.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeExtraction = (id: string) => setExtract((c) => c.filter((e) => e.id !== id));

  const finalUrl = joinUrl(basePart.trim(), params);

  const save = async () => {
    if (!test || !name.trim() || !basePart.trim()) return;
    setSaving(true);
    try {
      const headersObj: Record<string, string> = {};
      headers.forEach((h) => { if (h.key.trim()) headersObj[h.key.trim()] = h.value; });

      const cleanAssertions = assertions
        .map((a) => ({ ...a, target: a.target?.trim(), value: a.value?.trim() }))
        .filter((a) => {
          const meta = ASSERTION_META[a.type];
          if (meta.needsTarget && !a.target) return false;
          if (meta.needsValue && !a.value) return false;
          return true;
        });
      const cleanExtract = extract
        .map((e) => ({ ...e, name: e.name?.trim(), path: e.path?.trim() }))
        .filter((e) => e.name && e.path);

      const res = await updateApiTest(test.id, selectionQuery, {
        name: name.trim(),
        method,
        url: finalUrl,
        basePath: relativeBasePath(finalUrl, urlRaiz),
        headers: headersObj,
        body,
        expectedStatus: expectedStatus === '0' ? 0 : Number(expectedStatus) || 200,
        assertions: cleanAssertions,
        extract: cleanExtract,
      });
      if (res.success && res.data) {
        onNotify('Prueba API actualizada.', 'success');
        onSaved(res.data);
      } else {
        onNotify('No fue posible actualizar la prueba.', 'error');
      }
    } catch {
      onNotify('No fue posible actualizar la prueba.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Editar prueba API</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ mt: 0.5 }}>
          <TextField label="Nombre" size="small" fullWidth value={name} onChange={(e) => setName(e.target.value)} />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              select size="small" label="Método" value={method}
              SelectProps={{ native: true }} sx={{ minWidth: 120 }}
              onChange={(e) => setMethod(e.target.value)}
            >
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </TextField>
            <TextField
              select size="small" label="Status esperado" value={expectedStatus}
              SelectProps={{ native: true }} sx={{ minWidth: 150 }}
              onChange={(e) => setExpectedStatus(e.target.value)}
            >
              <option value="200">200 OK</option>
              <option value="201">201 Creado</option>
              <option value="204">204 Sin contenido</option>
              <option value="400">400 Error</option>
              <option value="0">Cualquiera</option>
            </TextField>
          </Stack>

          <TextField
            label="URL (sin query)" size="small" fullWidth value={basePart}
            onChange={(e) => setBasePart(e.target.value)}
            helperText="Puedes usar {{variables}} de la suite. El query se arma abajo."
          />

          {/* Query params */}
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="subtitle2">Query params</Typography>
              <Box flex={1} />
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={addParam}>Agregar</Button>
            </Stack>
            {params.length === 0
              ? <Typography variant="body2" color="text.secondary">Sin parámetros de query.</Typography>
              : (
                <Stack spacing={1}>
                  {params.map((p) => (
                    <Stack key={p.id} direction="row" spacing={1} alignItems="center">
                      <TextField size="small" label="Clave" value={p.key} onChange={(e) => patchKV(setParams, p.id, { key: e.target.value })} sx={{ flex: 1 }} />
                      <TextField size="small" label="Valor" value={p.value} onChange={(e) => patchKV(setParams, p.id, { value: e.target.value })} sx={{ flex: 1 }} />
                      <IconButton size="small" color="error" onClick={() => removeKV(setParams, p.id)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                    </Stack>
                  ))}
                </Stack>
              )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, wordBreak: 'break-all' }}>
              URL final: {finalUrl || '—'}
            </Typography>
          </Box>

          <Divider />

          {/* Headers */}
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="subtitle2">Headers</Typography>
              <Typography variant="caption" color="text.secondary">(los de auth de ADPRO se inyectan solos)</Typography>
              <Box flex={1} />
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={addHeader}>Agregar</Button>
            </Stack>
            {headers.length === 0
              ? <Typography variant="body2" color="text.secondary">Sin headers personalizados.</Typography>
              : (
                <Stack spacing={1}>
                  {headers.map((h) => (
                    <Stack key={h.id} direction="row" spacing={1} alignItems="center">
                      <TextField size="small" label="Header" value={h.key} onChange={(e) => patchKV(setHeaders, h.id, { key: e.target.value })} sx={{ flex: 1 }} />
                      <TextField size="small" label="Valor" value={h.value} onChange={(e) => patchKV(setHeaders, h.id, { value: e.target.value })} sx={{ flex: 1 }} />
                      <IconButton size="small" color="error" onClick={() => removeKV(setHeaders, h.id)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                    </Stack>
                  ))}
                </Stack>
              )}
          </Box>

          {/* Body */}
          <TextField
            label="Body JSON" size="small" fullWidth multiline minRows={5}
            value={body} onChange={(e) => setBody(e.target.value)}
            helperText={['GET', 'HEAD'].includes(method) ? 'Los GET/HEAD no envían body.' : 'Puedes usar {{variables}} de la suite.'}
          />

          <Divider />

          {/* Validaciones */}
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <RuleRoundedIcon fontSize="small" color="action" />
              <Typography variant="subtitle2">Validaciones</Typography>
              <Box flex={1} />
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={addAssertion}>Agregar</Button>
            </Stack>
            {assertions.length === 0
              ? <Typography variant="body2" color="text.secondary">Solo se comprueba el status HTTP esperado.</Typography>
              : (
                <Stack spacing={1.5}>
                  {assertions.map((a) => {
                    const meta = ASSERTION_META[a.type];
                    return (
                      <Stack key={a.id} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                        <TextField select size="small" label="Validación" value={a.type} SelectProps={{ native: true }} sx={{ minWidth: 190 }}
                          onChange={(e) => updateAssertion(a.id, { type: e.target.value as ApiAssertionType })}>
                          {ASSERTION_TYPES.map((t) => <option key={t} value={t}>{ASSERTION_META[t].label}</option>)}
                        </TextField>
                        {meta.needsTarget && (
                          <TextField size="small" label={meta.targetLabel} placeholder={meta.targetPlaceholder} value={a.target ?? ''} onChange={(e) => updateAssertion(a.id, { target: e.target.value })} sx={{ flex: 1, minWidth: 140 }} />
                        )}
                        {meta.needsValue && (
                          <TextField size="small" label={meta.valueLabel} placeholder={meta.valuePlaceholder} value={a.value ?? ''} onChange={(e) => updateAssertion(a.id, { value: e.target.value })} sx={{ flex: 1, minWidth: 140 }} />
                        )}
                        <IconButton size="small" color="error" onClick={() => removeAssertion(a.id)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                      </Stack>
                    );
                  })}
                </Stack>
              )}
          </Box>

          {/* Variables de salida */}
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <AltRouteRoundedIcon fontSize="small" color="action" />
              <Typography variant="subtitle2">Variables de salida</Typography>
              <Box flex={1} />
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={addExtraction}>Agregar</Button>
            </Stack>
            {extract.length === 0
              ? <Typography variant="body2" color="text.secondary">Sin variables. Guarda datos de la respuesta para reusarlos en otra prueba de la suite.</Typography>
              : (
                <Stack spacing={1.5}>
                  {extract.map((e) => (
                    <Stack key={e.id} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                      <TextField size="small" label="Nombre variable" placeholder="nuevoId" value={e.name} onChange={(ev) => updateExtraction(e.id, { name: ev.target.value })} sx={{ flex: 1, minWidth: 140 }} />
                      <TextField size="small" label="Campo (ruta)" placeholder="data.id" value={e.path} onChange={(ev) => updateExtraction(e.id, { path: ev.target.value })} sx={{ flex: 1, minWidth: 140 }} />
                      <IconButton size="small" color="error" onClick={() => removeExtraction(e.id)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                    </Stack>
                  ))}
                </Stack>
              )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Cancelar</Button>
        <Button variant="contained" onClick={save} disabled={saving || !name.trim() || !basePart.trim()}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
