import { getModules } from '@/features/platform/services/catalog/catalog.service';
/** 🔎 Verifica el contrato de /modules contra el backend real. */
export async function verifyCatalogInterfaces(): Promise<void> {
  const res = await getModules();
  console.log('[verify] GET /modules →', res.success ? `${res.data?.length} módulos` : res.error);
  const sample = res.data?.[0];
  if (sample && !('name' in sample)) console.warn('[verify] /modules: falta "name"');
}
