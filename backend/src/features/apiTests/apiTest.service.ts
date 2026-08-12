import fs from 'fs';
import path from 'path';
import { envs } from '../../shared/config/envs';
import { randomUUID } from 'crypto';
import { recordRun, type E2eRunRecord } from '../e2e/e2e.service';
import { captureAdproToken } from '../auth/playwright-auth.service';
import { AdproAuthService } from '../auth/adpro-auth.service';

const adproAuth = new AdproAuthService();

export interface ApiTestRunLog {
    status: number;
    time: number;
    ok: boolean;
    runAt: string;
    body: any;
    empresaNombre?: string;
    sucursalNombre?: string;
}

// Tipos de aserción autoríables por no-desarrolladores.
export type ApiAssertionType =
    | 'body-contains'   // el cuerpo (texto) contiene X
    | 'field-equals'    // campo JSON (ruta punto) == valor
    | 'field-exists'    // campo JSON (ruta punto) existe
    | 'header-contains' // header de respuesta contiene X
    | 'time-under';     // tiempo de respuesta < N ms

export interface ApiAssertion {
    id: string;
    type: ApiAssertionType;
    /** Ruta del campo (field-equals/field-exists) o nombre del header (header-contains). */
    target?: string;
    /** Valor esperado / substring / umbral en ms. */
    value?: string;
}

export interface ApiAssertionResult {
    id: string;
    type: ApiAssertionType;
    target?: string;
    value?: string;
    ok: boolean;
    /** Qué se encontró realmente (para diagnóstico). */
    actual?: string;
    message: string;
}

// Extracción: guarda un valor de la respuesta en una variable con nombre,
// que otra prueba de la misma suite puede reutilizar con {{nombre}}.
export interface ApiExtraction {
    id: string;
    name: string;   // nombre de la variable (sin llaves)
    path: string;   // ruta punto en el cuerpo JSON: "data.id"
}

export interface ApiTest {
    id: string;
    name: string;
    url: string;
    /**
     * Ruta relativa a la urlRaiz (todo lo que va después de la raíz de la empresa).
     * Se compone con la urlRaiz de la empresa activa al momento de correr, así una misma
     * prueba sirve para cualquier empresa. `url` se conserva para mostrar/compatibilidad.
     */
    basePath?: string;
    method: string;
    headers: Record<string, string>;
    body: string;
    expectedStatus: number;
    assertions?: ApiAssertion[];
    extract?: ApiExtraction[];
    createdAt: string;
    lastResult?: ApiTestResult;
    history?: ApiTestRunLog[];
}

export interface ApiTestResult {
    status: number;
    time: number;
    body: any;
    ok: boolean;
    runAt: string;
    statusOk?: boolean;
    assertionResults?: ApiAssertionResult[];
    extracted?: Record<string, string>;
}

export interface BatchResult {
    companyUrlRaiz: string;
    appName: string;
    testId: string;
    testName: string;
    ok: boolean;
    status: number;
    time: number;
    error?: string;
}

function testsPath(moduleName: string, submodule?: string, page?: string): string {
    const base = path.join(process.cwd(), envs.WORKSPACE_PATH, 'modules', moduleName);
    let dir: string;
    if (submodule && page) dir = path.join(base, 'submodules', submodule, 'pages', page, 'api');
    else if (page)         dir = path.join(base, 'pages', page, 'api');
    else if (submodule)    dir = path.join(base, 'submodules', submodule, 'api');
    else                   dir = path.join(base, 'api');
    return path.join(dir, 'tests.json');
}

function readTests(file: string): ApiTest[] {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeTests(file: string, tests: ApiTest[]): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(tests, null, 2), 'utf-8');
}

