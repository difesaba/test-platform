import { apiClient, toResult } from '@/shared/services/http';
import { buildSelectionQuery } from '@/shared/utils/platform';
import type { SelectedModule } from '@/shared/store/useModuleStore';
import type { OperationResult } from '@/shared/models/shared.model';
import type { E2eRecording } from '@/shared/types/platform';
import type { CreateE2eDTO, E2eSpecResponse, EnhanceAiResponse, StartRecordingDTO, RunFlowDTO, E2eAssertion, E2eRunRecord, E2eRunsQuery, E2eDocData } from '@/features/e2e/models/e2e.model';

// El contexto (empresa/entorno + página) viaja como query; lo arma el servicio, no la UI.
const q = (s: SelectedModule) => buildSelectionQuery(s);

/**
 * Historial persistido de ejecuciones (reportería). Por flujo (flowId) o por contexto de página.
 * 📝 A diferencia de E2eRecording.history (ventana en memoria), esto lee la tabla e2e_runs / JSONL.
 */
export const getE2eRuns = (selected: SelectedModule, opts: E2eRunsQuery = {}): Promise<OperationResult<E2eRunRecord[]>> => {
  const params = new URLSearchParams(q(selected));
  if (opts.flowId) params.set('flowId', opts.flowId);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  return toResult(() => apiClient.get<E2eRunRecord[]>(`/e2e/runs?${params.toString()}`), undefined, 'No se pudo cargar el historial de ejecuciones');
};

export const saveE2eAssertions = (id: string, selected: SelectedModule, assertions: E2eAssertion[]): Promise<OperationResult<E2eRecording>> =>
  toResult(() => apiClient.post<E2eRecording>(`/e2e/${id}/assertions?${q(selected)}`, { assertions }), 'Aserciones guardadas', 'No se pudieron guardar las aserciones');

export const getE2eFlows = (selected: SelectedModule): Promise<OperationResult<E2eRecording[]>> =>
  toResult(() => apiClient.get<E2eRecording[]>(`/e2e?${q(selected)}`), undefined, 'No se pudieron cargar los flujos E2E');

/** Payload del reporte para armar el PDF on-demand en el cliente (el backend ya no genera ni guarda PDFs). */
export const getE2eDocData = (id: string, selected: SelectedModule): Promise<OperationResult<E2eDocData>> =>
  toResult(() => apiClient.get<E2eDocData>(`/e2e/${id}/doc-data?${q(selected)}`), undefined, 'No se pudo cargar el reporte');

/** URL de una captura específica (para embeberla en el PDF). */
export const e2eScreenshotUrl = (id: string, file: string, selected: SelectedModule): string =>
  `/api/e2e/${id}/screenshots/${encodeURIComponent(file)}?${q(selected)}`;

export const getE2eSpec = (id: string, selected: SelectedModule): Promise<OperationResult<E2eSpecResponse>> =>
  toResult(() => apiClient.get<E2eSpecResponse>(`/e2e/${id}/spec?${q(selected)}`), undefined, 'No se pudo cargar el spec');

export const getE2eScreenshots = (id: string, selected: SelectedModule): Promise<OperationResult<string[]>> =>
  toResult(() => apiClient.get<string[]>(`/e2e/${id}/screenshots?${q(selected)}`), undefined, 'No se pudieron cargar las capturas');

export const createE2eFlow = (selected: SelectedModule, dto: CreateE2eDTO): Promise<OperationResult<E2eRecording>> =>
  toResult(() => apiClient.post<E2eRecording>(`/e2e?${q(selected)}`, dto), 'Flujo creado', 'No se pudo crear el flujo');

export const startE2eRecording = (id: string, selected: SelectedModule, dto: StartRecordingDTO): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/e2e/${id}/start?${q(selected)}`, dto), undefined, 'No se pudo iniciar la grabación');

export const stopE2eRecording = (id: string, selected: SelectedModule): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/e2e/${id}/stop?${q(selected)}`), 'Grabación detenida', 'No se pudo detener la grabación');

export const runE2eFlow = (id: string, selected: SelectedModule, dto: RunFlowDTO): Promise<OperationResult<E2eRecording>> =>
  toResult(() => apiClient.post<E2eRecording>(`/e2e/${id}/run?${q(selected)}`, dto), undefined, 'No se pudo ejecutar el flujo');

export const deleteE2eFlow = (id: string, selected: SelectedModule): Promise<OperationResult<void>> =>
  toResult(() => apiClient.delete<void>(`/e2e/${id}?${q(selected)}`), 'Flujo eliminado', 'No se pudo eliminar el flujo');

export const renameE2eFlow = (id: string, selected: SelectedModule, name: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/e2e/${id}/rename?${q(selected)}`, { name }), 'Flujo renombrado', 'No se pudo renombrar el flujo');

export const saveEnhancedSpec = (id: string, selected: SelectedModule, enhancedSpec: string): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>(`/e2e/${id}/save-enhanced?${q(selected)}`, { enhancedSpec }), 'Código guardado', 'No se pudo guardar el código');

export const enhanceWithAi = (id: string, selected: SelectedModule): Promise<OperationResult<EnhanceAiResponse>> =>
  toResult(() => apiClient.post<EnhanceAiResponse>(`/e2e/${id}/enhance-ai?${q(selected)}`), undefined, 'No fue posible mejorar con IA');
