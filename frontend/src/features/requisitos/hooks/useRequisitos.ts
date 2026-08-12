import { useCallback, useEffect, useMemo, useState } from 'react';
import { getRequirements } from '@/features/requisitos/services/requisitos.service';
import type { RequirementRow, RequirementTotals } from '@/features/requisitos/models/requisitos.model';

const NO_REQ = '(sin requisito)';

interface UseRequisitos {
  rows: RequirementRow[];
  totals: RequirementTotals;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Centraliza la carga del reporte de trazabilidad y calcula los totales para la vista. */
export function useRequisitos(): UseRequisitos {
  const [rows, setRows] = useState<RequirementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await getRequirements();
    if (res.success && res.data) setRows(res.data);
    else { setError(res.error ?? 'No se pudo cargar la trazabilidad'); setRows([]); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const totals = useMemo<RequirementTotals>(() => {
    const real = rows.filter((r) => r.requirement !== NO_REQ);
    return {
      requirements: real.length,
      flows: real.reduce((acc, r) => acc + r.total, 0),
      fullyCovered: real.filter((r) => r.passing === r.total && r.total > 0).length,
    };
  }, [rows]);

  return { rows, totals, loading, error, reload };
}