/** Lee un campo por ruta con puntos: "data.items.0.id". Soporta índices de array. */
function getByPath(obj: any, pathStr: string): { found: boolean; value: any } {
    if (obj == null || !pathStr) return { found: false, value: undefined };
    const parts = pathStr.split('.').map(p => p.trim()).filter(Boolean);
    let cur: any = obj;
    for (const part of parts) {
        if (cur == null) return { found: false, value: undefined };
        if (Array.isArray(cur)) {
            const idx = Number(part);
            if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return { found: false, value: undefined };
            cur = cur[idx];
        } else if (typeof cur === 'object') {
            if (!(part in cur)) return { found: false, value: undefined };
            cur = cur[part];
        } else {
            return { found: false, value: undefined };
        }
    }
    return { found: true, value: cur };
}

function stringify(v: any): string {
    if (v == null) return String(v);
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/** Raíz canónica de una empresa: urlRaiz sin el sufijo /v3 ni barras finales. */
function rootOf(urlRaiz?: string): string {
    return (urlRaiz ?? '').replace(/\/v3$/i, '').replace(/\/+$/, '');
}

/**
 * Compone la URL efectiva de una prueba para la empresa destino.
 * - Si la prueba tiene basePath (nueva): raíz destino + basePath → sirve para cualquier empresa.
 * - Si es antigua (solo url absoluta): reapunta la raíz origen→destino si se puede; si no, url tal cual.
 */
function composeUrl(test: { url: string; basePath?: string }, targetUrlRaiz?: string, sourceUrlRaiz?: string): string {
    const targetRoot = rootOf(targetUrlRaiz);
    if (test.basePath != null && test.basePath !== '') {
        return targetRoot ? `${targetRoot}${test.basePath}` : test.basePath;
    }
    const src = rootOf(sourceUrlRaiz);
    if (targetRoot && src && test.url.startsWith(src)) return `${targetRoot}${test.url.slice(src.length)}`;
    return test.url;
}

/** Deriva la ruta relativa de una url absoluta respecto a una raíz. '' si no coincide. */
function basePathFrom(url: string, urlRaiz?: string): string {
    const root = rootOf(urlRaiz);
    return root && url.startsWith(root) ? url.slice(root.length) : '';
}

/** Reemplaza {{variable}} por su valor. Deja el placeholder si no existe la variable. */
function interpolate(input: string | undefined, vars: Record<string, string>): string {
    if (!input) return input ?? '';
    return input.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match,
    );
}

/** Aplica las reglas de extracción sobre el cuerpo, devolviendo un mapa de variables. */
function applyExtractions(extract: ApiExtraction[] | undefined, body: any): Record<string, string> {
    const out: Record<string, string> = {};
    if (!extract?.length) return out;
    for (const rule of extract) {
        if (!rule.name || !rule.path) continue;
        const { found, value } = getByPath(body, rule.path);
        if (found) out[rule.name] = stringify(value);
    }
    return out;
}

/** Evalúa una lista de aserciones contra la respuesta. */
function evaluateAssertions(
    assertions: ApiAssertion[] | undefined,
    ctx: { status: number; time: number; body: any; bodyText: string; headers: Headers },
): ApiAssertionResult[] {
    if (!assertions?.length) return [];
    return assertions.map((a): ApiAssertionResult => {
        const base = { id: a.id, type: a.type, target: a.target, value: a.value };
        try {
            switch (a.type) {
                case 'body-contains': {
                    const needle = a.value ?? '';
                    const ok = ctx.bodyText.includes(needle);
                    return { ...base, ok, message: ok ? `El cuerpo contiene "${needle}"` : `El cuerpo NO contiene "${needle}"` };
                }
                case 'field-equals': {
                    const { found, value } = getByPath(ctx.body, a.target ?? '');
                    if (!found) return { ...base, ok: false, actual: '(ausente)', message: `Campo "${a.target}" ausente` };
                    const actual = stringify(value);
                    const ok = actual === (a.value ?? '');
                    return { ...base, ok, actual, message: ok ? `"${a.target}" = "${a.value}"` : `"${a.target}" es "${actual}", se esperaba "${a.value}"` };
                }
                case 'field-exists': {
                    const { found, value } = getByPath(ctx.body, a.target ?? '');
                    return { ...base, ok: found, actual: found ? stringify(value) : '(ausente)', message: found ? `Campo "${a.target}" existe` : `Campo "${a.target}" NO existe` };
                }
                case 'header-contains': {
                    const hv = ctx.headers.get(a.target ?? '') ?? '';
                    const needle = a.value ?? '';
                    const ok = needle ? hv.toLowerCase().includes(needle.toLowerCase()) : !!hv;
                    return { ...base, ok, actual: hv || '(ausente)', message: ok ? `Header "${a.target}" contiene "${needle}"` : `Header "${a.target}" ("${hv}") NO contiene "${needle}"` };
                }
                case 'time-under': {
                    const limit = Number(a.value);
                    const ok = Number.isFinite(limit) ? ctx.time < limit : false;
                    return { ...base, ok, actual: `${ctx.time}ms`, message: ok ? `Respondió en ${ctx.time}ms (< ${limit}ms)` : `Respondió en ${ctx.time}ms (>= ${limit}ms)` };
                }
                default:
                    return { ...base, ok: false, message: `Tipo de aserción desconocido: ${a.type}` };
            }
        } catch (e: any) {
            return { ...base, ok: false, message: `Error evaluando: ${e.message}` };
        }
    });
}

