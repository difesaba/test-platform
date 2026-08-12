import { apiClient, toResult } from '@/shared/services/http';
import type { OperationResult } from '@/shared/models/shared.model';
import type { SessionResponse, QuickLoginDTO, QuickLoginResponse } from '@/features/login/models/auth.model';

/** Estado de sesión actual (contexto empresa/entorno). */
export const getSession = (): Promise<OperationResult<SessionResponse>> =>
  toResult(() => apiClient.get<SessionResponse>('/auth/session'), undefined, 'No se pudo verificar la sesión');

/** Ingreso centralizado (keyC) para un cliente/entorno. Soporta cancelación con AbortSignal. */
export const quickLogin = (
  payload: QuickLoginDTO,
  signal?: AbortSignal,
): Promise<OperationResult<QuickLoginResponse>> =>
  toResult(
    () => apiClient.post<QuickLoginResponse>('/auth/quick-login', payload, { signal }),
    'Sesión iniciada',
    'No fue posible iniciar sesión',
  );

/** Cierra la sesión en el backend. */
export const logout = (): Promise<OperationResult<void>> =>
  toResult(() => apiClient.post<void>('/auth/logout'), 'Sesión cerrada', 'No se pudo cerrar la sesión');
