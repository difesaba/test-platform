/** Contexto (módulo/submódulo/página) con el conteo de pruebas por tipo. Respuesta de /e2e/coverage. */
export interface CoverageRow {
  module: string;
  submodule?: string;
  page?: string;
  e2e: number;
  ui: number;
  api: number;
  count: number;
}

/** Conteo por tipo de prueba en un contexto. */
export interface CoverageCounts { e2e: number; ui: number; api: number; count: number }

/** Cobertura de un módulo, ya cruzada con el catálogo (para la vista). */
export interface ModuleCoverage {
  name: string;
  total: number;
  covered: number;
  rows: ({ firstSub?: string; page: string; chain: string } & CoverageCounts)[];
}

export interface CoverageTotals { total: number; covered: number; pct: number; e2e: number; ui: number; api: number; }
