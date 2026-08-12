import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle,
  Drawer, IconButton, MenuItem, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import TipsAndUpdatesRoundedIcon from '@mui/icons-material/TipsAndUpdatesRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import TabPanelHeader from '@/shared/components/TabPanelHeader';
import { RowsSkeleton } from '@/shared/components/Skeletons';
import BusinessRoundedIcon from '@mui/icons-material/BusinessRounded';
import api from '@/shared/api/client';
import type { SelectedModule } from '@/shared/store/useModuleStore';
import { useSessionStore } from '@/shared/store/useSessionStore';
import type { E2eRecording, E2eAssertion, E2eAssertionResult, E2eAssertionType } from '@/shared/types/platform';
import { buildSelectionQuery, formatRunTime, resolveAutomationUrl } from '@/shared/utils/platform';
import { T } from '@/shared/theme/launcherTokens';
import { EASE_OUT, rowHoverSx, cardHoverSx, disclosureSpinSx } from '@/shared/theme/motion';
import RowMenu from '@/features/platform/components/RowMenu';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { getE2eRuns, getE2eDocData, e2eScreenshotUrl } from '@/features/e2e/services/e2e';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { getSuites } from '@/features/suites/services/suite';
import { getFlaky } from '@/features/flaky/services/flaky.service';
import AddToSuiteDialog from '@/features/suites/components/AddToSuiteDialog';

const REC_RED = '#E5484D';
const LOG_BG = '#0F1720';
const LOG_BORDER = '#2A3A4B';
const LOG_TEXT = '#D6E2EE';

type ArtifactTab = 'pasos' | 'salida' | 'capturas' | 'pdf' | 'selectores';

interface LocatorFinding {
  line: number;
  original: string;
  method: string;
  reason: string;
  severity: 'alto' | 'medio';
  suggestion?: string;
  autoFixable: boolean;
}

type EdgeCaseType = 'requerido' | 'limite' | 'invalido' | 'especial' | 'negativo' | 'duplicado' | 'otro';
type EdgeCasePriority = 'alta' | 'media' | 'baja';
interface EdgeCaseSuggestion {
  title: string;
  type: EdgeCaseType;
  description: string;
  priority: EdgeCasePriority;
}

const EDGE_TYPE_LABEL: Record<EdgeCaseType, string> = {
  requerido: 'Requerido', limite: 'Límite', invalido: 'Inválido', especial: 'Especial',
  negativo: 'Negativo', duplicado: 'Duplicado', otro: 'Otro',
};
const EDGE_TYPE_COLOR: Record<EdgeCaseType, 'primary' | 'secondary' | 'info' | 'error' | 'warning' | 'default'> = {
  requerido: 'primary', limite: 'info', invalido: 'error', especial: 'secondary',
  negativo: 'warning', duplicado: 'default', otro: 'default',
};

// Catálogo de aserciones web-first (cada tipo verifica un estado, no solo presencia de texto).
const ASSERT_TYPES: { value: E2eAssertionType; label: string }[] = [
  { value: 'appears', label: 'Aparece texto' },
  { value: 'not-appears', label: 'NO aparece texto' },
  { value: 'url-contains', label: 'URL contiene' },
  { value: 'title-contains', label: 'Título contiene' },
  { value: 'count', label: 'Cantidad de filas' },
  { value: 'value', label: 'Campo tiene valor' },
];
function assertionLabel(a: { type: string; text: string; target?: string; op?: string }): string {
  switch (a.type) {
    case 'appears': return `Aparece: "${a.text}"`;
    case 'not-appears': return `NO aparece: "${a.text}"`;
    case 'url-contains': return `URL contiene: "${a.text}"`;
    case 'title-contains': return `Título contiene: "${a.text}"`;
    case 'count': return `Filas ${a.op === 'exact' ? '=' : '≥'} ${a.text}`;
    case 'value': return `Campo "${a.target ?? ''}" = "${a.text}"`;
    default: return a.text;
  }
}

interface StepRow { kind: string; target: string; value?: string; }

const KIND_COLOR: Record<string, string> = {
  'ir a': '#38BDF8', 'clic': '#A78BFA', 'escribir': '#22D3EE', 'elegir': '#FBBF24', 'verificar': '#4ADE80',
};

function slug(name: string): string {
  return (name || 'flujo').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'flujo';
}
function specFileName(name: string): string { return `${slug(name)}.spec.ts`; }

