import { useCallback, useEffect, useMemo, useState } from 'react';
import { getFlaky } from '@/features/flaky/services/flaky.service';
import type { FlakyRow, FlakyTotals } from '@/features/flaky/models/flaky.model';

interface UseFlaky {
  rows: FlakyRow[];
  totals: FlakyTotals;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Centraliza la carga del reporte de estabilidad y calcula los totales para la vista. */
export function useFlaky(): UseFlaky {
  const [rows, setRows] = useState<FlakyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await getFlaky();
    if (res.success && res.data) setRows(res.data);
    else { setError(res.error ?? 'No se pudo cargar el reporte de estabilidad'); setRows([]); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const totals = useMemo<FlakyTotals>(() => ({
    flows: rows.length,
    flaky: rows.filter((r) => r.flaky).length,
    stable: rows.filter((r) => !r.flaky && r.stabilityPct === 100).length,
    failing: rows.filter((r) => !r.flaky && r.stabilityPct === 0).length,
  }), [rows]);

  return { rows, totals, loading, error, reload };
}
