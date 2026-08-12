import { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import PlaylistPlayRoundedIcon from '@mui/icons-material/PlaylistPlayRounded';
import { useSessionStore } from '@/shared/store/useSessionStore';
import { getEnvironmentMeta } from '@/shared/utils/platform';
import { getBatchClients, getBatchRuns, runBatch, deleteBatchRun } from '@/features/apiTests/services/batch';
import type { ApiTest, Client } from '@/shared/types/platform';

interface BatchResult {
  companyUrlRaiz: string;
  testId: string;
  ok: boolean;
  status: number;
  time: number;
  error?: string;
}

interface BatchRecord {
  id: string;
  timestamp: string;
  moduleContext: { module: string; submodule?: string; page?: string };
  companies: { urlRaiz: string; appName: string }[];
  testNames: Record<string, string>;
  results: BatchResult[];
  summary: { total: number; passed: number; failed: number };
}

interface BatchCompany {
  urlRaiz: string;
  appName: string;
  empNombre: string;
  entorno: string;
}

interface BatchSectionProps {
  tests: ApiTest[];
  moduleName: string;
  submodule?: string;
  page?: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

function ResultTable({ res, companies, testNamesMap }: {
  res: BatchResult[];
  companies: { urlRaiz: string; appName: string }[];
  testNamesMap: Record<string, string>;
}) {
  const testIds = [...new Set(res.map(r => r.testId))];
  return (
    <Box overflow="auto">
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Test</TableCell>
            {companies.map(c => (
              <TableCell key={c.urlRaiz} align="center" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                {c.appName}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {testIds.map(tid => (
            <TableRow key={tid}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{testNamesMap[tid] ?? tid}</TableCell>
              {companies.map(c => {
                const r = res.find(x => x.testId === tid && x.companyUrlRaiz === c.urlRaiz);
                if (!r) return <TableCell key={c.urlRaiz} align="center">—</TableCell>;
                return (
                  <TableCell key={c.urlRaiz} align="center">
                    <Tooltip title={r.error ?? `${r.status} · ${r.time}ms`}>
                      <Chip
                        label={r.error ? 'Error' : `${r.status}`}
                        color={r.ok ? 'success' : 'error'}
                        size="small"
                        variant="outlined"
                      />
                    </Tooltip>
                    {!r.error && (
                      <Typography variant="caption" display="block" color="text.secondary">{r.time}ms</Typography>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function BatchSection({ tests, moduleName, submodule, page }: BatchSectionProps) {
  const { urlRaiz, entornoNombre, empNombre, sucursal } = useSessionStore();

  const currentCompany: BatchCompany = {
    urlRaiz,
    appName: entornoNombre || urlRaiz,
    empNombre: empNombre || '',
    entorno: sucursal?.entorno ?? 'produccion',
  };

  const [allClients, setAllClients] = useState<Client[]>([]);
  const [history, setHistory] = useState<BatchRecord[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<BatchCompany[]>([currentCompany]);
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>(tests.map(t => t.id));
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    getBatchClients().then((res) => { if (res.success && res.data) setAllClients(res.data); });
    getBatchRuns().then((res) => { if (res.success && res.data) setHistory(res.data); });
  }, []);

  // Sync selected tests when parent updates the list
  useEffect(() => {
    setSelectedTestIds(tests.map(t => t.id));
  }, [tests.map(t => t.id).join(',')]);

  const toggleTest = (id: string) =>
    setSelectedTestIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleAll = () =>
    setSelectedTestIds(selectedTestIds.length === tests.length ? [] : tests.map(t => t.id));

  const addCompany = (client: Client | null) => {
    if (!client) return;
    const bc: BatchCompany = {
      urlRaiz: client.urlRaiz,
      appName: (client as any).appName ?? client.empresaNombre,
      empNombre: client.empNombre,
      entorno: client.entorno,
    };
    if (!selectedCompanies.find(c => c.urlRaiz === bc.urlRaiz))
      setSelectedCompanies(prev => [...prev, bc]);
  };

  const removeCompany = (u: string) => {
    if (u === currentCompany.urlRaiz) return;
    setSelectedCompanies(prev => prev.filter(c => c.urlRaiz !== u));
  };

  const handleRun = async () => {
    if (!selectedTestIds.length || !selectedCompanies.length) return;
    setRunning(true);
    setResults([]);
    try {
      const params = new URLSearchParams({ module: moduleName });
      if (submodule) params.set('submodule', submodule);
      if (page) params.set('page', page);
      const res = await runBatch(params.toString(), {
        testIds: selectedTestIds,
        companies: selectedCompanies.map(c => ({ urlRaiz: c.urlRaiz, appName: c.appName, empNombre: c.empNombre })),
        sourceUrlRaiz: urlRaiz,
      });
      if (res.success && res.data) {
        const payload = res.data;
        setResults(Array.isArray(payload) ? payload : payload.results ?? []);
        getBatchRuns().then((h) => { if (h.success && h.data) setHistory(h.data); });
      }
    } finally {
      setRunning(false);
    }
  };

  const deleteRecord = async (id: string) => {
    const res = await deleteBatchRun(id);
    if (res.success) {
      setHistory(prev => prev.filter(r => r.id !== id));
    }
  };

  const testNamesMap = Object.fromEntries(tests.map(t => [t.id, t.name]));
  const recentHistory = history
    .filter(r => r.moduleContext.module === moduleName
      && (r.moduleContext.submodule ?? undefined) === submodule
      && (r.moduleContext.page ?? undefined) === page)
    .slice(0, 5);

  return (
    <Accordion variant="outlined" sx={{ borderRadius: 2 }}>
      <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
        <Stack direction="row" spacing={1} alignItems="center">
          <PlaylistPlayRoundedIcon fontSize="small" color="action" />
          <Typography fontWeight={700}>Ejecutar en múltiples empresas</Typography>
          {recentHistory.length > 0 && (
            <Chip label={`${recentHistory.length} en historial`} size="small" variant="outlined" />
          )}
        </Stack>
      </AccordionSummary>

      <AccordionDetails>
        <Stack spacing={2.5}>

          {/* Tests a incluir */}
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
              <Typography variant="subtitle2" fontWeight={700}>
                Tests ({selectedTestIds.length}/{tests.length})
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={selectedTestIds.length === tests.length}
                    indeterminate={selectedTestIds.length > 0 && selectedTestIds.length < tests.length}
                    onChange={toggleAll}
                  />
                }
                label={<Typography variant="caption">Todos</Typography>}
              />
            </Stack>
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {tests.map(t => (
                <FormControlLabel
                  key={t.id}
                  control={<Checkbox size="small" checked={selectedTestIds.includes(t.id)} onChange={() => toggleTest(t.id)} />}
                  label={<Typography variant="body2">{t.name}</Typography>}
                />
              ))}
            </Stack>
          </Box>

          <Divider />

          {/* Empresas */}
          <Box>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>Empresas destino</Typography>
            <Stack spacing={0.75} mb={1}>
              {selectedCompanies.map(c => {
                const env = getEnvironmentMeta(c.entorno);
                const isCurrent = c.urlRaiz === currentCompany.urlRaiz;
                return (
                  <Stack key={c.urlRaiz} direction="row" spacing={1} alignItems="center">
                    <Chip
                      label={c.appName}
                      size="small"
                      color={isCurrent ? 'primary' : 'default'}
                      variant={isCurrent ? 'filled' : 'outlined'}
                      onDelete={isCurrent ? undefined : () => removeCompany(c.urlRaiz)}
                    />
                    <Chip label={env.label} color={env.color as any} size="small" variant="outlined" />
                    <Typography variant="caption" color="text.secondary" noWrap flex={1}>{c.empNombre}</Typography>
                  </Stack>
                );
              })}
            </Stack>
            <Autocomplete
              size="small"
              options={allClients.filter(c => !selectedCompanies.find(s => s.urlRaiz === c.urlRaiz))}
              getOptionLabel={c => `${(c as any).appName ?? c.empresaNombre} — ${c.empNombre}`}
              onChange={(_, v) => addCompany(v)}
              value={null}
              renderInput={p => <TextField {...p} label="Agregar empresa..." />}
              noOptionsText="Sin resultados"
            />
          </Box>

          <Button
            variant="contained"
            startIcon={running ? <CircularProgress size={16} color="inherit" /> : <PlayArrowRoundedIcon />}
            onClick={handleRun}
            disabled={running || !selectedTestIds.length || !selectedCompanies.length}
          >
            {running
              ? 'Ejecutando...'
              : `Ejecutar ${selectedTestIds.length} test${selectedTestIds.length !== 1 ? 's' : ''} en ${selectedCompanies.length} empresa${selectedCompanies.length !== 1 ? 's' : ''}`}
          </Button>

          {/* Resultados actuales */}
          {results.length > 0 && (
            <>
              <Divider />
              <Typography variant="subtitle2" fontWeight={700}>Resultados</Typography>
              <ResultTable res={results} companies={selectedCompanies} testNamesMap={testNamesMap} />
            </>
          )}

          {/* Historial reciente */}
          {recentHistory.length > 0 && (
            <>
              <Divider />
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2" fontWeight={700}>
                  Historial reciente ({recentHistory.length})
                </Typography>
                <Button size="small" onClick={() => setShowHistory(v => !v)}>
                  {showHistory ? 'Ocultar' : 'Ver'}
                </Button>
              </Stack>
              {showHistory && (
                <Stack spacing={0}>
                  {recentHistory.map(record => (
                    <Box key={record.id}>
                      <Stack direction="row" alignItems="center" spacing={1} py={1}>
                        <Box flex={1} minWidth={0}>
                          <Typography variant="body2" color="text.secondary">
                            {fmtDate(record.timestamp)} · {record.companies.length} empresa{record.companies.length !== 1 ? 's' : ''} · {record.summary.passed}/{record.summary.total} ✅
                          </Typography>
                        </Box>
                        <Tooltip title="Eliminar">
                          <IconButton size="small" onClick={() => deleteRecord(record.id)}>
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                      <ResultTable
                        res={record.results}
                        companies={record.companies}
                        testNamesMap={record.testNames}
                      />
                      <Divider sx={{ mt: 1 }} />
                    </Box>
                  ))}
                </Stack>
              )}
            </>
          )}

        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
