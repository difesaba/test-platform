// Modelos del Dashboard histórico: tendencia diaria de ejecuciones E2E y totales de la ventana.
export interface HistoryDay {
  date: string;
  total: number;
  passed: number;
  failed: number;
}

export interface HistoryReport {
  days: HistoryDay[];
  totals: { runs: number; passed: number; failed: number; passRate: number };
}

// Resumen ejecutivo: tendencia histórica + KPIs de flaky/alertas + delta vs período anterior.
export interface DashboardTopFail {
  flowName?: string;
  module: string;
  submodule?: string;
  page?: string;
  empresaNombre?: string;
  entorno?: string;
  consecutiveFails: number;
  runAt: string;
}

export interface DashboardSummary {
  days: HistoryDay[];
  totals: { runs: number; passed: number; failed: number; passRate: number };
  prevPassRate: number;
  deltaPassRate: number;
  flakyCount: number;
  failingNow: number;
  topFailing: DashboardTopFail[];
}
