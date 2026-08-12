import { useCallback, useEffect, useState } from 'react';
import { getDashboard } from '@/features/dashboard/services/dashboard.service';
import type { DashboardSummary } from '@/features/dashboard/models/dashboard.model';

interface UseDashboard {
  data: DashboardSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Centraliza la carga del resumen ejecutivo del dashboard para la ventana de `days` días. */
export function useDashboard(days: number): UseDashboard {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await getDashboard(days);
    if (res.success && res.data) setData(res.data);
    else { setError(res.error ?? 'No se pudo cargar el dashboard'); setData(null); }
    setLoading(false);
  }, [days]);

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, reload };
}
