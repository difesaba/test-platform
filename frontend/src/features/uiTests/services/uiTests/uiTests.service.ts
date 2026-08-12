import { apiClient, toResult } from '@/shared/services/http';
import { buildSelectionQuery } from '@/shared/utils/platform';
import type { SelectedModule } from '@/shared/store/useModuleStore';
import type { OperationResult } from '@/shared/models/shared.model';
import type { UiTest } from '@/shared/types/platform';
import type { StartPickerResponse, ComponentPickerStatus, SaveUiTestDTO, RunUiTestDTO } from '@/features/uiTests/models/uiTests.model';

const q = (s: SelectedModule) => buildSelectionQuery(s);

export const getUiTests = (selected: SelectedModule): Promise<OperationResult<UiTest[]>> =>
  toResult(() => apiClient.get<UiTest[]>(`/ui-tests?${q(selected)}`), undefined, 'No se pudieron cargar las pruebas de UI');

export const startComponentPicker = (url: string): Promise<OperationResult<StartPickerResponse>> =>
  toResult(() => apiClient.post<StartPickerResponse>('/ui-tests/component-picker/start', { url }), undefined, 'No se pudo iniciar el selector de componentes');

export const getComponentPickerStatus = (sessionId: string): Promise<OperationResult<ComponentPickerStatus>> =>
  toResult(() => apiClient.get<ComponentPickerStatus>(`/ui-tests/component-picker/${sessionId}`), undefined, 'No se pudo leer la selección del componente');

export const closeComponentPicker = (sessionId: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.delete<void>(`/ui-tests/component-picker/${sessionId}`), undefined, 'No se pudo cerrar el selector');

export const saveUiTest = (selected: SelectedModule, dto: SaveUiTestDTO): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/ui-tests?${q(selected)}`, dto), 'Prueba de UI guardada', 'No se pudo guardar la prueba de UI');

export const runUiTest = (id: string, selected: SelectedModule, dto: RunUiTestDTO): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/ui-tests/${id}/run?${q(selected)}`, dto), undefined, 'No se pudo ejecutar la prueba de UI');

export const deleteUiTest = (id: string, selected: SelectedModule): Promise<OperationResult<void>> =>
  toResult(() => apiClient.delete<void>(`/ui-tests/${id}?${q(selected)}`), 'Prueba eliminada', 'No se pudo eliminar la prueba');

export const approveBaseline = (id: string, selected: SelectedModule): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/ui-tests/${id}/baseline?${q(selected)}`), 'Baseline actualizada', 'No se pudo aprobar la baseline');
