import type { E2eRecording as _E2eRecording } from '@/shared/types/platform';
export type { E2eRecording, E2eAssertion, E2eAssertionResult, E2eAssertionType } from '@/shared/types/platform';

/** Tipo de flujo que condiciona las reglas de replay. */
export type E2eFlowType = 'crear' | 'editar' | 'consultar' | 'otro';

export interface CreateE2eDTO { name: string; url: string; tipo: E2eFlowType; }
export interface E2eSpecResponse { spec?: string }
export interface EnhanceAiResponse { originalSpec?: string; enhancedSpec?: string }
export interface StartRecordingDTO { url?: string }
export interface RunFlowDTO { url?: string }

/**
 * Registro histórico de una ejecución (endpoint GET /e2e/runs).
 * 📝 Cada corrida es un hecho inmutable persistido en backend (tabla e2e_runs o JSONL),
 * a diferencia de E2eRecording.history que es la ventana en memoria de las últimas corridas.
 */
export interface E2eRunRecord {
  id: string;
  flowId: string;
  module: string;
  submodule?: string;
  page?: string;
  flowName?: string;
  tipo?: E2eFlowType;
  runAt: string;
  passed: number;
  failed: number;
  ok: boolean;
  stepCount?: number;
  assertionTotal: number;
  assertionFailed: number;
  empresaNombre?: string;
  sucursalNombre?: string;
  entorno?: string;
  urlRaiz?: string;
  result?: _E2eRecording['lastResult'];
}

/** Opciones de consulta del historial: por flujo (flowId) y/o límite de filas. */
export interface E2eRunsQuery { flowId?: string; limit?: number; }

/** Paso del reporte con su captura (nombre de archivo; la URL la arma el servicio). */
export interface E2eDocStep {
  num: number;
  description: string;
  testName?: string;
  screenshot: string;
}

/** Payload del reporte (GET /e2e/:id/doc-data) para armar el PDF on-demand en el cliente. */
export interface E2eDocData {
  name: string;
  module: string;
  page?: string;
  tipo?: E2eFlowType;
  runAt?: string;
  result: { passed: number; failed: number; ok: boolean; stepCount: number };
  steps: E2eDocStep[];
  humanError?: string;
  failureScreenshots: string[];
  outputExcerpt?: string;
}
