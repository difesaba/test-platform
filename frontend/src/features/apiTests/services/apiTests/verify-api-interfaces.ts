import { getApiTests } from '@/features/apiTests/services/apiTests/apiTests.service';
import type { SelectedModule } from '@/shared/store/useModuleStore';
/** 🔎 Verifica el contrato de /api-tests contra el backend real. */
export async function verifyApiTestsInterfaces(selected: SelectedModule): Promise<void> {
  const res = await getApiTests(selected);
  console.log('[verify] GET /api-tests →', res.success ? `${res.data?.length} pruebas` : res.error);
}
