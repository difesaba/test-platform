import { apiClient, toResult } from '@/shared/services/http';
import type { OperationResult } from '@/shared/models/shared.model';
import type { Client } from '@/shared/types/platform';

/** Lista de entornos/clientes SINCO disponibles para el ingreso. */
export const getSincoClients = (): Promise<OperationResult<Client[]>> =>
  toResult(() => apiClient.get<Client[]>('/clients/sinco'), undefined, 'No se pudo cargar la lista de entornos');
