export interface Client {
  id: number;
  appName: string;
  empId: number;
  empNombre: string;
  empresaNombre: string;
  clienteId: number;
  loginUrl: string;
  urlRaiz: string;
  serverType: number;
  entorno: string;
}

export interface EmpresaOption {
  Id?: number;
  IdEmpresa?: number;
  Nombre: string;
}

export interface SucursalOption {
  Id: number;
  Nombre: string;
  entorno: string;
}

export interface PageItem {
  name: string;
  url: string;
}

export interface SubmoduleItem {
  name: string;
  pages?: PageItem[];
  submodules?: SubmoduleItem[];
}

export interface ModuleItem {
  name: string;
  description?: string;
  pages?: PageItem[];
  submodules?: SubmoduleItem[];
  swaggerUrl?: string;
}

export type ApiAssertionType =
  | 'body-contains'
  | 'field-equals'
  | 'field-exists'
  | 'header-contains'
  | 'time-under';

export interface ApiAssertion {
  id: string;
  type: ApiAssertionType;
  target?: string;
  value?: string;
}

export interface ApiAssertionResult {
  id: string;
  type: ApiAssertionType;
  target?: string;
  value?: string;
  ok: boolean;
  actual?: string;
  message: string;
}

export interface ApiExtraction {
  id: string;
  name: string;
  path: string;
}

export interface ApiTest {
  id: string;
  name: string;
  url: string;
  /** Ruta relativa a la urlRaiz; se compone con la empresa activa al correr. */
  basePath?: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  expectedStatus: number;
  assertions?: ApiAssertion[];
  extract?: ApiExtraction[];
  createdAt: string;
  lastResult?: {
    status: number;
    time: number;
    body: unknown;
    ok: boolean;
    runAt: string;
    statusOk?: boolean;
    assertionResults?: ApiAssertionResult[];
    extracted?: Record<string, string>;
  };
  history?: {
    status: number;
    time: number;
    ok: boolean;
    runAt: string;
    body: unknown;
    empresaNombre?: string;
    sucursalNombre?: string;
  }[];
}

export interface UiTest {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  components?: UiTestComponent[];
  hasBaseline?: boolean;
  lastResult?: {
    screenshot: string;
    title: string;
    loadTime: number;
    ok: boolean;
    error?: string;
    runAt: string;
    componentResults?: UiTestComponentResult[];
    mismatchPct?: number;
    diff?: string;
    visual?: 'ok' | 'diff' | 'baseline' | 'na';
  };
}

export type UiTestRuleType = 'numbers-only' | 'non-negative' | 'required';

export interface UiTestComponentCandidate {
  selector: string;
  label: string;
  tagName: string;
  inputType?: string;
  required?: boolean;
  placeholder?: string;
}

export interface UiTestComponent {
  id: string;
  name: string;
  selector: string;
  tagName: string;
  inputType?: string;
  rules: UiTestRuleType[];
}

export interface UiTestRuleResult {
  rule: UiTestRuleType;
  ok: boolean;
  message: string;
  actualValue?: string;
}

export interface UiTestComponentResult {
  componentId: string;
  name: string;
  selector: string;
  ok: boolean;
  checks: UiTestRuleResult[];
  screenshot?: string;
}

export type E2eAssertionType = 'appears' | 'not-appears' | 'url-contains' | 'title-contains' | 'count' | 'value';
export interface E2eAssertion { id: string; type: E2eAssertionType; text: string; target?: string; op?: 'atLeast' | 'exact'; }
export interface E2eAssertionResult { id: string; type: E2eAssertionType; text: string; target?: string; op?: 'atLeast' | 'exact'; ok: boolean; }

export interface E2eRecording {
  id: string;
  name: string;
  url: string;
  status: 'idle' | 'recording' | 'ready' | 'error';
  createdAt: string;
  originalSpec?: string;
  assertions?: E2eAssertion[];
  requirement?: string;
  lastResult?: {
    passed: number;
    failed: number;
    output: string;
    ok: boolean;
    runAt: string;
    screenshots?: string[];
    hasPdf?: boolean;
    hasTrace?: boolean;
    assertionResults?: E2eAssertionResult[];
    healed?: string[];
  };
  history?: {
    passed: number;
    failed: number;
    ok: boolean;
    runAt: string;
    output: string;
    empresaNombre?: string;
    sucursalNombre?: string;
  }[];
}
