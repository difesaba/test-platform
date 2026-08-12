/**
 * 🔎 Verificación del contrato de auth contra el backend real.
 * Ejecuta la llamada real, imprime el shape recibido y avisa si faltan campos esperados.
 */
import { getSession } from '@/features/login/services/auth/auth.service';

export async function verifyAuthInterfaces(): Promise<void> {
  const session = await getSession();
  console.log('[verify] GET /auth/session →', session);
  if (session.success && session.data) {
    const keys = Object.keys(session.data);
    for (const expected of ['isAuthenticated']) {
      if (!keys.includes(expected)) console.warn(`[verify] /auth/session: falta campo esperado "${expected}"`);
    }
  }
  // 📝 quick-login/logout no se verifican aquí: son mutaciones con efectos sobre la sesión.
}
