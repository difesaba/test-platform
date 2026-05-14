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
}

export interface ModuleItem {
  name: string;
  description?: string;
  pages?: PageItem[];
  submodules?: SubmoduleItem[];
}

export interface ApiTest {
  id: string;
  name: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  expectedStatus: number;
  createdAt: string;
  lastResult?: {
    status: number;
    time: number;
    body: unknown;
    ok: boolean;
    runAt: string;
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
  lastResult?: {
    screenshot: string;
    title: string;
    loadTime: number;
    ok: boolean;
    error?: string;
    runAt: string;
    componentResults?: UiTestComponentResult[];
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

export interface E2eRecording {
  id: string;
  name: string;
  url: string;
  status: 'idle' | 'recording' | 'ready' | 'error';
  createdAt: string;
  lastResult?: {
    passed: number;
    failed: number;
    output: string;
    ok: boolean;
    runAt: string;
    screenshots?: string[];
    hasPdf?: boolean;
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