export class ApiTestService {

    list(moduleName: string, submodule?: string, page?: string): ApiTest[] {
        return readTests(testsPath(moduleName, submodule, page));
    }

    create(moduleName: string, data: Omit<ApiTest, 'id' | 'createdAt'>, submodule?: string, page?: string): ApiTest {
        const file = testsPath(moduleName, submodule, page);
        const tests = readTests(file);
        const test: ApiTest = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
        tests.push(test);
        writeTests(file, tests);
        return test;
    }

    delete(moduleName: string, id: string, submodule?: string, page?: string): void {
        const file = testsPath(moduleName, submodule, page);
        const tests = readTests(file).filter(t => t.id !== id);
        writeTests(file, tests);
    }

    /** Edita campos de una prueba (nombre, método, url, basePath, headers, body, status, assertions, extract). */
    update(moduleName: string, id: string, patch: Partial<ApiTest>, submodule?: string, page?: string): ApiTest {
        const file = testsPath(moduleName, submodule, page);
        const tests = readTests(file);
        const idx = tests.findIndex(t => t.id === id);
        if (idx < 0) throw new Error(`Test ${id} no encontrado`);
        const EDITABLE: (keyof ApiTest)[] = ['name', 'method', 'url', 'basePath', 'headers', 'body', 'expectedStatus', 'assertions', 'extract'];
        const clean: Partial<ApiTest> = {};
        for (const k of EDITABLE) if (k in patch) (clean as any)[k] = (patch as any)[k];
        // No permitimos cambiar id/createdAt; conservamos lastResult/history.
        tests[idx] = { ...tests[idx], ...clean };
        writeTests(file, tests);
        return tests[idx];
    }

