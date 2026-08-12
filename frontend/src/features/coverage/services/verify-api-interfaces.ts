import { getCoverage } from '@/features/coverage/services/coverage.service';

/** 🔎 Verifica el contrato de /e2e/coverage contra el backend real. */
export async function verifyCoverageInterfaces(): Promise<void> {
  const res = await getCoverage();
  if (res.success && res.data) {
    console.log('[verify] GET /e2e/coverage →', `${res.data.length} contextos con pruebas`);
    const s = res.data[0];
    // ⚠️ Campos que la vista asume presentes; si el backend cambia, salta acá.
    if (s) console.log('[verify] coverage sample →', { module: s.module, submodule: s.submodule, page: s.page, e2e: s.e2e, ui: s.ui, api: s.api, count: s.count });
  } else {
    console.log('[verify] GET /e2e/coverage →', res.error);
  }
}
