// Trazabilidad a requisitos: cada requisito agrupa los flujos E2E que lo cubren, con su
// estado (verde/rojo) de la última corrida, para mostrar la cobertura por requisito.
export interface FlowRef {
  module: string;
  submodule?: string;
  page?: string;
  flowId: string;
  flowName?: string;
  tipo?: 'crear' | 'editar' | 'consultar' | 'otro';
  lastOk?: boolean;
  lastRunAt?: string;
}

export interface RequirementRow {
  requirement: string;
  flows: FlowRef[];
  total: number;
  passing: number;
}

export interface RequirementTotals {
  requirements: number;   // requisitos reales (sin contar '(sin requisito)')
  flows: number;          // flujos ligados a un requisito real
  fullyCovered: number;   // requisitos 100% verdes
}
