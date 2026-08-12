import { getSwaggerCatalog } from '@/features/apiTests/services/swagger/swagger.service';
/** 🔎 Verifica el proxy Swagger contra un urlBase real. */
export async function verifySwaggerInterfaces(urlBase: string): Promise<void> {
  const res = await getSwaggerCatalog(urlBase);
  console.log('[verify] GET /swagger-proxy →', res.success ? 'OK' : res.error);
}