    async run(moduleName: string, id: string, submodule?: string, page?: string, adproToken?: any, empresaNombre?: string, sucursalNombre?: string, vars: Record<string, string> = {}, urlRaiz?: string, clienteId?: number, empresaId?: number, sucursalId?: number): Promise<ApiTestResult> {
        const file = testsPath(moduleName, submodule, page);
        const tests = readTests(file);
        const test = tests.find(t => t.id === id);
        if (!test) throw new Error(`Test ${id} no encontrado`);

        // El Bearer del Marco NO sirve para /ADPRO/api: se intercambia por el token scoped a ADPRO
        // vía IniciarMovil (igual que el front). Si falla, seguimos con el de sesión.
        if (urlRaiz && adproToken?.access_token) {
            try {
                const scoped = await adproAuth.exchangeForAdpro(urlRaiz, clienteId ?? 1, empresaId ?? 0, sucursalId, adproToken, empresaNombre);
                if (scoped?.access_token) adproToken = scoped;
            } catch (e: any) {
                console.warn('[ApiTest] intercambio a token ADPRO falló, uso token de sesión:', e?.message);
            }
        }

        // Autocompletar basePath en pruebas antiguas (una sola vez) si la url coincide con la raíz activa.
        if ((test.basePath == null || test.basePath === '') && urlRaiz) {
            const bp = basePathFrom(test.url, urlRaiz);
            if (bp) test.basePath = bp;
        }

        // La URL efectiva se compone con la raíz de la empresa activa, luego se interpolan {{variables}}.
        const url = interpolate(composeUrl(test, urlRaiz, urlRaiz), vars);
        const reqBody = interpolate(test.body, vars);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        for (const [k, v] of Object.entries(test.headers ?? {})) headers[k] = interpolate(v, vars);

        // Auto-inyección del DOBLE token de ADPRO: Bearer + X-SincoERP-Authorization.
        // Igual que el flujo de UI (uiTest.service): si no hay authorization_token separado,
        // se usa el access_token como X-SincoERP-Authorization (el ERP lo acepta).
        const tokenType = adproToken?.token_type ?? adproToken?.TokenType ?? 'Bearer';
        const accessToken = adproToken?.access_token ?? adproToken?.AccessToken ?? adproToken?.Token ?? '';
        const authorizationToken = adproToken?.authorization_token ?? adproToken?.AuthorizationToken ?? accessToken;
        if (accessToken && !headers['Authorization']) headers['Authorization'] = `${tokenType} ${accessToken}`;
        if (authorizationToken && !headers['X-SincoERP-Authorization']) headers['X-SincoERP-Authorization'] = authorizationToken;
        const usedFallback = !(adproToken?.authorization_token ?? adproToken?.AuthorizationToken);
        console.log('[ApiTest] auth →', headers['Authorization'] ? 'Bearer ✓' : 'Bearer ✗', '·', headers['X-SincoERP-Authorization'] ? `X-SincoERP ✓${usedFallback ? ' (fallback access_token)' : ''}` : 'X-SincoERP ✗');
        const start = Date.now();
        console.log(`[ApiTest] ${test.method} ${url}`);

        const res = await fetch(url, {
            method: test.method,
            headers,
            body: ['GET', 'HEAD'].includes(test.method) ? undefined : (reqBody || undefined),
        });

        const time = Date.now() - start;
        console.log(`[ApiTest] → ${res.status} (${time}ms)`);
        let body: any;
        const text = await res.text();
        try { body = JSON.parse(text); } catch { body = text; }

        const statusOk = test.expectedStatus ? res.status === test.expectedStatus : res.ok;
        const assertionResults = evaluateAssertions(test.assertions, { status: res.status, time, body, bodyText: text, headers: res.headers });
        const assertionsOk = assertionResults.every(a => a.ok);
        const extracted = applyExtractions(test.extract, body);

        const result: ApiTestResult = {
            status: res.status,
            time,
            body,
            ok: statusOk && assertionsOk,
            runAt: new Date().toISOString(),
            statusOk,
            assertionResults,
            extracted: Object.keys(extracted).length ? extracted : undefined,
        };

        if (test.lastResult) {
            const entry: ApiTestRunLog = {
                status:        test.lastResult.status,
                time:          test.lastResult.time,
                ok:            test.lastResult.ok,
                runAt:         test.lastResult.runAt,
                body:          test.lastResult.body,
                empresaNombre,
                sucursalNombre,
            };
            test.history = [entry, ...(test.history ?? [])].slice(0, 20);
        }
        test.lastResult = result;
        writeTests(file, tests);

        // Historial compartido: registrar la corrida API para que la analítica la incluya.
        void recordRun({
            id: randomUUID(),
            flowId: id,
            module: moduleName,
            submodule,
            page,
            flowName: test.name,
            tipo: 'api' as any,
            runAt: result.runAt,
            passed: result.ok ? 1 : 0,
            failed: result.ok ? 0 : 1,
            ok: result.ok,
            assertionTotal: test.assertions?.length ?? 0,
            assertionFailed: (result.assertionResults ?? []).filter((a: any) => !a.ok).length,
            empresaNombre,
            sucursalNombre,
            entorno: undefined,
            urlRaiz,
        });

        return result;
    }

