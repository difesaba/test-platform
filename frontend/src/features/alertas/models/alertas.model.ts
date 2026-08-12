// Fila de alerta: un flujo cuya corrida MÁS RECIENTE está fallando, con su racha de fallos.
export interface AlertRow {
  module: string;
  submodule?: string;
  page?: string;
  flowId: string;
  flowName?: string;
  tipo?: 'e2e' | 'ui' | 'api';
  empresaNombre?: string;
  entorno?: string;
  runAt: string;
  consecutiveFails: number;
  error?: string;
}

export interface AlertTotals {
  alerts: number;     // flujos actualmente fallando
}
