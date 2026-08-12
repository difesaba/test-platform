import { apiClient, toResult } from '@/shared/services/http';
import type { OperationResult } from '@/shared/models/shared.model';
import type { Client } from '@/shared/types/platform';
import type { BatchRun, BatchRunRequest, BatchRunResponse } from '@/features/apiTests/models/batch.model';

export const getBatchClients = (): Promise<OperationResult<Client[]>> =>
  toResult(() => apiClient.get<Client[]>('/clients/sinco'), undefined, 'No se pudieron cargar las empresas');

export const getBatchRuns = (): Promise<OperationResult<BatchRun[]>> =>
  toResult(() => apiClient.get<BatchRun[]>('/batch-runs'), undefined, 'No se pudo cargar el historial de lotes');

export const runBatch = (query: string, payload: BatchRunRequest): Promise<OperationResult<BatchRunResponse>> =>
  toResult(() => apiClient.post<BatchRunResponse>(`/api-tests/batch-run?${query}`, payload), undefined, 'No se pudo ejecutar el lote');

export const deleteBatchRun = (id: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.delete<void>(`/batch-runs/${id}`), 'Ejecución eliminada', 'No se pudo eliminar la ejecución');
