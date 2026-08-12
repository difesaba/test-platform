/** Miembro de una suite: referencia a un flujo con su contexto (para poder ejecutarlo). */
export interface E2eSuiteFlow {
  module: string;
  submodule?: string;
  page?: string;
  flowId: string;
  name: string;
  order: number;
}

export type SuiteType = 'e2e' | 'ui' | 'api';

/** Conjunto reutilizable de pruebas (de un mismo tipo) que corren en orden y dan un resultado agregado. */
export interface E2eSuite {
  id: string;
  name: string;
  description?: string;
  tipo: SuiteType;
  stopOnFailure?: boolean;
  flows: E2eSuiteFlow[];
  createdAt: string;
  updatedAt: string;
}

/** Resultado de un flujo dentro de una corrida de suite. */
export interface E2eSuiteRunFlow {
  flowId: string;
  name: string;
  module: string;
  ok: boolean;
  passed: number;
  failed: number;
  runAt: string;
  error?: string;
}

/** Corrida agregada de una suite. */
export interface E2eSuiteRun {
  id: string;
  suiteId: string;
  suiteName: string;
  runAt: string;
  total: number;
  passed: number;
  failed: number;
  ok: boolean;
  empresaNombre?: string;
  entorno?: string;
  results: E2eSuiteRunFlow[];
}

export interface CreateSuiteDTO { name: string; description?: string; tipo?: SuiteType; stopOnFailure?: boolean; }
export interface UpdateSuiteDTO { name?: string; description?: string; stopOnFailure?: boolean; }
export interface AddSuiteFlowDTO { module: string; submodule?: string; page?: string; flowId: string; name: string; }
