// Fila del reporte de flaky: un flujo en un contexto (empresa/entorno), con su estabilidad reciente.
export interface FlakyRow {
  module: string;
  submodule?: string;
  page?: string;
  flowId: string;
  flowName?: string;
  tipo?: 'e2e' | 'ui' | 'api';
  empresaNombre?: string;
  entorno?: string;
  total: number;
  passed: number;
  failed: number;
  stabilityPct: number;
  flaky: boolean;
  transitions: number;
  lastOk: boolean;
  lastRunAt?: string;
  recent: { runAt: string; ok: boolean }[];
}

export interface FlakyTotals {
  flows: number;      // flujos con historial suficiente
  flaky: number;      // inestables
  stable: number;     // 100% verdes
  failing: number;    // 100% rojos
}
