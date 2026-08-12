import type { SucursalOption } from '@/shared/types/platform';

// 📝 Shapes derivados del uso real en App.tsx y LoginPage.tsx; validar con verify-api-interfaces.

/** Respuesta de GET /auth/session — contexto de sesión (empresa/entorno). */
export interface SessionResponse {
  isAuthenticated: boolean;
  entorno?: { urlRaiz?: string };
  empresa?: { id: number; nombre: string } | null;
  sucursal?: { id: number; nombre: string; entorno: string } | null;
}

/** Cuerpo de POST /auth/quick-login — ingreso centralizado (keyC) por cliente/entorno. */
export interface QuickLoginDTO {
  loginUrl: string;
  urlRaiz: string;
  empresaNombre?: string;
  empNombre?: string;
  entornoName?: string;
  empresaId?: number;
  sucursalId?: number;
}

/** Respuesta de POST /auth/quick-login. */
export interface QuickLoginResponse {
  // ⚠️ Si el cliente tiene varias sucursales, el backend pide elegir una.
  needsSucursal?: boolean;
  sucursales?: SucursalOption[];
}
