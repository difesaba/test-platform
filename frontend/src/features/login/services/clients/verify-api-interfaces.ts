import { getSincoClients } from '@/features/login/services/clients/clients.service';
/** 🔎 Verifica el contrato de /clients/sinco contra el backend real. */
export async function verifyClientsInterfaces(): Promise<void> {
  const res = await getSincoClients();
  console.log('[verify] GET /clients/sinco →', res.success ? `${res.data?.length} clientes` : res.error);
  const sample = res.data?.[0];
  if (sample) for (const k of ['id', 'urlRaiz', 'entorno', 'appName']) {
    if (!(k in sample)) console.warn(`[verify] /clients/sinco: falta "${k}"`);
  }
}
