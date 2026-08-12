import api from '@/shared/api/client';
import type { OperationResult } from '@/shared/models/shared.model';

/** Cliente HTTP centralizado — único punto de acceso a Axios en la app. */
export const apiClient = api;

/**
 * Envuelve una llamada Axios en OperationResult, normalizando el manejo de error.
 * ✅ Nunca lanza: los servicios siempre retornan un resultado tipado y seguro de consumir.
 */
export async function toResult<T>(
  call: () => Promise<{ data: T }>,
  okMessage?: string,
  failMessage = 'La operación no se pudo completar',
): Promise<OperationResult<T>> {
  try {
    const { data } = await call();
    return { success: true, data, message: okMessage };
  } catch (error) {
    // ⚠️ Preferimos el mensaje del backend cuando viene en el cuerpo; si no, red/desconocido.
    const apiMessage = extractApiMessage(error);
    console.error(`[service] ${failMessage}:`, error);
    return { success: false, error: apiMessage ?? failMessage, message: failMessage };
  }
}

function extractApiMessage(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'response' in error) {
    const resp = (error as { response?: { data?: { error?: string; message?: string } } }).response;
    return resp?.data?.error ?? resp?.data?.message;
  }
  return error instanceof Error ? error.message : undefined;
}
