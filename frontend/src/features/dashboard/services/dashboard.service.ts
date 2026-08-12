import { apiClient, toResult } from '@/shared/services/http';
import type { OperationResult } from '@/shared/models/shared.model';
import type { HistoryReport, DashboardSummary } from '@/features/dashboard/models/dashboard.model';

// Capa de servicio del Dashboard: Axios centralizado + OperationResult, sin lógica de UI.

/** Histórico de ejecuciones: tendencia diaria y totales de la ventana. */
export const getHistory = (days?: number): Promise<OperationResult<HistoryReport>> =>
  toResult(
    () => apiClient.get<HistoryReport>(`/e2e/history${days ? `?days=${days}` : ''}`),
    undefined,
    'No se pudo cargar el histórico',
  );

/** Resumen ejecutivo del dashboard: tendencia + KPIs de flaky/alertas + delta vs período anterior. */
export const getDashboard = (days?: number): Promise<OperationResult<DashboardSummary>> =>
  toResult(
    () => apiClient.get<DashboardSummary>(`/e2e/dashboard${days ? `?days=${days}` : ''}`),
    undefined,
    'No se pudo cargar el dashboard',
  );
