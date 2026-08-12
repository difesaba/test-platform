import { apiClient, toResult } from '@/shared/services/http';
import type { OperationResult } from '@/shared/models/shared.model';
import type { RequirementRow } from '@/features/requisitos/models/requisitos.model';

// Capa de servicio de Trazabilidad: Axios centralizado + OperationResult, sin lógica de UI.

/** Reporte de trazabilidad: flujos E2E agrupados por su referencia de requisito, con estado. */
export const getRequirements = (): Promise<OperationResult<RequirementRow[]>> =>
  toResult(
    () => apiClient.get<RequirementRow[]>('/e2e/requirements'),
    undefined,
    'No se pudo cargar la trazabilidad',
  );
