import { apiClient, toResult } from '@/shared/services/http';
import type { OperationResult } from '@/shared/models/shared.model';
import type { Addon, RecordingStatus, SsoUrlResponse, InstallAddonDTO, RecordAddonDTO } from '@/features/addons/models/addons.model';

export const getAddons = (): Promise<OperationResult<Addon[]>> =>
  toResult(() => apiClient.get<Addon[]>('/addons'), undefined, 'No se pudieron cargar los complementos');

export const getRecordingStatus = (): Promise<OperationResult<RecordingStatus>> =>
  toResult(() => apiClient.get<RecordingStatus>('/addons/recording-status'), undefined, 'No se pudo consultar el estado de grabación');

export const installAddon = (id: string | number, payload: InstallAddonDTO): Promise<OperationResult<unknown>> =>
  toResult(() => apiClient.post<unknown>(`/addons/${encodeURIComponent(String(id))}/instalar`, payload), 'Complemento instalado', 'No se pudo instalar el complemento');

export const recordAddon = (payload: RecordAddonDTO): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>('/addons/record', payload), 'Grabación iniciada', 'No se pudo iniciar la grabación');

/** URL SSO de Torre para abrir un complemento autenticado. */
export const getTorreSsoUrl = (loginUrl?: string): Promise<OperationResult<SsoUrlResponse>> =>
  toResult(() => apiClient.get<SsoUrlResponse>('/torre/sso-url', { params: { loginUrl } }), undefined, 'No se pudo obtener el acceso SSO');
