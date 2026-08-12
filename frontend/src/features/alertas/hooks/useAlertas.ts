import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAlerts } from '@/features/alertas/services/alertas.service';
import type { AlertRow, AlertTotals } from '@/features/alertas/models/alertas.model';

interface UseAlertas {
  rows: AlertRow[];
  totals: AlertTotals;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Centraliza la carga de las alertas de fallos y calcula los totales para la vista. */
export function useAlertas(): UseAlertas {
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await getAlerts();
    if (res.success && res.data) setRows(res.data);
    else { setError(res.error ?? 'No se pudo cargar las alertas'); setRows([]); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const totals = useMemo<AlertTotals>(() => ({
    alerts: rows.length,
  }), [rows]);

  return { rows, totals, loading, error, reload };
}
