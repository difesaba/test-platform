import { apiClient, toResult } from '@/shared/services/http';
import type { OperationResult } from '@/shared/models/shared.model';
import type { CoverageRow } from '@/features/coverage/models/coverage.model';

// Capa de servicio de Cobertura: Axios centralizado + OperationResult, sin lógica de UI.

/** Cobertura unificada: contextos con conteo de pruebas E2E/UI/API. */
export const getCoverage = (): Promise<OperationResult<CoverageRow[]>> =>
  toResult(() => apiClient.get<CoverageRow[]>('/e2e/coverage'), undefined, 'No se pudo cargar la cobertura');
