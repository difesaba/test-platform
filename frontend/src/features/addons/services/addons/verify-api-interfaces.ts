import { getAddons } from '@/features/addons/services/addons/addons.service';
/** 🔎 Verifica el contrato de /addons contra el backend real. */
export async function verifyAddonsInterfaces(): Promise<void> {
  const res = await getAddons();
  console.log('[verify] GET /addons →', res.success ? `${res.data?.length} complementos` : res.error);
}
