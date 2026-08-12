import { apiClient, toResult } from '@/shared/services/http';
import type { OperationResult } from '@/shared/models/shared.model';
import type { E2eSuite, E2eSuiteRun, CreateSuiteDTO, UpdateSuiteDTO, AddSuiteFlowDTO, SuiteType } from '@/features/suites/models/suite.model';

// Capa de servicio de Suites: Axios centralizado + OperationResult, sin lógica de UI.

export const getSuites = (tipo?: SuiteType): Promise<OperationResult<E2eSuite[]>> =>
  toResult(() => apiClient.get<E2eSuite[]>(`/suites${tipo ? `?tipo=${tipo}` : ''}`), undefined, 'No se pudieron cargar las suites');

export const getSuite = (id: string): Promise<OperationResult<E2eSuite>> =>
  toResult(() => apiClient.get<E2eSuite>(`/suites/${id}`), undefined, 'No se pudo cargar la suite');

export const createSuite = (dto: CreateSuiteDTO): Promise<OperationResult<E2eSuite>> =>
  toResult(() => apiClient.post<E2eSuite>('/suites', dto), 'Suite creada', 'No se pudo crear la suite');

export const updateSuite = (id: string, dto: UpdateSuiteDTO): Promise<OperationResult<E2eSuite>> =>
  toResult(() => apiClient.patch<E2eSuite>(`/suites/${id}`, dto), 'Suite actualizada', 'No se pudo actualizar la suite');

export const deleteSuite = (id: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.delete<void>(`/suites/${id}`), 'Suite eliminada', 'No se pudo eliminar la suite');

export const addFlowToSuite = (id: string, dto: AddSuiteFlowDTO): Promise<OperationResult<E2eSuite>> =>
  toResult(() => apiClient.post<E2eSuite>(`/suites/${id}/flows`, dto), 'Flujo agregado a la suite', 'No se pudo agregar el flujo');

export const removeFlowFromSuite = (id: string, flowId: string): Promise<OperationResult<E2eSuite>> =>
  toResult(() => apiClient.delete<E2eSuite>(`/suites/${id}/flows/${flowId}`), 'Flujo quitado de la suite', 'No se pudo quitar el flujo');

export const runSuite = (id: string): Promise<OperationResult<E2eSuiteRun>> =>
  toResult(() => apiClient.post<E2eSuiteRun>(`/suites/${id}/run`), undefined, 'No se pudo ejecutar la suite');

export const getSuiteRuns = (id: string, limit?: number): Promise<OperationResult<E2eSuiteRun[]>> =>
  toResult(() => apiClient.get<E2eSuiteRun[]>(`/suites/${id}/runs${limit ? `?limit=${limit}` : ''}`), undefined, 'No se pudo cargar el historial de la suite');
