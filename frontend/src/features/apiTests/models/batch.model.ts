// 📝 Historial y ejecución por lotes; shapes basados en el uso en BatchSection, validar con verify-api-interfaces.
export interface BatchRunResultRow {
  companyUrlRaiz: string;
  testId: string;
  ok: boolean;
  status: number;
  time: number;
  error?: string;
}

export interface BatchRun {
  id: string;
  timestamp: string;
  moduleContext: { module: string; submodule?: string; page?: string };
  companies: { urlRaiz: string; appName: string }[];
  testNames: Record<string, string>;
  results: BatchRunResultRow[];
  summary: { total: number; passed: number; failed: number };
}

export interface BatchRunCompany { urlRaiz: string; appName: string; empNombre: string }

export interface BatchRunRequest {
  testIds: string[];
  companies: BatchRunCompany[];
  sourceUrlRaiz: string;
}

// ⚠️ El backend puede responder el arreglo directo o envuelto en { results }.
export type BatchRunResponse = BatchRunResultRow[] | { results?: BatchRunResultRow[] };
