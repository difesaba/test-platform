import { apiClient, toResult } from '@/shared/services/http';
import type { OperationResult } from '@/shared/models/shared.model';
import type { SwaggerDoc } from '@/features/apiTests/models/swagger.model';

/** Proxy del catálogo Swagger de un módulo (evita CORS contra el ERP). */
export const getSwaggerCatalog = (urlBase: string): Promise<OperationResult<SwaggerDoc>> =>
  toResult(
    () => apiClient.get<SwaggerDoc>(`/swagger-proxy?urlBase=${encodeURIComponent(urlBase)}`),
    undefined,
    'No se pudo cargar el catálogo Swagger',
  );
