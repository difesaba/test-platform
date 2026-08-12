import { getBatchRuns } from '@/features/apiTests/services/batch/batch.service';
/** 🔎 Verifica el contrato de /batch-runs contra el backend real. */
export async function verifyBatchInterfaces(): Promise<void> {
  const res = await getBatchRuns();
  console.log('[verify] GET /batch-runs →', res.success ? `${res.data?.length} ejecuciones` : res.error);
}
