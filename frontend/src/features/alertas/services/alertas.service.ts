import { apiClient, toResult } from '@/shared/services/http';
import type { OperationResult } from '@/shared/models/shared.model';
import type { AlertRow } from '@/features/alertas/models/alertas.model';

// Capa de servicio de Alertas: Axios centralizado + OperationResult, sin lógica de UI.

/** Alertas de fallos: flujos cuya corrida más reciente falló, con la racha de fallos. */
export const getAlerts = (): Promise<OperationResult<AlertRow[]>> =>
  toResult(
    () => apiClient.get<AlertRow[]>('/e2e/alerts'),
    undefined,
    'No se pudo cargar las alertas',
  );
