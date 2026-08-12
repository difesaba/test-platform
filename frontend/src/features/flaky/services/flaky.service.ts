import { apiClient, toResult } from '@/shared/services/http';
import type { OperationResult } from '@/shared/models/shared.model';
import type { FlakyRow } from '@/features/flaky/models/flaky.model';

// Capa de servicio de Flaky: Axios centralizado + OperationResult, sin lógica de UI.

/** Reporte de estabilidad: flujos con su historial reciente y bandera de flaky. */
export const getFlaky = (windowSize?: number): Promise<OperationResult<FlakyRow[]>> =>
  toResult(
    () => apiClient.get<FlakyRow[]>(`/e2e/flaky${windowSize ? `?window=${windowSize}` : ''}`),
    undefined,
    'No se pudo cargar el reporte de estabilidad',
  );