    async batchRun(params: {
        moduleName: string;
        submodule?: string;
        page?: string;
        testIds: string[];
        companies: { urlRaiz: string; appName: string; empNombre: string }[];
        sourceUrlRaiz: string;
        sourceToken?: any;
    }): Promise<BatchResult[]> {
        const { moduleName, submodule, page, testIds, companies, sourceUrlRaiz, sourceToken } = params;
        const allTests = readTests(testsPath(moduleName, submodule, page));
        const testsToRun = allTests.filter(t => testIds.includes(t.id));
        const results: BatchResult[] = [];

        for (const company of companies) {
            // Reutilizar token de sesión si es la misma empresa, o autenticar nueva
            let token: any = null;
            if (company.urlRaiz === sourceUrlRaiz) {
                token = sourceToken;
            } else {
                try {
                    // Token admin vía keyC (login centralizado), sin credenciales de usuario.
                    token = await captureAdproToken(`${company.urlRaiz}/Marco/Login.aspx`);
                } catch (e: any) {
                    for (const test of testsToRun) {
                        results.push({ companyUrlRaiz: company.urlRaiz, appName: company.appName, testId: test.id, testName: test.name, ok: false, status: 0, time: 0, error: `Auth: ${e.message}` });
                    }
                    continue;
                }
            }

            const tokenType   = token?.token_type   ?? token?.TokenType   ?? 'Bearer';
            const accessToken = token?.access_token  ?? token?.AccessToken ?? token?.Token ?? '';
            const authHeader  = accessToken ? `${tokenType} ${accessToken}` : '';
            // Fallback igual que UI: sin authorization_token separado, se usa el access_token.
            const authorizationToken = token?.authorization_token ?? token?.AuthorizationToken ?? accessToken;

            for (const test of testsToRun) {
                // Reapunta a la empresa destino: basePath (nueva) o reemplazo de raíz origen→destino (antigua).
                const adaptedUrl = composeUrl(test, company.urlRaiz, sourceUrlRaiz);

                const headers: Record<string, string> = { 'Content-Type': 'application/json', ...test.headers };
                if (authHeader && !headers['Authorization']) headers['Authorization'] = authHeader;
                if (authorizationToken && !headers['X-SincoERP-Authorization']) headers['X-SincoERP-Authorization'] = authorizationToken;

                const start = Date.now();
                try {
                    const ctrl = new AbortController();
                    const tid = setTimeout(() => ctrl.abort(), 10_000);
                    const res = await fetch(adaptedUrl, {
                        method: test.method,
                        headers,
                        body: ['GET', 'HEAD'].includes(test.method) ? undefined : (test.body || undefined),
                        signal: ctrl.signal,
                    });
                    clearTimeout(tid);
                    const time = Date.now() - start;
                    const statusOk = test.expectedStatus ? res.status === test.expectedStatus : res.ok;
                    let bStatusOk = statusOk;
                    let assertMsg: string | undefined;
                    if (test.assertions?.length) {
                        const bodyText = await res.text();
                        let parsed: any; try { parsed = JSON.parse(bodyText); } catch { parsed = bodyText; }
                        const ar = evaluateAssertions(test.assertions, { status: res.status, time, body: parsed, bodyText, headers: res.headers });
                        const failed = ar.filter(a => !a.ok);
                        bStatusOk = statusOk && failed.length === 0;
                        if (failed.length) assertMsg = failed.map(f => f.message).join('; ');
                    }
                    results.push({
                        companyUrlRaiz: company.urlRaiz,
                        appName: company.appName,
                        testId: test.id,
                        testName: test.name,
                        ok: bStatusOk,
                        status: res.status,
                        time,
                        error: assertMsg,
                    });
                } catch (e: any) {
                    results.push({ companyUrlRaiz: company.urlRaiz, appName: company.appName, testId: test.id, testName: test.name, ok: false, status: 0, time: Date.now() - start, error: e.name === 'AbortError' ? 'Timeout (10s)' : e.message });
                }
            }
        }
        return results;
    }
}

// Instancia compartida para reutilizar la ejecución desde Suites.
export const apiTestService = new ApiTestService();
