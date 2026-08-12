import { getE2eFlows, getE2eRuns } from '@/features/e2e/services/e2e/e2e.service';
import type { SelectedModule } from '@/shared/store/useModuleStore';
/** 🔎 Verifica el contrato de /e2e contra el backend real (requiere un contexto seleccionado). */
export async function verifyE2eInterfaces(selected: SelectedModule): Promise<void> {
  const res = await getE2eFlows(selected);
  console.log('[verify] GET /e2e →', res.success ? `${res.data?.length} flujos` : res.error);

  // 🔎 Historial persistido (e2e_runs / JSONL). Valida shape y campos de reportería.
  const runs = await getE2eRuns(selected, { limit: 5 });
  if (runs.success && runs.data) {
    const sample = runs.data[0];
    console.log('[verify] GET /e2e/runs →', `${runs.data.length} corridas`);
    // ⚠️ Campos que la reportería asume presentes; si el backend cambia, salta acá.
    if (sample) console.log('[verify] run sample →', {
      flowId: sample.flowId, runAt: sample.runAt, ok: sample.ok,
      assertionTotal: sample.assertionTotal, assertionFailed: sample.assertionFailed,
    });
  } else {
    console.log('[verify] GET /e2e/runs →', runs.error);
  }
}
