import type { ApiTest, ApiAssertion, ApiExtraction } from '@/shared/types/platform';

export type { ApiTest };

/** Resultado de una ejecución (`/api-tests/:id/run`) — misma forma que `ApiTest['lastResult']`. */
export type ApiRunResult = NonNullable<ApiTest['lastResult']>;

// 📝 Cuerpos basados en el uso en ApiTestTab/ApiTestEditDialog; validar con verify-api-interfaces.
export interface SaveApiTestDTO {
  name: string;
  url: string;
  basePath?: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  expectedStatus: number;
  assertions?: ApiAssertion[];
  extract?: ApiExtraction[];
}
export interface BatchRunApiTestsDTO { testIds: string[]; targets: unknown[] }
export type BatchRunResult = Record<string, unknown>;
