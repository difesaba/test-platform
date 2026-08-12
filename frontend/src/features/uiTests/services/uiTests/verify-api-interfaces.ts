import { getUiTests } from '@/features/uiTests/services/uiTests/uiTests.service';
import type { SelectedModule } from '@/shared/store/useModuleStore';
/** 🔎 Verifica el contrato de /ui-tests contra el backend real. */
export async function verifyUiTestsInterfaces(selected: SelectedModule): Promise<void> {
  const res = await getUiTests(selected);
  console.log('[verify] GET /ui-tests →', res.success ? `${res.data?.length} pruebas` : res.error);
}
