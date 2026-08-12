import { apiClient, toResult } from '@/shared/services/http';
import { buildSelectionQuery } from '@/shared/utils/platform';
import type { SelectedModule } from '@/shared/store/useModuleStore';
import type { OperationResult } from '@/shared/models/shared.model';
import type { ApiTest } from '@/shared/types/platform';
import type { SaveApiTestDTO, BatchRunApiTestsDTO, BatchRunResult, ApiRunResult } from '@/features/apiTests/models/apiTests.model';

const q = (s: SelectedModule) => buildSelectionQuery(s);

export const getApiTests = (selected: SelectedModule): Promise<OperationResult<ApiTest[]>> =>
  toResult(() => apiClient.get<ApiTest[]>(`/api-tests?${q(selected)}`), undefined, 'No se pudieron cargar las pruebas de API');

export const saveApiTest = (selected: SelectedModule, dto: SaveApiTestDTO): Promise<OperationResult<ApiTest>> =>
  toResult(() => apiClient.post<ApiTest>(`/api-tests?${q(selected)}`, dto), 'Prueba de API guardada', 'No se pudo guardar la prueba de API');

export const runApiTest = (id: string, selected: SelectedModule): Promise<OperationResult<ApiRunResult>> =>
  toResult(() => apiClient.post<ApiRunResult>(`/api-tests/${id}/run?${q(selected)}`), undefined, 'No se pudo ejecutar la prueba de API');

export const deleteApiTest = (id: string, selected: SelectedModule): Promise<OperationResult<void>> =>
  toResult(() => apiClient.delete<void>(`/api-tests/${id}?${q(selected)}`), 'Prueba eliminada', 'No se pudo eliminar la prueba');

export const updateApiTest = (id: string, selectionQuery: string, dto: SaveApiTestDTO): Promise<OperationResult<ApiTest>> =>
  toResult(() => apiClient.put<ApiTest>(`/api-tests/${id}?${selectionQuery}`, dto), 'Prueba de API actualizada', 'No se pudo actualizar la prueba de API');

export const batchRunApiTests = (selected: SelectedModule, dto: BatchRunApiTestsDTO): Promise<OperationResult<BatchRunResult>> =>
  toResult(() => apiClient.post<BatchRunResult>(`/api-tests/batch-run?${q(selected)}`, dto), 'Ejecución por lotes iniciada', 'No se pudo ejecutar el lote');