function parseSteps(spec: string): StepRow[] {
  const steps: StepRow[] = [];
  if (!spec) return steps;
  for (const raw of spec.split('\n')) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if ((m = line.match(/\.goto\(\s*[`'"]([^`'"]*)/))) steps.push({ kind: 'ir a', target: m[1] });
    else if ((m = line.match(/\.fill\(\s*[`'"]([^`'"]*)[`'"]\s*,\s*[`'"]([^`'"]*)/))) steps.push({ kind: 'escribir', target: m[1], value: m[2] });
    else if ((m = line.match(/\.type\(\s*[`'"]([^`'"]*)[`'"]\s*,\s*[`'"]([^`'"]*)/))) steps.push({ kind: 'escribir', target: m[1], value: m[2] });
    else if ((m = line.match(/\.selectOption\(\s*[`'"]([^`'"]*)[`'"]\s*,\s*[`'"]?([^`'")]*)/))) steps.push({ kind: 'elegir', target: m[1], value: (m[2] || '').trim() });
    else if ((m = line.match(/\.(?:click|dblclick|check|press)\(\s*[`'"]?([^`'")]*)/))) steps.push({ kind: 'clic', target: (m[1] || 'elemento').trim() });
    else if (/expect\(/.test(line)) { const e = line.match(/expect\(\s*([^)]*)\)/); steps.push({ kind: 'verificar', target: (e ? e[1] : 'condición').slice(0, 60) }); }
  }
  return steps;
}

function failMessage(output?: string): string | null {
  if (!output) return null;
  const m = output.match(/(?:^|\n)\s*(?:Error|error):\s*(.+)/) || output.match(/(locator\.[a-zA-Z]+:.+)/) || output.match(/(TimeoutError:.+)/);
  return m ? m[1].trim().slice(0, 240) : null;
}

function fmtSecs(total: number): string {
  const mm = Math.floor(total / 60).toString().padStart(2, '0');
  const ss = Math.floor(total % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

interface Props {
  selected: SelectedModule;
  onNotify: (message: string, severity?: 'success' | 'error' | 'info') => void;
}

export default function E2eTab({ selected, onNotify }: Props) {
  const urlRaiz = useSessionStore((s) => s.urlRaiz);
  const empresaSesion = useSessionStore((s) => s.empresa);
  const currentEmpresa = empresaSesion?.nombre ?? '';
  const currentEntorno = useSessionStore((s) => s.sucursal?.entorno ?? s.entornoNombre) ?? '';
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  // Agregar a suite
  const [addToSuiteRec, setAddToSuiteRec] = useState<E2eRecording | null>(null);
  // Membresía de suites por flujo (flowId → nombres de suites), para el chip informativo en la fila.
  const [suiteMembership, setSuiteMembership] = useState<Map<string, string[]>>(new Map());
  // Estabilidad por flujo (flowId → {flaky, stabilityPct}) en el contexto actual, para el chip Flaky.
  const [flakyMap, setFlakyMap] = useState<Map<string, { flaky: boolean; stabilityPct: number }>>(new Map());
  // Salud de selectores por flujo (flowId → hallazgos). undefined = aún no analizado.
  const [locHealth, setLocHealth] = useState<Record<string, LocatorFinding[]>>({});
  const [locBusy, setLocBusy] = useState<string | null>(null);

  const analyzeLoc = async (id: string) => {
    setLocBusy(id);
    try {
      const { data } = await api.get<LocatorFinding[]>(`/e2e/${id}/locators?${buildSelectionQuery(selected)}`);
      setLocHealth((h) => ({ ...h, [id]: data }));
    } catch { onNotify('No se pudieron analizar los selectores.', 'error'); }
    finally { setLocBusy(null); }
  };
  const healLoc = async (id: string) => {
    setLocBusy(id);
    try {
      const { data } = await api.post<{ applied: unknown[]; remaining: LocatorFinding[] }>(`/e2e/${id}/locators/heal?${buildSelectionQuery(selected)}`);
      setLocHealth((h) => ({ ...h, [id]: data.remaining }));
      onNotify(`Se aplicaron ${data.applied?.length ?? 0} sugerencia(s). El spec se actualizó.`, 'success');
      load();
    } catch { onNotify('No se pudieron aplicar las sugerencias.', 'error'); }
    finally { setLocBusy(null); }
  };
  const [recordings, setRecordings] = useState<E2eRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<Record<string, ArtifactTab>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [busyRec, setBusyRec] = useState(false);
  const [assertRec, setAssertRec] = useState<E2eRecording | null>(null);
  const [assertList, setAssertList] = useState<E2eAssertion[]>([]);
  const [savingAssert, setSavingAssert] = useState(false);
  const [newFlowOpen, setNewFlowOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowTipo, setNewFlowTipo] = useState<'crear' | 'editar' | 'consultar' | 'otro'>('crear');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [reqId, setReqId] = useState<string | null>(null);
  const [reqVal, setReqVal] = useState('');

  // specs + screenshots caches (por flujo expandido)
  const [specById, setSpecById] = useState<Record<string, string>>({});
  const [shotsById, setShotsById] = useState<Record<string, string[]>>({});

  // grabación
  const recStartRef = useRef<number | null>(null);
  const [recElapsed, setRecElapsed] = useState(0);

  // editor de código (modal)
  const [codeId, setCodeId] = useState<string | null>(null);
  const [codeDraft, setCodeDraft] = useState('');
  const [codeSavedFlag, setCodeSavedFlag] = useState(false);
  const [savingCode, setSavingCode] = useState(false);

  // IA
  const [enhancingId, setEnhancingId] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState<{ id: string; original: string; enhanced: string } | null>(null);
  const [acceptingAi, setAcceptingAi] = useState(false);

  // IA — sugerencias de casos de borde
  const [suggestingId, setSuggestingId] = useState<string | null>(null);
  const [suggestFlow, setSuggestFlow] = useState<{ name: string; suggestions: EdgeCaseSuggestion[] } | null>(null);

  // lightbox + drawer historial
  const [lightbox, setLightbox] = useState<{ src: string; label: string } | null>(null);
  const [drawer, setDrawer] = useState<{ scope: 'global' | 'flow'; flowId?: string } | null>(null);
  const [fResult, setFResult] = useState('todos');

  const effectiveUrl = resolveAutomationUrl(selected.pageUrl, urlRaiz) || '';
  const recordingActive = recordings.some((r) => r.status === 'recording');

  const openAssertions = (r: E2eRecording) => { setAssertRec(r); setAssertList((r.assertions ?? []).map((a) => ({ ...a }))); };
  const addAssertion = () => setAssertList((l) => [...l, { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: 'appears', text: '' }]);
  const updateAssertion = (id: string, patch: Partial<E2eAssertion>) => setAssertList((l) => l.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const removeAssertion = (id: string) => setAssertList((l) => l.filter((a) => a.id !== id));
  const saveAssertions = async () => {
    if (!assertRec) return;
    setSavingAssert(true);
    try {
      const clean = assertList
        .filter((a) => a.text.trim() && (a.type !== 'value' || (a.target ?? '').trim()))
        .map((a) => ({ id: a.id, type: a.type, text: a.text.trim(), target: a.target?.trim() || undefined, op: a.type === 'count' ? (a.op ?? 'atLeast') : undefined }));
      await api.post(`/e2e/${assertRec.id}/assertions?${buildSelectionQuery(selected)}`, { assertions: clean });
      onNotify('Aserciones guardadas.', 'success');
      setAssertRec(null); load();
    } catch { onNotify('No se pudieron guardar las aserciones.', 'error'); }
    finally { setSavingAssert(false); }
  };

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/e2e?${buildSelectionQuery(selected)}`)
      .then(({ data }) => setRecordings(data))
      .catch(() => onNotify('No se pudieron cargar los flujos E2E.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.moduleName, selected.pageName, selected.submoduleName]);

  useEffect(() => { load(); }, [load]);

  // Poll mientras hay grabación activa
  useEffect(() => {
    if (!recordingActive) { recStartRef.current = null; setRecElapsed(0); return; }
    if (recStartRef.current == null) recStartRef.current = Date.now();
    const tick = setInterval(() => {
      if (recStartRef.current != null) setRecElapsed((Date.now() - recStartRef.current) / 1000);
    }, 1000);
    const poll = setInterval(() => {
      api.get(`/e2e?${buildSelectionQuery(selected)}`).then(({ data }) => {
        setRecordings(data);
        if (!data.some((r: E2eRecording) => r.status === 'recording')) onNotify('Grabación finalizada. El spec fue guardado.', 'success');
      }).catch(() => undefined);
    }, 3000);
    return () => { clearInterval(tick); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingActive, selected.moduleName, selected.pageName, selected.submoduleName]);

  const loadSpec = useCallback((id: string) => {
    api.get(`/e2e/${id}/spec?${buildSelectionQuery(selected)}`)
      .then(({ data }) => setSpecById((m) => ({ ...m, [id]: data.spec || '' })))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.moduleName, selected.pageName, selected.submoduleName]);

  const loadShots = useCallback((id: string) => {
    api.get(`/e2e/${id}/screenshots?${buildSelectionQuery(selected)}`)
      .then(({ data }) => setShotsById((m) => ({ ...m, [id]: data.screenshots ?? [] })))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.moduleName, selected.pageName, selected.submoduleName]);

  const toggleRow = (id: string) => {
    setOpenId((cur) => {
      const next = cur === id ? null : id;
      if (next) {
        if (!subTab[id]) setSubTab((s) => ({ ...s, [id]: 'pasos' }));
        loadSpec(id); loadShots(id);
      }
      return next;
    });
  };

  // ---- acciones ----
  const startRecordingNewFlow = async (flowName: string) => {
    if (!effectiveUrl) { onNotify('Esta página no tiene URL destino para grabar.', 'error'); return; }
    if (flowNameExists(flowName)) { onNotify('Ya existe un flujo con ese nombre.', 'error'); return; }
    setNewFlowOpen(false);
    setBusyRec(true);
    try {
      const name = (flowName || '').trim() || (selected.pageName ?? 'Flujo');
      const { data: rec } = await api.post(`/e2e?${buildSelectionQuery(selected)}`, { name, url: effectiveUrl, tipo: newFlowTipo });
      recStartRef.current = Date.now();
      await api.post(`/e2e/${rec.id}/start?${buildSelectionQuery(selected)}`, { url: effectiveUrl });
      onNotify('Grabación iniciada — recorré el flujo en el navegador.', 'info');
      load();
    } catch { onNotify('No fue posible iniciar la grabación.', 'error'); recStartRef.current = null; }
    finally { setBusyRec(false); }
  };

  // Crear el flujo SIN grabarlo (queda "Sin grabar" y se graba después con el botón "Grabar").
  const createFlowOnly = async (flowName: string) => {
    if (flowNameExists(flowName)) { onNotify('Ya existe un flujo con ese nombre.', 'error'); return; }
    setNewFlowOpen(false);
    setBusyRec(true);
    try {
      const name = (flowName || '').trim() || (selected.pageName ?? 'Flujo');
      await api.post(`/e2e?${buildSelectionQuery(selected)}`, { name, url: effectiveUrl || '', tipo: newFlowTipo });
      onNotify('Flujo creado. Grabalo cuando quieras con el botón "Grabar".', 'success');
      load();
    } catch { onNotify('No fue posible crear el flujo.', 'error'); }
    finally { setBusyRec(false); }
  };

  const stopRecording = async () => {
    const rec = recordings.find((r) => r.status === 'recording');
    if (!rec) return;
    setBusyRec(true);
    try {
      await api.post(`/e2e/${rec.id}/stop?${buildSelectionQuery(selected)}`);
      onNotify('Grabación detenida. Flujo guardado.', 'success');
      setOpenId(rec.id);
      setSubTab((s) => ({ ...s, [rec.id]: 'pasos' }));
      load();
    } catch { onNotify('No fue posible detener la grabación.', 'error'); }
    finally { setBusyRec(false); }
  };

  const reRecord = async (id: string) => {
    try {
      recStartRef.current = Date.now();
      await api.post(`/e2e/${id}/start?${buildSelectionQuery(selected)}`, effectiveUrl ? { url: effectiveUrl } : {});
      onNotify('Grabación iniciada — recorré el flujo en el navegador.', 'info');
      load();
    } catch { onNotify('No fue posible iniciar la grabación.', 'error'); }
  };

  const runFlow = async (id: string) => {
    setRunningId(id);
    setOpenId(id);
    if (!subTab[id]) setSubTab((s) => ({ ...s, [id]: 'salida' }));
    try {
      const { data } = await api.post(`/e2e/${id}/run?${buildSelectionQuery(selected)}`, effectiveUrl ? { url: effectiveUrl } : {});
      if (data?.ok) onNotify(`Pasó — ${data.passed ?? 0} paso(s) correctos.`, 'success');
      else onNotify(`Falló — ${data?.failed ?? 0} fallo(s). Revisá la salida.`, 'error');
      load(); loadShots(id); loadFlaky();
    } catch { onNotify('No fue posible ejecutar el flujo.', 'error'); }
    finally { setRunningId(null); }
  };

  const runAll = async () => { for (const r of recordings) { /* eslint-disable no-await-in-loop */ await runFlow(r.id); } };

  const removeFlow = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/e2e/${deleteId}?${buildSelectionQuery(selected)}`);
      onNotify('Flujo eliminado.', 'success');
      if (openId === deleteId) setOpenId(null);
      setDeleteId(null); load();
    } catch { onNotify('No fue posible eliminar el flujo.', 'error'); }
  };

  const openRenameFlow = (id: string, current: string) => { setRenameId(id); setRenameVal(current); };
  const renameFlow = async () => {
    if (!renameId || !renameVal.trim()) return;
    if (flowNameExists(renameVal, renameId)) { onNotify('Ya existe un flujo con ese nombre.', 'error'); return; }
    try {
      await api.post(`/e2e/${renameId}/rename?${buildSelectionQuery(selected)}`, { name: renameVal.trim() });
      onNotify('Flujo renombrado.', 'success');
      setRenameId(null); load();
    } catch { onNotify('No fue posible renombrar el flujo.', 'error'); }
  };

  const openRequirement = (id: string, current?: string) => { setReqId(id); setReqVal(current ?? ''); };
  const saveRequirement = async () => {
    if (!reqId) return;
    try {
      await api.post(`/e2e/${reqId}/requirement?${buildSelectionQuery(selected)}`, { requirement: reqVal.trim() });
      onNotify('Requisito actualizado.', 'success');
      setReqId(null); load();
    } catch { onNotify('No fue posible actualizar el requisito.', 'error'); }
  };

  const openCode = async (id: string) => {
    setCodeId(id); setCodeSavedFlag(false);
    try {
      const { data } = await api.get(`/e2e/${id}/spec?${buildSelectionQuery(selected)}`);
      setCodeDraft(data.spec || '');
      setSpecById((m) => ({ ...m, [id]: data.spec || '' }));
    } catch { setCodeDraft(''); }
  };

  const saveCode = async (thenRun: boolean) => {
    if (!codeId) return;
    setSavingCode(true);
    try {
      await api.post(`/e2e/${codeId}/save-enhanced?${buildSelectionQuery(selected)}`, { enhancedSpec: codeDraft });
      setSpecById((m) => ({ ...m, [codeId]: codeDraft }));
      setCodeSavedFlag(true);
      onNotify('Código guardado.', 'success');
      const id = codeId;
      if (thenRun) { setCodeId(null); await runFlow(id); }
      load();
    } catch { onNotify('No fue posible guardar el código.', 'error'); }
    finally { setSavingCode(false); }
  };

  const enhanceAi = async (id: string) => {
    setEnhancingId(id);
    try {
      const { data } = await api.post(`/e2e/${id}/enhance-ai?${buildSelectionQuery(selected)}`);
      setEnhanced({ id, original: data.originalSpec, enhanced: data.enhancedSpec });
    } catch { onNotify('No fue posible mejorar con IA. Verificá ANTHROPIC_API_KEY.', 'error'); }
    finally { setEnhancingId(null); }
  };

  const acceptAi = async () => {
    if (!enhanced) return;
    setAcceptingAi(true);
    try {
      await api.post(`/e2e/${enhanced.id}/save-enhanced?${buildSelectionQuery(selected)}`, { enhancedSpec: enhanced.enhanced });
      onNotify('Spec mejorado guardado.', 'success');
      setEnhanced(null); load();
    } catch { onNotify('No fue posible guardar el spec mejorado.', 'error'); }
    finally { setAcceptingAi(false); }
  };

  const aiSuggest = async (id: string, name: string) => {
    setSuggestingId(id);
    setSuggestFlow({ name, suggestions: [] });
    try {
      const { data } = await api.post(`/e2e/${id}/ai-suggest?${buildSelectionQuery(selected)}&flowName=${encodeURIComponent(name)}`);
      setSuggestFlow({ name, suggestions: (data.suggestions ?? []) as EdgeCaseSuggestion[] });
    } catch {
      onNotify('No se pudieron generar sugerencias.', 'error');
      setSuggestFlow(null);
    } finally {
      setSuggestingId(null);
    }
  };

  const copyText = (text: string) => { navigator.clipboard?.writeText(text); onNotify('Copiado.', 'success'); };
  const download = (text: string, file: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = file; a.click(); URL.revokeObjectURL(url);
  };
  const shotUrl = (id: string, file: string) => `/api/e2e/${id}/screenshots/${file}?${buildSelectionQuery(selected)}`;
  // Reporte PDF on-demand: se arma en el navegador (@react-pdf) al Ver/Descargar y NO se guarda nada
  // en el server. El generador se importa de forma diferida para no inflar el bundle principal.
  const generarReporte = useCallback(async (r: E2eRecording, modo: 'ver' | 'descargar') => {
    setPdfBusy(r.id);
    try {
      const res = await getE2eDocData(r.id, selected);
      if (!res.success || !res.data) { onNotify(res.error ?? 'No se pudo cargar el reporte.', 'error'); return; }
      const { buildE2eReportBlob } = await import('@/features/e2e/report/e2eReportPdf');
      const blob = await buildE2eReportBlob({
        doc: res.data,
        empresa: currentEmpresa || undefined,
        entorno: currentEntorno || undefined,
        screenshotUrl: (file) => e2eScreenshotUrl(r.id, file, selected),
      });
      const url = URL.createObjectURL(blob);
      if (modo === 'descargar') {
        const a = document.createElement('a'); a.href = url; a.download = `${slug(r.name)}.pdf`; a.click();
      } else {
        window.open(url, '_blank', 'noopener');
      }
      // Liberamos el objeto tras un rato (el visor/descarga ya lo tomó).
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      console.error('[e2e] generar reporte PDF', e);
      onNotify('No se pudo generar el PDF.', 'error');
    } finally {
      setPdfBusy(null);
    }
  }, [selected, currentEmpresa, currentEntorno, onNotify]);

  // ---- agregar a suite (diálogo compartido) ----
  // Mapa flowId → suites E2E a las que pertenece (para el chip informativo por fila).
  const loadSuiteMembership = useCallback(async () => {
    const res = await getSuites('e2e');
    const m = new Map<string, string[]>();
    if (res.success && res.data) {
      for (const s of res.data) for (const f of s.flows) {
        const arr = m.get(f.flowId) ?? []; arr.push(s.name); m.set(f.flowId, arr);
      }
    }
    setSuiteMembership(m);
  }, []);
  useEffect(() => { loadSuiteMembership(); }, [loadSuiteMembership]);

  // Carga el reporte de estabilidad y lo indexa por flujo, priorizando el contexto (empresa/entorno) actual.
  const loadFlaky = useCallback(async () => {
    const res = await getFlaky();
    const m = new Map<string, { flaky: boolean; stabilityPct: number }>();
    if (res.success && res.data) {
      for (const row of res.data) {
        const matchesCtx = (!currentEmpresa || row.empresaNombre === currentEmpresa)
          && (!currentEntorno || row.entorno === currentEntorno);
        const prev = m.get(row.flowId);
        // Preferimos la fila del contexto actual; si no, la más inestable.
        if (!prev || matchesCtx || (row.flaky && !prev.flaky)) {
          m.set(row.flowId, { flaky: row.flaky, stabilityPct: row.stabilityPct });
        }
      }
    }
    setFlakyMap(m);
  }, [currentEmpresa, currentEntorno]);
  useEffect(() => { loadFlaky(); }, [loadFlaky]);

  // ---- historial (drawer) ----
  // Cada fila del historial: unifica el origen persistido (e2e_runs) y el fallback en memoria.
  // 📝 id/entorno/tipo/pasos/aserciones sólo llegan del origen persistido; el fallback en memoria los deja vacíos.
  type RunRow = { id?: string; flowId: string; flowName: string; passed: number; failed: number; ok: boolean; runAt: string; output: string; empresa?: string; sucursal?: string; entorno?: string; tipo?: string; stepCount?: number; assertTotal?: number; assertFailed?: number; assertResults?: E2eAssertionResult[] };

  // Fallback: ventana en memoria (rec.history) por si el backend no expone /e2e/runs todavía.
  const historyRuns = useMemo<RunRow[]>(() => {
    const rows: RunRow[] = [];
    for (const r of recordings) {
      if (drawer?.scope === 'flow' && r.id !== drawer.flowId) continue;
      for (const h of r.history ?? []) rows.push({ flowId: r.id, flowName: r.name, passed: h.passed, failed: h.failed, ok: h.ok, runAt: h.runAt, output: h.output, empresa: h.empresaNombre, sucursal: h.sucursalNombre });
    }
    return rows.sort((a, b) => (a.runAt < b.runAt ? 1 : -1));
  }, [recordings, drawer]);

  // Fuente persistida: se carga desde el servicio cuando se abre el drawer. null = aún sin datos → usa fallback.
  const [fetchedRuns, setFetchedRuns] = useState<RunRow[] | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);
  // Progressive disclosure: clave de la corrida expandida (id persistido, o índice como fallback en memoria).
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  useEffect(() => {
    if (!drawer) { setFetchedRuns(null); setExpandedRun(null); return; }
    let cancelado = false;
    setRunsLoading(true);
    // ✅ El historial persiste en backend; el flowId sólo viaja en scope 'flow'.
    getE2eRuns(selected, { flowId: drawer.scope === 'flow' ? drawer.flowId : undefined, limit: 200 })
      .then((res) => {
        if (cancelado) return;
        if (res.success && res.data) {
          const rows: RunRow[] = res.data.map((run) => ({
            id: run.id,
            flowId: run.flowId,
            flowName: run.flowName ?? '',
            passed: run.passed,
            failed: run.failed,
            ok: run.ok,
            runAt: run.runAt,
            output: run.result?.output ?? '',
            empresa: run.empresaNombre,
            sucursal: run.sucursalNombre,
            entorno: run.entorno,
            tipo: run.tipo,
            stepCount: run.stepCount,
            assertTotal: run.assertionTotal,
            assertFailed: run.assertionFailed,
            assertResults: run.result?.assertionResults,
          }));
          setFetchedRuns(rows);
        } else {
          // ⚠️ Backend sin endpoint o error: caemos al historial en memoria, sin romper la UI.
          setFetchedRuns(null);
        }
      })
      .finally(() => { if (!cancelado) setRunsLoading(false); });
    return () => { cancelado = true; };
  }, [drawer, selected]);

  // Prioriza lo persistido; si no llegó nada, usa la ventana en memoria.
  const sourceRuns = fetchedRuns ?? historyRuns;
  // Scope del historial: cliente + entorno actuales (el contexto en el que estás parado).
  // El entorno se filtra de forma tolerante: si una corrida no trae entorno (fallback en memoria de
  // backend viejo), no la escondemos; solo excluimos las que declaran OTRO entorno.
  const filteredRuns = sourceRuns.filter((r) =>
    (!currentEmpresa || r.empresa === currentEmpresa) &&
    (!currentEntorno || !r.entorno || r.entorno === currentEntorno) &&
    (fResult === 'todos' || (fResult === 'paso' ? r.ok : !r.ok)));

  const flowNameExists = (name: string, exceptId?: string) =>
    recordings.some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === name.trim().toLowerCase());

  // ================= RENDER =================
  const resultChip = (r: E2eRecording) => {
    if (!r.lastResult) return <Chip size="small" icon={<RemoveCircleOutlineRoundedIcon />} label="Sin ejecutar" variant="outlined" sx={{ color: T.text.muted, borderColor: T.border.card, '& .MuiChip-icon': { color: T.text.muted } }} />;
    return r.lastResult.ok
      ? <Chip size="small" icon={<CheckCircleRoundedIcon />} label="Pasó" sx={{ bgcolor: T.success.bg, color: T.success.text, fontWeight: 700, '& .MuiChip-icon': { color: T.success.text } }} />
      : <Chip size="small" icon={<CancelRoundedIcon />} label="Falló" sx={{ bgcolor: T.error.bg, color: T.error.text, fontWeight: 700, '& .MuiChip-icon': { color: T.error.text } }} />;
  };

  const GRID = '26px 2.2fr .8fr 1.1fr 1fr 160px';

  return (
    <Stack spacing={2.5}>
      {/* ── Header del panel ── */}
      <TabPanelHeader
        title="Automatización E2E"
        description="Graba un recorrido real, se genera el código Playwright y queda listo para ejecutarse en cada corrida."
        secondaryActions={
          <Button variant="outlined" startIcon={<UploadFileRoundedIcon />} onClick={() => onNotify('Importar spec: disponible próximamente.', 'info')}>
            Importar spec
          </Button>
        }
        primaryAction={
          <Button variant="contained" disabled={busyRec || recordingActive} onClick={() => { setNewFlowName(selected.pageName ?? 'Flujo'); setNewFlowTipo('crear'); setNewFlowOpen(true); }}
            startIcon={busyRec ? <CircularProgress size={14} color="inherit" /> : <AddRoundedIcon />}>
            {recordingActive ? 'Grabando…' : 'Nuevo flujo'}
          </Button>
        }
      />

      {/* ── Tira de grabación en vivo ── */}
      {recordingActive && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, borderRadius: `${T.radius.card}px`, bgcolor: T.error.bg, border: `1px solid ${T.error.border}` }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: REC_RED, '@keyframes recpulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } }, animation: 'recpulse 1.2s ease-in-out infinite' }} />
          <Typography variant="body2" sx={{ color: T.error.text, fontWeight: 700 }}>Grabando</Typography>
          <Typography variant="body2" sx={{ color: T.error.text, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>{fmtSecs(recElapsed)}</Typography>
          <Typography variant="body2" sx={{ color: T.error.text, opacity: 0.85 }}>· recorré el flujo en el navegador</Typography>
          <Box flex={1} />
          <Button size="small" variant="contained" color="error" startIcon={<StopRoundedIcon />} disabled={busyRec} onClick={stopRecording}>
            Detener y guardar
          </Button>
        </Box>
      )}

      {/* ── Estado vacío ── */}
      {!loading && recordings.length === 0 && !recordingActive && (
        <Box sx={{ py: { xs: 3, md: 5 }, px: 2, textAlign: 'center', border: `1px solid ${T.border.card}`, borderRadius: `${T.radius.card}px`, bgcolor: T.surface.card }}>
          <Box sx={{ width: 56, height: 56, mx: 'auto', mb: 2, borderRadius: '50%', bgcolor: T.primary.tint, color: T.primary.main, display: 'grid', placeItems: 'center' }}>
            <PlayArrowRoundedIcon />
          </Box>
          <Typography variant="h6" fontWeight={700}>Aún no hay flujos E2E en esta página</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560, mx: 'auto', mt: 0.5 }}>
            Un flujo es un recorrido de usuario grabado una vez y repetible en cada corrida. Así funciona:
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 3, mb: 3 }}>
            {[
              { n: 1, t: 'Inicia la grabación', d: 'Se abre el navegador en la página destino con la sesión ya resuelta.' },
              { n: 2, t: 'Recorre el flujo', d: 'Haz clic y escribe como un usuario real. Cada acción queda capturada.' },
              { n: 3, t: 'Detén y guarda', d: 'Se genera el spec de Playwright y el flujo queda listo para ejecutarse.' },
            ].map((step) => (
              <Box key={step.n} sx={{ flex: 1, textAlign: 'left', p: 2, borderRadius: `${T.radius.card}px`, border: `1px solid ${T.border.card}`, bgcolor: T.surface.subtle }}>
                <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: T.primary.main, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, mb: 1 }}>{step.n}</Box>
                <Typography variant="body2" fontWeight={700}>{step.t}</Typography>
                <Typography variant="caption" color="text.secondary">{step.d}</Typography>
              </Box>
            ))}
          </Stack>
          <Stack direction="row" spacing={1.25} justifyContent="center">
            <Button variant="contained" onClick={() => { setNewFlowName(selected.pageName ?? 'Flujo'); setNewFlowTipo('crear'); setNewFlowOpen(true); }} startIcon={<AddRoundedIcon />}>
              Nuevo flujo
            </Button>
            <Button variant="outlined" onClick={() => onNotify('Documentación E2E: disponible próximamente.', 'info')}>Ver documentación</Button>
          </Stack>
        </Box>
      )}

      {/* ── Tabla de flujos ── */}
      {!loading && recordings.length > 0 && (
        <Box sx={{ border: `1px solid ${T.border.card}`, borderRadius: `${T.radius.card}px`, bgcolor: T.surface.card, overflow: 'hidden' }}>
          {/* toolbar */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${T.border.divider}` }}>
            <Typography variant="subtitle2" fontWeight={700}>Flujos registrados</Typography>
            <Chip size="small" label={recordings.length} sx={{ bgcolor: T.primary.tint, color: T.primary.main, fontWeight: 700, height: 20 }} />
            <Box flex={1} />
            <Button size="small" variant="text" startIcon={<PlayArrowRoundedIcon />} onClick={runAll} disabled={!!runningId}>Ejecutar todos</Button>
          </Stack>
          {/* header de tabla */}
          <Box role="row" sx={{ display: 'grid', gridTemplateColumns: GRID, gap: 1, alignItems: 'center', px: 2, py: 1, bgcolor: T.surface.subtle, borderBottom: `1px solid ${T.border.divider}` }}>
            <span />
            <Typography variant="caption" sx={{ color: T.text.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>Flujo</Typography>
            <Typography variant="caption" sx={{ color: T.text.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', textAlign: 'right' }}>Pasos</Typography>
            <Typography variant="caption" sx={{ color: T.text.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>Última ejecución</Typography>
            <Typography variant="caption" sx={{ color: T.text.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>Resultado</Typography>
            <Typography variant="caption" sx={{ color: T.text.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', textAlign: 'right' }}>Acción</Typography>
          </Box>

          {recordings.map((r) => {
            const open = openId === r.id;
            const steps = parseSteps(specById[r.id] ?? r.originalSpec ?? '');
            const tab = subTab[r.id] ?? 'pasos';
            const shots = shotsById[r.id] ?? r.lastResult?.screenshots ?? [];
            return (
              <Box key={r.id} sx={{ borderBottom: `1px solid ${T.border.divider}` }}>
                {/* fila */}
                <Box
                  role="button" tabIndex={0} aria-expanded={open}
                  onClick={() => toggleRow(r.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRow(r.id); } }}
                  sx={{ display: 'grid', gridTemplateColumns: GRID, gap: 1, alignItems: 'center', px: 2, py: 1.25, cursor: 'pointer', ...rowHoverSx, outline: 'none', '&:focus-visible': { boxShadow: `inset 0 0 0 2px ${T.primary.tintBorder}` } }}
                >
                  <KeyboardArrowRightRoundedIcon fontSize="small" sx={{ color: T.text.muted, ...disclosureSpinSx(open) }} />
                  <Box minWidth={0}>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <Typography variant="body2" fontWeight={700} noWrap title={r.name}>{r.name}</Typography>
                      {r.status !== 'ready' && r.status !== 'recording' && (
                        <Chip size="small" label="Sin grabar" sx={{ height: 18, bgcolor: T.surface.subtle, color: T.text.muted, fontWeight: 700, '& .MuiChip-label': { fontSize: 10, px: 0.75 } }} />
                      )}
                      {(() => {
                        const ss = suiteMembership.get(r.id) ?? [];
                        return ss.length ? (
                          <Chip size="small" variant="outlined" icon={<LayersRoundedIcon sx={{ fontSize: 12 }} />}
                            title={`En suite(s): ${ss.join(', ')}`}
                            label={ss.length === 1 ? ss[0] : `${ss[0]} +${ss.length - 1}`}
                            sx={{ height: 18, maxWidth: 180, color: T.primary.main, borderColor: T.primary.tintBorder, '& .MuiChip-label': { fontSize: 10 }, '& .MuiChip-icon': { color: T.primary.main } }} />
                        ) : null;
                      })()}
                      {(() => {
                        const fl = flakyMap.get(r.id);
                        return fl?.flaky ? (
                          <Chip size="small" icon={<BoltRoundedIcon sx={{ fontSize: 12 }} />}
                            title={`Inestable · estabilidad ${fl.stabilityPct}% (pasa y falla entre corridas)`}
                            label={`Flaky ${fl.stabilityPct}%`}
                            sx={{ height: 18, bgcolor: T.warning.bg, color: T.warning.text, fontWeight: 700, '& .MuiChip-label': { fontSize: 10, px: 0.75 }, '& .MuiChip-icon': { color: T.warning.text } }} />
                        ) : null;
                      })()}
                      {r.requirement && (
                        <Chip size="small" variant="outlined" icon={<LinkRoundedIcon sx={{ fontSize: 12 }} />}
                          title={`Requisito: ${r.requirement}`}
                          label={r.requirement}
                          sx={{ height: 18, maxWidth: 180, color: T.primary.main, borderColor: T.primary.tintBorder, '& .MuiChip-label': { fontSize: 10 }, '& .MuiChip-icon': { color: T.primary.main } }} />
                      )}
                    </Stack>
                    <Typography variant="caption" sx={{ color: T.text.muted, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }} noWrap title={specFileName(r.name)}>{specFileName(r.name)}</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: T.text.secondary }}>{steps.length || (r.status === 'ready' ? '—' : '—')}</Typography>
                  <Typography variant="body2" sx={{ color: r.lastResult ? T.text.secondary : T.text.muted }}>{r.lastResult ? formatRunTime(r.lastResult.runAt) : '—'}</Typography>
                  <Box>{resultChip(r)}</Box>
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                    {r.status === 'recording'
                      ? <Chip size="small" label="Grabando" sx={{ bgcolor: T.error.bg, color: T.error.text, fontWeight: 700 }} />
                      : r.status === 'ready'
                      ? (
                        <Button size="small" variant="outlined" startIcon={runningId === r.id ? <CircularProgress size={13} /> : <PlayArrowRoundedIcon />}
                          disabled={runningId === r.id}
                          onClick={(e) => { e.stopPropagation(); runFlow(r.id); }}>
                          Ejecutar
                        </Button>
                      )
                      : (
                        // Flujo creado sin grabar: el botón principal es Grabar (no un Ejecutar deshabilitado).
                        <Button size="small" variant="contained" disabled={recordingActive}
                          startIcon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#fff', opacity: 0.9 }} />}
                          onClick={(e) => { e.stopPropagation(); reRecord(r.id); }}>
                          Grabar
                        </Button>
                      )}
                    <RowMenu ariaLabel={`Acciones de ${r.name}`} actions={[
                      { label: 'Ver y editar código', icon: <CodeRoundedIcon fontSize="small" />, disabled: r.status !== 'ready', onClick: () => openCode(r.id) },
                      { label: 'Mejorar con IA', icon: <AutoAwesomeRoundedIcon fontSize="small" />, disabled: r.status !== 'ready' || enhancingId === r.id, onClick: () => enhanceAi(r.id) },
                      { label: 'Sugerir casos (IA)', icon: <TipsAndUpdatesRoundedIcon fontSize="small" />, disabled: r.status !== 'ready' || suggestingId === r.id, onClick: () => aiSuggest(r.id, r.name) },
                      { label: 'Volver a grabar', icon: <ReplayRoundedIcon fontSize="small" />, disabled: recordingActive, onClick: () => reRecord(r.id) },
                      { label: 'Historial', icon: <HistoryRoundedIcon fontSize="small" />, onClick: () => setDrawer({ scope: 'flow', flowId: r.id }) },
                      { label: 'Aserciones', icon: <FactCheckRoundedIcon fontSize="small" />, onClick: () => openAssertions(r) },
                      { label: 'Agregar a suite', icon: <LayersRoundedIcon fontSize="small" />, onClick: () => setAddToSuiteRec(r) },
                      { label: 'Renombrar', icon: <EditRoundedIcon fontSize="small" />, onClick: () => openRenameFlow(r.id, r.name) },
                      { label: 'Ligar requisito', icon: <LinkRoundedIcon fontSize="small" />, onClick: () => openRequirement(r.id, r.requirement) },
                      { label: 'Eliminar', icon: <DeleteOutlineRoundedIcon fontSize="small" />, danger: true, onClick: () => setDeleteId(r.id) },
                    ]} />
                  </Stack>
                </Box>

                {/* expandido */}
                {open && (
                  <Box sx={{ px: 2, pb: 2, pt: 0.5, bgcolor: T.surface.subtle }}>
                    {/* resumen de corrida */}
                    {(() => {
                      if (!r.lastResult) return (
                        <Box sx={{ p: 1.5, borderRadius: 1, border: `1px solid ${T.border.card}`, bgcolor: T.surface.card, mb: 1.5 }}>
                          <Typography variant="body2" fontWeight={700}>Este flujo no se ha ejecutado</Typography>
                          <Typography variant="caption" color="text.secondary">Ejecútalo para generar salida, capturas y el reporte PDF.</Typography>
                        </Box>
                      );
                      const ok = r.lastResult.ok;
                      const msg = failMessage(r.lastResult.output);
                      return (
                        <Box sx={{ p: 1.5, borderRadius: 1, mb: 1.5, border: `1px solid ${ok ? T.success.border : T.error.border}`, bgcolor: ok ? T.success.bg : T.error.bg }}>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            {ok ? <CheckCircleRoundedIcon fontSize="small" sx={{ color: T.success.text }} /> : <CancelRoundedIcon fontSize="small" sx={{ color: T.error.text }} />}
                            <Typography variant="body2" fontWeight={700} sx={{ color: ok ? T.success.text : T.error.text }}>
                              {ok ? `${r.lastResult.passed} pasos correctos · sin fallos` : `${r.lastResult.passed} pasos correctos · ${r.lastResult.failed} fallo(s)`}
                            </Typography>
                            <Box flex={1} />
                            <Typography variant="caption" sx={{ color: ok ? T.success.text : T.error.text, opacity: 0.85 }}>{formatRunTime(r.lastResult.runAt)}</Typography>
                          </Stack>
                          {!ok && msg && <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: T.error.text, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>{msg}</Typography>}
                          {!!r.lastResult.healed?.length && (
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>
                              <Chip size="small" icon={<BoltRoundedIcon sx={{ fontSize: 13 }} />}
                                title={`Selectores auto-curados en esta corrida:\n${r.lastResult.healed.join('\n')}`}
                                label={`${r.lastResult.healed.length} selector(es) auto-curado(s)`}
                                sx={{ height: 20, bgcolor: T.warning.bg, color: T.warning.text, fontWeight: 700, '& .MuiChip-icon': { color: T.warning.text } }} />
                              <Typography variant="caption" color="text.secondary">
                                Pasó gracias a un selector alternativo — conviene persistirlo (subpestaña Selectores).
                              </Typography>
                            </Stack>
                          )}
                          {r.lastResult.hasTrace && (
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                              <Button size="small" variant="contained" color={ok ? 'primary' : 'error'} startIcon={<VisibilityRoundedIcon />}
                                onClick={async () => {
                                  try { await api.post(`/e2e/${r.id}/trace/open?${buildSelectionQuery(selected)}`); onNotify('Abriendo el visor de traza… (tarda unos segundos)', 'info'); }
                                  catch { onNotify('No se pudo abrir el visor de traza.', 'error'); }
                                }}>
                                Ver traza
                              </Button>
                              <Button size="small" variant="outlined" color="error" startIcon={<DownloadRoundedIcon />}
                                onClick={() => { const a = document.createElement('a'); a.href = `/api/e2e/${r.id}/trace.zip?${buildSelectionQuery(selected)}`; a.download = `trace-${slug(r.name)}.zip`; a.click(); }}>
                                Descargar
                              </Button>
                              <Typography variant="caption" color="text.secondary">
                                "Ver traza" abre el visor de Playwright con el paso a paso de lo que hizo el navegador.
                              </Typography>
                            </Stack>
                          )}
                          {r.lastResult.assertionResults && r.lastResult.assertionResults.length > 0 && (
                            <Stack spacing={0.25} sx={{ mt: 0.75 }}>
                              {r.lastResult.assertionResults.map((a) => (
                                <Stack key={a.id} direction="row" spacing={0.75} alignItems="center">
                                  {a.ok ? <CheckCircleRoundedIcon sx={{ fontSize: 15, color: T.success.text }} /> : <CancelRoundedIcon sx={{ fontSize: 15, color: T.error.text }} />}
                                  <Typography variant="caption" sx={{ color: a.ok ? T.success.text : T.error.text }}>
                                    {assertionLabel(a)}
                                  </Typography>
                                </Stack>
                              ))}
                            </Stack>
                          )}
                        </Box>
                      );
                    })()}

                    {/* sub-tabs artefactos */}
                    <Tabs value={tab} onChange={(_e, v: ArtifactTab) => setSubTab((s) => ({ ...s, [r.id]: v }))} sx={{ minHeight: 36, mb: 1 }}>
                      <Tab value="pasos" label={`Pasos${steps.length ? ` (${steps.length})` : ''}`} sx={{ minHeight: 36, textTransform: 'none' }} />
                      <Tab value="salida" label="Salida" sx={{ minHeight: 36, textTransform: 'none' }} />
                      <Tab value="capturas" label={`Capturas${shots.length ? ` (${shots.length})` : ''}`} sx={{ minHeight: 36, textTransform: 'none' }} />
                      <Tab value="pdf" label="Reporte PDF" sx={{ minHeight: 36, textTransform: 'none' }} />
                      <Tab value="selectores" label={`Selectores${locHealth[r.id] ? ` (${locHealth[r.id].length})` : ''}`} sx={{ minHeight: 36, textTransform: 'none' }} />
                    </Tabs>

                    {tab === 'pasos' && (
                      steps.length === 0
                        ? <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Sin pasos — graba el flujo para generar el spec.</Typography>
                        : <Stack spacing={0.5}>
                          {steps.map((st, i) => (
                            <Stack key={i} direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.75, borderRadius: 1, bgcolor: T.surface.card, border: `1px solid ${T.border.divider}` }}>
                              <Typography variant="caption" sx={{ color: T.text.muted, width: 20, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</Typography>
                              <Chip size="small" label={st.kind} sx={{ height: 20, fontSize: 11, fontWeight: 700, color: KIND_COLOR[st.kind], bgcolor: `${KIND_COLOR[st.kind]}1A` }} />
                              <Typography variant="body2" noWrap title={st.target} sx={{ flex: 1, minWidth: 0 }}>{st.target}</Typography>
                              {st.value && <Chip size="small" label={st.value} title={st.value} sx={{ height: 20, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, maxWidth: 220, bgcolor: T.surface.subtle }} />}
                            </Stack>
                          ))}
                        </Stack>
                    )}

                    {tab === 'salida' && (
                      r.lastResult?.output
                        ? <Box>
                          <Box component="pre" sx={{ m: 0, p: 1.5, maxHeight: 280, overflow: 'auto', bgcolor: LOG_BG, border: `1px solid ${LOG_BORDER}`, borderRadius: 1, color: LOG_TEXT, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>{r.lastResult.output}</Box>
                          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                            <Button size="small" variant="outlined" startIcon={<ContentCopyRoundedIcon />} onClick={() => copyText(r.lastResult!.output)}>Copiar salida</Button>
                            <Button size="small" variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={() => download(r.lastResult!.output, `${slug(r.name)}.log`)}>Descargar log</Button>
                          </Stack>
                        </Box>
                        : <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Sin salida — el flujo no se ha ejecutado.</Typography>
                    )}

                    {tab === 'capturas' && (
                      shots.length === 0
                        ? <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Sin capturas · Las capturas se generan al ejecutar el flujo.</Typography>
                        : <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1.5 }}>
                          {shots.map((file) => {
                            const label = file.replace('.png', '').replace('step_', 'Paso ');
                            return (
                              <Box key={file} sx={{ cursor: 'pointer', border: `1px solid ${T.border.card}`, borderRadius: 1, overflow: 'hidden', bgcolor: T.surface.card, ...cardHoverSx }} onClick={() => setLightbox({ src: shotUrl(r.id, file), label })}>
                                <Box component="img" src={shotUrl(r.id, file)} alt={label} sx={{ width: '100%', height: 132, objectFit: 'cover', display: 'block' }} />
                                <Typography variant="caption" sx={{ display: 'block', px: 1, py: 0.5, color: T.text.secondary }}>{label}</Typography>
                              </Box>
                            );
                          })}
                        </Box>
                    )}

                    {tab === 'pdf' && (
                      r.lastResult
                        ? <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.5, borderRadius: 1, border: `1px solid ${T.border.card}`, bgcolor: T.surface.card }}>
                          <Chip label="PDF" size="small" sx={{ bgcolor: T.error.bg, color: T.error.text, fontWeight: 700 }} />
                          <Typography variant="body2" color="text.secondary">Reporte de la última ejecución · se arma al momento, no ocupa espacio.</Typography>
                          <Box flex={1} />
                          {pdfBusy === r.id
                            ? <Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={16} /><Typography variant="caption" color="text.secondary">Generando…</Typography></Stack>
                            : <>
                              <Button size="small" variant="contained" color="success" startIcon={<DownloadRoundedIcon />} onClick={() => generarReporte(r, 'descargar')}>Descargar PDF</Button>
                              <Button size="small" variant="outlined" startIcon={<PictureAsPdfRoundedIcon />} onClick={() => generarReporte(r, 'ver')}>Ver PDF</Button>
                            </>}
                        </Stack>
                        : <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>Sin reporte todavía · Ejecutá el flujo para generar el reporte.</Typography>
                    )}

                    {tab === 'selectores' && (() => {
                      const findings = locHealth[r.id];
                      const busy = locBusy === r.id;
                      if (findings === undefined) {
                        return (
                          <Stack spacing={1} sx={{ py: 1.5 }}>
                            <Typography variant="body2" color="text.secondary">
                              Revisa qué selectores del flujo son frágiles (ids autogenerados, XPath, posición, clases hasheadas) y aplica alternativas robustas (getByRole/getByLabel/getByText).
                            </Typography>
                            <Box>
                              <Button size="small" variant="outlined" disabled={busy || r.status !== 'ready'}
                                startIcon={busy ? <CircularProgress size={14} /> : <BoltRoundedIcon />}
                                onClick={() => analyzeLoc(r.id)}>
                                {busy ? 'Analizando…' : 'Analizar selectores'}
                              </Button>
                            </Box>
                          </Stack>
                        );
                      }
                      const fixable = findings.filter((f) => f.autoFixable).length;
                      return (
                        <Stack spacing={1} sx={{ py: 0.5 }}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography variant="body2" fontWeight={700}>
                              {findings.length === 0 ? 'Sin selectores frágiles 🎉' : `${findings.length} selector(es) por mejorar`}
                            </Typography>
                            <Box flex={1} />
                            <Button size="small" variant="text" disabled={busy} onClick={() => analyzeLoc(r.id)}>Reanalizar</Button>
                            {fixable > 0 && (
                              <Button size="small" variant="contained" disabled={busy}
                                startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeRoundedIcon />}
                                onClick={() => healLoc(r.id)}>
                                Aplicar {fixable} sugerencia(s) segura(s)
                              </Button>
                            )}
                          </Stack>
                          <Stack spacing={0.5}>
                            {findings.map((f, i) => (
                              <Box key={i} sx={{ p: 1, borderRadius: 1, bgcolor: T.surface.card, border: `1px solid ${T.border.divider}` }}>
                                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                  <Chip size="small" label={f.severity === 'alto' ? 'Alto' : 'Medio'}
                                    sx={{ height: 18, fontWeight: 700, bgcolor: f.severity === 'alto' ? T.error.bg : T.warning.bg, color: f.severity === 'alto' ? T.error.text : T.warning.text }} />
                                  <Typography variant="caption" sx={{ color: T.text.muted }}>L{f.line}</Typography>
                                  <Typography variant="body2" sx={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, wordBreak: 'break-all', flex: 1, minWidth: 0 }}>
                                    .{f.method}('{f.original}')
                                  </Typography>
                                  {f.autoFixable && <Chip size="small" label="auto" sx={{ height: 16, fontSize: 10, bgcolor: T.success.bg, color: T.success.text }} />}
                                </Stack>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{f.reason}</Typography>
                                {f.suggestion && (
                                  <Typography variant="caption" sx={{ display: 'block', color: T.primary.main, fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>→ {f.suggestion}</Typography>
                                )}
                              </Box>
                            ))}
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            "Aplicar" reescribe solo los <code>.locator()</code> con reemplazo seguro derivable; el resto queda como sugerencia para revisar. Corré el flujo después para validar.
                          </Typography>
                        </Stack>
                      );
                    })()}

                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {loading && <RowsSkeleton rows={5} height={56} />}

      {/* ── Modal editor de código ── */}
      <Dialog open={!!codeId} onClose={() => setCodeId(null)} maxWidth="lg" fullWidth PaperProps={{ sx: { height: '82vh' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CodeRoundedIcon fontSize="small" />
          <Typography component="span" fontWeight={700}>{recordings.find((r) => r.id === codeId)?.name}</Typography>
          <Typography component="span" variant="caption" sx={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', color: T.text.muted }}>· {codeId ? specFileName(recordings.find((r) => r.id === codeId)?.name ?? '') : ''} · {codeDraft.split('\n').length} líneas</Typography>
          {codeSavedFlag
            ? <Chip size="small" label="✓ Guardado" sx={{ bgcolor: T.success.bg, color: T.success.text }} />
            : (codeId && codeDraft !== (specById[codeId] ?? '')) ? <Chip size="small" label="Cambios sin guardar" sx={{ bgcolor: T.warning.bg, color: T.warning.text }} /> : null}
          <Box flex={1} />
          <Tooltip title="Copiar"><IconButton size="small" aria-label="Copiar código" onClick={() => copyText(codeDraft)}><ContentCopyRoundedIcon fontSize="small" /></IconButton></Tooltip>
          <IconButton size="small" aria-label="Cerrar" onClick={() => setCodeId(null)}><CloseRoundedIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <TextField value={codeDraft} onChange={(e) => { setCodeDraft(e.target.value); setCodeSavedFlag(false); }} multiline fullWidth
            spellCheck={false}
            InputProps={{ sx: { height: '100%', alignItems: 'flex-start', bgcolor: LOG_BG, color: LOG_TEXT, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13, lineHeight: 1.75, borderRadius: 0 } }}
            sx={{ height: '100%', '& .MuiOutlinedInput-notchedOutline': { border: 'none' }, '& textarea': { height: '100% !important' } }} />
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, borderTop: `1px solid ${T.border.divider}` }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>Editar el código no altera los pasos grabados; manda lo que se ejecuta.</Typography>
          <Button onClick={() => { if (codeId) setCodeDraft(specById[codeId] ?? ''); setCodeSavedFlag(false); }} disabled={!codeId || codeDraft === (specById[codeId ?? ''] ?? '')}>Descartar</Button>
          <Button variant="outlined" onClick={() => saveCode(false)} disabled={savingCode || !codeId || codeDraft === (specById[codeId ?? ''] ?? '')}>Guardar cambios</Button>
          <Button variant="contained" color="success" startIcon={<PlayArrowRoundedIcon />} onClick={() => saveCode(true)} disabled={savingCode}>Guardar y ejecutar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Modal IA (diff) ── */}
      <Dialog open={!!enhanced} onClose={() => !acceptingAi && setEnhanced(null)} maxWidth="xl" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><AutoAwesomeRoundedIcon color="success" /> Spec mejorado por IA — revisá antes de guardar</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>ORIGINAL</Typography>
              <Box component="pre" sx={{ m: 0, mt: 0.5, p: 1.5, height: 420, overflow: 'auto', bgcolor: LOG_BG, color: LOG_TEXT, borderRadius: 1, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>{enhanced?.original}</Box>
            </Box>
            <Box>
              <Typography variant="caption" color="success.main" fontWeight={700}>MEJORADO CON IA</Typography>
              <Box component="pre" sx={{ m: 0, mt: 0.5, p: 1.5, height: 420, overflow: 'auto', bgcolor: LOG_BG, color: LOG_TEXT, borderRadius: 1, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, whiteSpace: 'pre-wrap' }}>{enhanced?.enhanced}</Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnhanced(null)} disabled={acceptingAi}>Cancelar</Button>
          <Button variant="contained" color="success" onClick={acceptAi} disabled={acceptingAi}>{acceptingAi ? 'Guardando…' : 'Guardar mejorado'}</Button>
        </DialogActions>
      </Dialog>

      {/* ── Modal IA (sugerencias de casos de borde) ── */}
      <Dialog open={!!suggestFlow} onClose={() => { if (!suggestingId) setSuggestFlow(null); }} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TipsAndUpdatesRoundedIcon color="primary" /> Casos sugeridos por IA — {suggestFlow?.name}
        </DialogTitle>
        <DialogContent>
          {suggestingId ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 4, justifyContent: 'center' }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">Generando sugerencias de casos de borde…</Typography>
            </Stack>
          ) : (suggestFlow?.suggestions.length ?? 0) === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">La IA no devolvió sugerencias — intentá de nuevo.</Typography>
            </Box>
          ) : (
            <Stack spacing={1.25} sx={{ mt: 0.5 }}>
              {suggestFlow?.suggestions.map((s, i) => {
                const prioSx = s.priority === 'alta'
                  ? { bgcolor: T.error.bg, color: T.error.text, borderColor: T.error.border }
                  : s.priority === 'media'
                  ? { bgcolor: T.warning.bg, color: T.warning.text, borderColor: T.warning.border }
                  : { bgcolor: T.surface.subtle, color: T.text.muted, borderColor: T.border.card };
                return (
                  <Box key={i} sx={{ p: 1.5, borderRadius: `${T.radius.card}px`, border: `1px solid ${T.border.card}`, bgcolor: T.surface.card }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography variant="body2" fontWeight={700} sx={{ flex: 1, minWidth: 0 }}>{s.title}</Typography>
                      <Chip size="small" color={EDGE_TYPE_COLOR[s.type]} label={EDGE_TYPE_LABEL[s.type]} sx={{ height: 20, fontWeight: 700 }} />
                      <Chip size="small" variant="outlined" label={s.priority} sx={{ height: 20, fontWeight: 700, textTransform: 'capitalize', ...prioSx }} />
                    </Stack>
                    {s.description && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{s.description}</Typography>
                    )}
                  </Box>
                );
              })}
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                Sugerencias generadas por IA — revisá y creá los flujos que apliquen.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuggestFlow(null)} disabled={!!suggestingId}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Confirmar borrado ── */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Eliminar flujo</DialogTitle>
        <DialogContent><Typography color="text.secondary">Se eliminará el flujo y su historial asociado.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={removeFlow}>Eliminar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Nuevo flujo (nombre) ── */}
      <Dialog open={newFlowOpen} onClose={() => setNewFlowOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nuevo flujo E2E</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Grabalo ahora, o dejalo creado y grabalo después con el botón "Grabar" de la fila.
          </Typography>
          <TextField autoFocus fullWidth label="Nombre del flujo" value={newFlowName}
            error={!!newFlowName.trim() && flowNameExists(newFlowName)}
            helperText={!!newFlowName.trim() && flowNameExists(newFlowName) ? 'Ya existe un flujo con ese nombre' : ' '}
            onChange={(e) => setNewFlowName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newFlowName.trim() && !flowNameExists(newFlowName)) startRecordingNewFlow(newFlowName); }} sx={{ mt: 0.5 }} />
          <TextField select fullWidth label="Tipo de flujo" value={newFlowTipo}
            onChange={(e) => setNewFlowTipo(e.target.value as 'crear' | 'editar' | 'consultar' | 'otro')}
            helperText="Define las reglas del replay: data de prueba y selección de registro."
            sx={{ mt: 1 }}>
            <MenuItem value="crear">Crear — inserta data de prueba (QA + fecha)</MenuItem>
            <MenuItem value="editar">Editar — edita el registro de prueba creado</MenuItem>
            <MenuItem value="consultar">Consultar — toma el primer registro, sin data</MenuItem>
            <MenuItem value="otro">Otro — sin reglas especiales</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFlowOpen(false)}>Cancelar</Button>
          <Button variant="outlined" disabled={!newFlowName.trim() || flowNameExists(newFlowName)} onClick={() => createFlowOnly(newFlowName)}>Solo crear</Button>
          <Button variant="contained" disabled={!newFlowName.trim() || flowNameExists(newFlowName) || !effectiveUrl} onClick={() => startRecordingNewFlow(newFlowName)}
            startIcon={<Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: '#fff', opacity: 0.9 }} />}>Crear y grabar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Renombrar flujo ── */}
      <Dialog open={!!renameId} onClose={() => setRenameId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Renombrar flujo</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Nuevo nombre" value={renameVal}
            error={!!renameVal.trim() && flowNameExists(renameVal, renameId ?? undefined)}
            helperText={!!renameVal.trim() && flowNameExists(renameVal, renameId ?? undefined) ? 'Ya existe un flujo con ese nombre' : ' '}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && renameVal.trim() && !flowNameExists(renameVal, renameId ?? undefined)) renameFlow(); }} sx={{ mt: 0.5 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameId(null)}>Cancelar</Button>
          <Button variant="contained" onClick={renameFlow} disabled={!renameVal.trim() || flowNameExists(renameVal, renameId ?? undefined)}>Renombrar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Ligar requisito ── */}
      <Dialog open={!!reqId} onClose={() => setReqId(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><LinkRoundedIcon color="primary" /> Ligar requisito</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Asocia este flujo a un requisito (HU, ticket, Jira…) para reportar la cobertura por requisito.
          </Typography>
          <TextField autoFocus fullWidth label="Referencia de requisito" placeholder="Ej. HU-123" value={reqVal}
            onChange={(e) => setReqVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveRequirement(); }} sx={{ mt: 0.5 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReqId(null)}>Cancelar</Button>
          <Button variant="contained" onClick={saveRequirement}>Guardar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Lightbox ── */}
      <Dialog open={!!assertRec} onClose={() => setAssertRec(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><FactCheckRoundedIcon color="primary" /> Aserciones — {assertRec?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Al final del flujo se verifica cada aserción. Si alguna no se cumple, el flujo queda "Falló por aserción".
          </Typography>
          <Stack spacing={1}>
            {assertList.length === 0 && <Typography variant="caption" color="text.secondary">Aún no hay aserciones. Agrega la primera.</Typography>}
            {assertList.map((a) => {
              const ph = a.type === 'appears' || a.type === 'not-appears' ? 'Texto, ej. "Guardado con éxito"'
                : a.type === 'url-contains' ? 'Fragmento de URL, ej. "consultar"'
                : a.type === 'title-contains' ? 'Parte del título'
                : a.type === 'count' ? 'Número, ej. 15'
                : 'Valor esperado';
              return (
              <Stack key={a.id} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <TextField select size="small" value={a.type} onChange={(e) => updateAssertion(a.id, { type: e.target.value as E2eAssertionType })} sx={{ minWidth: 165 }}>
                  {ASSERT_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                {a.type === 'value' && (
                  <TextField size="small" placeholder="Campo (etiqueta)" value={a.target ?? ''} onChange={(e) => updateAssertion(a.id, { target: e.target.value })} sx={{ minWidth: 150 }} />
                )}
                {a.type === 'count' && (
                  <TextField select size="small" value={a.op ?? 'atLeast'} onChange={(e) => updateAssertion(a.id, { op: e.target.value as 'atLeast' | 'exact' })} sx={{ minWidth: 110 }}>
                    <MenuItem value="atLeast">Al menos</MenuItem>
                    <MenuItem value="exact">Exacto</MenuItem>
                  </TextField>
                )}
                <TextField size="small" sx={{ flex: 1, minWidth: 140 }} type={a.type === 'count' ? 'number' : 'text'} placeholder={ph} value={a.text} onChange={(e) => updateAssertion(a.id, { text: e.target.value })} />
                <IconButton size="small" onClick={() => removeAssertion(a.id)} aria-label="Quitar"><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
              </Stack>
              );
            })}
          </Stack>
          <Button size="small" startIcon={<AddRoundedIcon />} onClick={addAssertion} sx={{ mt: 1.5 }}>Agregar aserción</Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssertRec(null)}>Cancelar</Button>
          <Button variant="contained" onClick={saveAssertions} disabled={savingAssert}>{savingAssert ? 'Guardando…' : 'Guardar'}</Button>
        </DialogActions>
      </Dialog>

      {/* Agregar a suite (diálogo compartido, tipo e2e) */}
      <AddToSuiteDialog
        open={!!addToSuiteRec}
        tipo="e2e"
        test={addToSuiteRec ? { module: selected.moduleName, submodule: selected.submoduleName, page: selected.pageName, id: addToSuiteRec.id, name: addToSuiteRec.name } : null}
        onClose={() => { setAddToSuiteRec(null); loadSuiteMembership(); }}
        onNotify={onNotify}
      />

      <Dialog open={!!lightbox} onClose={() => setLightbox(null)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {lightbox?.label}
          <Box flex={1} />
          <Button size="small" startIcon={<DownloadRoundedIcon />} component="a" href={lightbox?.src ?? ''} download>Descargar</Button>
          <IconButton size="small" aria-label="Cerrar" onClick={() => setLightbox(null)}><CloseRoundedIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent><Box component="img" src={lightbox?.src ?? ''} alt={lightbox?.label ?? ''} sx={{ width: '100%', display: 'block' }} /></DialogContent>
      </Dialog>

      {/* ── Drawer historial ── */}
      <Drawer anchor="right" open={!!drawer} onClose={() => setDrawer(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: 2 } }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <HistoryRoundedIcon fontSize="small" />
          <Box>
            <Typography variant="subtitle1" fontWeight={800}>Historial de pruebas</Typography>
            <Typography variant="caption" color="text.secondary">
              {drawer?.scope === 'flow' ? `Flujo · ${recordings.find((r) => r.id === drawer.flowId)?.name ?? ''}` : 'Todas las pruebas de esta página'}
            </Typography>
          </Box>
          <Box flex={1} />
          <IconButton size="small" aria-label="Cerrar" onClick={() => setDrawer(null)}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
        {/* Contexto del historial (cliente + entorno), mostrado una sola vez: por eso no se repite en las filas. */}
        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} alignItems="center" flexWrap="wrap" useFlexGap>
          {currentEmpresa && (
            <Chip size="small" icon={<BusinessRoundedIcon sx={{ fontSize: 15 }} />} label={currentEmpresa}
              sx={{ bgcolor: T.primary.tint, color: T.primary.main, fontWeight: 700, border: `1px solid ${T.primary.tintBorder}` }} />
          )}
          {currentEntorno && (
            <Chip size="small" label={currentEntorno}
              sx={{ bgcolor: T.surface.subtle, color: T.text.secondary, fontWeight: 700, border: `1px solid ${T.border.card}` }} />
          )}
          <TextField select size="small" label="Resultado" value={fResult} onChange={(e) => setFResult(e.target.value)} SelectProps={{ native: true }} sx={{ minWidth: 120 }}>
            <option value="todos">Todos</option>
            <option value="paso">Pasó</option>
            <option value="fallo">Falló</option>
          </TextField>
        </Stack>
        <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
          <Box><Typography variant="h6" fontWeight={800}>{filteredRuns.length}</Typography><Typography variant="caption" color="text.secondary">Corridas</Typography></Box>
          <Box><Typography variant="h6" fontWeight={800} sx={{ color: T.success.text }}>{filteredRuns.filter((r) => r.ok).length}</Typography><Typography variant="caption" color="text.secondary">Pasaron</Typography></Box>
          <Box><Typography variant="h6" fontWeight={800} sx={{ color: filteredRuns.some((r) => !r.ok) ? T.error.text : T.text.muted }}>{filteredRuns.filter((r) => !r.ok).length}</Typography><Typography variant="caption" color="text.secondary">Fallaron</Typography></Box>
        </Stack>
        {runsLoading && filteredRuns.length === 0
          ? <RowsSkeleton rows={4} height={40} />
          : filteredRuns.length === 0
          ? <Typography variant="body2" color="text.secondary">Sin ejecuciones · Ninguna corrida coincide con estos filtros.</Typography>
          : <Stack spacing={1}>
            {filteredRuns.map((run, i) => {
              const rowKey = run.id ?? String(i);
              // Solo el origen persistido trae detalle; sin él, la fila no se expande (nada que mostrar).
              const tieneDetalle = !!(run.assertResults?.length || run.output || run.entorno || run.tipo);
              const abierta = expandedRun === rowKey;
              return (
              <Box key={rowKey} sx={{ borderRadius: 1, border: `1px solid ${run.ok ? T.border.card : T.error.border}`, bgcolor: run.ok ? T.surface.card : T.error.bg, overflow: 'hidden' }}>
                {/* Resumen glanceable — clic para abrir el detalle (progressive disclosure) */}
                <Box
                  role={tieneDetalle ? 'button' : undefined}
                  tabIndex={tieneDetalle ? 0 : undefined}
                  aria-expanded={tieneDetalle ? abierta : undefined}
                  onClick={tieneDetalle ? () => setExpandedRun(abierta ? null : rowKey) : undefined}
                  onKeyDown={tieneDetalle ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedRun(abierta ? null : rowKey); } } : undefined}
                  sx={{ p: 1.25, cursor: tieneDetalle ? 'pointer' : 'default', transition: `background-color 120ms ${EASE_OUT}`, ...(tieneDetalle ? { '@media (hover: hover)': { '&:hover': { bgcolor: T.surface.hover } }, '&:focus-visible': { outline: '2px solid', outlineColor: T.primary.main, outlineOffset: '-2px' } } : {}), '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    {tieneDetalle && <KeyboardArrowRightRoundedIcon fontSize="small" sx={{ color: T.text.muted, ...disclosureSpinSx(abierta) }} />}
                    {run.ok ? <Chip size="small" label="Pasó" sx={{ bgcolor: T.success.bg, color: T.success.text, fontWeight: 700 }} /> : <Chip size="small" label="Falló" sx={{ bgcolor: T.error.bg, color: T.error.text, fontWeight: 700 }} />}
                    <Typography variant="body2" fontWeight={700} noWrap sx={{ flex: 1, minWidth: 0 }} title={run.flowName}>{run.flowName}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatRunTime(run.runAt)}</Typography>
                  </Stack>
                  {/* Cliente y entorno NO se repiten acá: son el contexto del historial (van en el header). */}
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5, pl: tieneDetalle ? 3 : 0 }} alignItems="center" flexWrap="wrap" useFlexGap>
                    {run.sucursal && <Chip size="small" variant="outlined" label={run.sucursal} sx={{ height: 20 }} />}
                    {run.tipo && <Chip size="small" variant="outlined" label={run.tipo} sx={{ height: 20, textTransform: 'capitalize' }} />}
                    {run.assertTotal != null && run.assertTotal > 0 && (
                      <Chip size="small" variant="outlined" icon={<FactCheckRoundedIcon sx={{ fontSize: 13 }} />}
                        label={`${run.assertTotal - (run.assertFailed ?? 0)}/${run.assertTotal} aserciones`}
                        sx={{ height: 20, color: (run.assertFailed ?? 0) > 0 ? T.error.text : T.success.text }} />
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {run.ok
                        ? `${run.stepCount ?? run.passed} pasos ok`
                        : `${run.passed} ok · ${run.failed} fallo`}
                    </Typography>
                  </Stack>
                </Box>
                {/* Detalle — sólo se monta al expandir */}
                {tieneDetalle && (
                  <Collapse in={abierta} unmountOnExit>
                    <Box sx={{ px: 1.25, pb: 1.25, pt: 0.5, borderTop: `1px dashed ${run.ok ? T.border.divider : T.error.border}` }}>
                      {run.assertResults && run.assertResults.length > 0 && (
                        <Box sx={{ mb: run.output ? 1 : 0 }}>
                          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Aserciones</Typography>
                          <Stack spacing={0.5}>
                            {run.assertResults.map((a, ai) => (
                              <Stack key={a.id ?? ai} direction="row" alignItems="flex-start" spacing={0.75}>
                                {a.ok
                                  ? <CheckCircleRoundedIcon sx={{ fontSize: 15, color: T.success.text, mt: '1px' }} />
                                  : <CancelRoundedIcon sx={{ fontSize: 15, color: T.error.text, mt: '1px' }} />}
                                <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }}>{assertionLabel(a)}</Typography>
                              </Stack>
                            ))}
                          </Stack>
                        </Box>
                      )}
                      {run.output && (
                        <Box>
                          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Salida</Typography>
                          <Box sx={{ maxHeight: 220, overflow: 'auto', p: 1, borderRadius: 1, bgcolor: LOG_BG, border: `1px solid ${LOG_BORDER}` }}>
                            <Typography component="pre" sx={{ m: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, lineHeight: 1.5, color: LOG_TEXT, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{run.output}</Typography>
                          </Box>
                        </Box>
                      )}
                    </Box>
                  </Collapse>
                )}
              </Box>
              );
            })}
          </Stack>}
      </Drawer>
    </Stack>
  );
}
