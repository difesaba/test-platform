import fs from 'fs';
import path from 'path';
import { envs } from '../../shared/config/envs';
import { torreService } from '../auth/torre.service';
import { randomUUID } from 'crypto';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { chromium, type Browser, type Frame, type Page } from 'playwright';
import { executeQueryParam, getPool, sql } from '../../shared/database';
import { analyzeLocators as analyzeSpecLocators, healLocators as healSpecLocators, type LocatorFinding } from './locator-analyzer';

const execAsync = promisify(exec);

export interface E2eRunLog {
    passed: number;
    failed: number;
    ok: boolean;
    runAt: string;
    output: string;
    empresaNombre?: string;
    sucursalNombre?: string;
}

// Tipo de flujo: decide qué reglas aplica el replay (data de prueba, selección de fila).
export type E2eFlowType = 'crear' | 'editar' | 'consultar' | 'otro';

// Aserciones web-first. Cada tipo mapea a una verificación de ESTADO (no solo presencia de texto):
//  appears/not-appears → visible/oculto · url-contains → toHaveURL · title-contains → toHaveTitle
//  count → toHaveCount (filas) · value → toHaveValue (un campo tiene el valor esperado)
export type E2eAssertionType = 'appears' | 'not-appears' | 'url-contains' | 'title-contains' | 'count' | 'value';
export interface E2eAssertion {
    id: string;
    type: E2eAssertionType;
    text: string;        // valor esperado: texto / fragmento de URL / título / número (count) / valor (value)
    target?: string;     // 'value': nombre o etiqueta del campo
    op?: 'atLeast' | 'exact'; // 'count': al menos N (default) o exactamente N
}
export interface E2eAssertionResult {
    id: string;
    type: E2eAssertionType;
    text: string;
    target?: string;
    op?: 'atLeast' | 'exact';
    ok: boolean;
}

export interface E2eRecording {
    id: string;
    name: string;
    url: string;
    specFile: string;
    status: 'idle' | 'recording' | 'ready' | 'error';
    createdAt: string;
    tipo?: E2eFlowType;
    originalSpec?: string;
    lastResult?: E2eResult;
    history?: E2eRunLog[];
    assertions?: E2eAssertion[];
    requirement?: string;
    locatorMeta?: CapturedElement[];
}

// Metadata rica capturada EN TIEMPO DE GRABACIÓN por elemento interactuado (self-healing Option B).
// Se usa en replay para curar un selector roto aun cuando el fix NO se deriva del string del selector.
export interface CapturedElement {
    seq: number;            // orden de interacción
    event: string;          // 'click' | 'input' | 'change'
    tag: string;            // tagName en minúscula
    id?: string;
    testId?: string;        // primero de data-testid / data-test / data-cy / data-qa
    name?: string;          // atributo name
    role?: string;          // [role] explícito o derivado del tag
    ariaLabel?: string;
    placeholder?: string;
    title?: string;
    text?: string;          // innerText recortado, ~80 chars, solo si es corto/significativo
    inputType?: string;     // atributo type del input
    classes?: string[];     // solo clases estables (se descartan css-/jss-/sc-/Mui hasheadas)
    nearbyLabel?: string;   // texto del <label for=id> asociado, o del <label> contenedor
}

export interface E2eResult {
    passed: number;
    failed: number;
    output: string;
    ok: boolean;
    runAt: string;
    screenshots?: string[];
    failureScreenshots?: string[];
    stepCount?: number;
    hasPdf?: boolean;
    hasTrace?: boolean;   // trace.zip disponible (solo se conserva cuando el flujo falla)
    assertionResults?: E2eAssertionResult[];
    healed?: string[];    // selectores que se auto-curaron en esta corrida (self-healing en vivo)
}

// Payload estructurado para armar el reporte en el cliente (PDF on-demand con @react-pdf).
// El backend es dueño del "qué" (parseo de pasos, mapeo de capturas, traducción del error);
// el frontend, del "cómo se ve".
export interface E2eDocStep {
    num: number;
    description: string;
    testName?: string;
    screenshot: string; // nombre de archivo (step_NN.png); la URL la arma el cliente
}
export interface E2eDocData {
    name: string;
    module: string;
    page?: string;
    tipo?: E2eFlowType;
    runAt?: string;
    result: { passed: number; failed: number; ok: boolean; stepCount: number };
    steps: E2eDocStep[];
    humanError?: string;
    failureScreenshots: string[]; // nombres de archivo
    outputExcerpt?: string;
}

export interface AdproSessionContext {
    urlRaiz?: string;
    clienteId?: number;
    empresaId?: number;
    sucursalId?: number;
    empresaNombre?: string;
    sucursalNombre?: string;
    entornoName?: string;
    empNombre?: string;
}

// Tracks active recording browsers by recording ID
const activeProcs = new Map<string, Browser>();
// Página activa de grabación por ID (para capturar la URL real navegada al detener)
const recPages = new Map<string, Page>();
// Buffer de metadata rica de elementos por ID de grabación (self-healing Option B).
// Poblado por el binding __tvCapture; persistido a rec.locatorMeta al detener.
const recMeta = new Map<string, CapturedElement[]>();
// ¿Es una ruta SPA real del ERP (con #/)? — si sí, salta login vía marco falso.
const hasSpaRoute = (u?: string): boolean => !!u && /#\//.test(u);

function recordingsPath(mod: string, sub?: string, page?: string): string {
    const base = path.join(process.cwd(), envs.WORKSPACE_PATH, 'modules', mod);
    let dir: string;
    if (sub && page)    dir = path.join(base, 'submodules', sub, 'pages', page, 'e2e');
    else if (page)      dir = path.join(base, 'pages', page, 'e2e');
    else if (sub)       dir = path.join(base, 'submodules', sub, 'e2e');
    else                dir = path.join(base, 'e2e');
    return path.join(dir, 'recordings.json');
}

interface E2eCtx { mod: string; sub?: string; page?: string; }

function ctxFromFile(file: string): E2eCtx {
    const parts = file.split(path.sep);
    const mi = parts.indexOf('modules');
    const mod = parts[mi + 1];
    const si = parts.indexOf('submodules');
    const pi = parts.indexOf('pages');
    return { mod, sub: si >= 0 ? parts[si + 1] : undefined, page: pi >= 0 ? parts[pi + 1] : undefined };
}

// Cobertura: cuántos flujos E2E hay por contexto (módulo/submódulo/página).
export interface E2eCoverageRow { module: string; submodule?: string; page?: string; count: number; }

// Cobertura unificada: por contexto, cuántas pruebas de cada tipo (e2e/ui/api) hay.
export interface CoverageRow { module: string; submodule?: string; page?: string; e2e: number; ui: number; api: number; count: number; }

/**
 * Recorre modules/ contando las pruebas de un tipo file-based (UI o API), que guardan un
 * arreglo JSON en `<contexto>/<leaf>/tests.json`. Devuelve una fila por contexto con datos.
 */
function collectJsonCoverage(leaf: 'ui' | 'api'): E2eCoverageRow[] {
    const base = path.join(process.cwd(), envs.WORKSPACE_PATH, 'modules');
    const out: E2eCoverageRow[] = [];
    const walk = (dir: string): void => {
        let ents: fs.Dirent[];
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { if (e.name === 'screenshots') continue; walk(full); }
            else if (e.name === 'tests.json' && path.basename(dir) === leaf) {
                try {
                    const arr = JSON.parse(fs.readFileSync(full, 'utf-8'));
                    if (Array.isArray(arr) && arr.length) {
                        const ctx = ctxFromFile(full);
                        out.push({ module: ctx.mod, submodule: ctx.sub, page: ctx.page, count: arr.length });
                    }
                } catch {}
            }
        }
    };
    walk(base);
    return out;
}

interface E2eStore {
    read(ctx: E2eCtx): Promise<E2eRecording[]>;
    write(ctx: E2eCtx, recs: E2eRecording[]): Promise<void>;
    coverage(): Promise<E2eCoverageRow[]>;
    allFlows(): Promise<Array<{ ctx: E2eCtx; rec: E2eRecording }>>;
}

class FileE2eStore implements E2eStore {
    async read(ctx: E2eCtx): Promise<E2eRecording[]> {
        const file = recordingsPath(ctx.mod, ctx.sub, ctx.page);
        if (!fs.existsSync(file)) return [];
        try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return []; }
    }
    async write(ctx: E2eCtx, recs: E2eRecording[]): Promise<void> {
        const file = recordingsPath(ctx.mod, ctx.sub, ctx.page);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(recs, null, 2), 'utf-8');
    }
    async coverage(): Promise<E2eCoverageRow[]> {
        // Best-effort: recorre modules/ buscando recordings.json y cuenta cada contexto.
        const base = path.join(process.cwd(), envs.WORKSPACE_PATH, 'modules');
        const out: E2eCoverageRow[] = [];
        const walk = (dir: string): void => {
            let ents: fs.Dirent[];
            try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const e of ents) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) { if (e.name === 'screenshots') continue; walk(full); }
                else if (e.name === 'recordings.json') {
                    try {
                        const recs = JSON.parse(fs.readFileSync(full, 'utf-8')) as E2eRecording[];
                        if (Array.isArray(recs) && recs.length) {
                            const ctx = ctxFromFile(full);
                            out.push({ module: ctx.mod, submodule: ctx.sub, page: ctx.page, count: recs.length });
                        }
                    } catch {}
                }
            }
        };
        walk(base);
        return out;
    }
    async allFlows(): Promise<Array<{ ctx: E2eCtx; rec: E2eRecording }>> {
        // Best-effort: recorre modules/ buscando recordings.json y devuelve cada flujo con su contexto.
        const base = path.join(process.cwd(), envs.WORKSPACE_PATH, 'modules');
        const out: Array<{ ctx: E2eCtx; rec: E2eRecording }> = [];
        const walk = (dir: string): void => {
            let ents: fs.Dirent[];
            try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const e of ents) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) { if (e.name === 'screenshots') continue; walk(full); }
                else if (e.name === 'recordings.json') {
                    try {
                        const recs = JSON.parse(fs.readFileSync(full, 'utf-8')) as E2eRecording[];
                        if (Array.isArray(recs)) {
                            const ctx = ctxFromFile(full);
                            for (const rec of recs) out.push({ ctx, rec });
                        }
                    } catch {}
                }
            }
        };
        walk(base);
        return out;
    }
}

class SqlE2eStore implements E2eStore {
    async read(ctx: E2eCtx): Promise<E2eRecording[]> {
        try {
            const rows = await executeQueryParam<{ data: string }>(
                'SELECT data FROM dbo.e2e_flows WHERE [module] = @m AND ((@s IS NULL AND submodule IS NULL) OR submodule = @s) AND ((@p IS NULL AND [page] IS NULL) OR [page] = @p) ORDER BY created_at',
                [
                    { name: 'm', type: sql.NVarChar, value: ctx.mod },
                    { name: 's', type: sql.NVarChar, value: ctx.sub ?? null },
                    { name: 'p', type: sql.NVarChar, value: ctx.page ?? null },
                ],
            );
            return rows.map((r) => JSON.parse(r.data) as E2eRecording);
        } catch (err) { console.error('[e2e] SqlE2eStore.read fallo', err); return []; }
    }
    async write(ctx: E2eCtx, recs: E2eRecording[]): Promise<void> {
        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx)
                .input('m', sql.NVarChar, ctx.mod)
                .input('s', sql.NVarChar, ctx.sub ?? null)
                .input('p', sql.NVarChar, ctx.page ?? null)
                .query('DELETE FROM dbo.e2e_flows WHERE [module] = @m AND ((@s IS NULL AND submodule IS NULL) OR submodule = @s) AND ((@p IS NULL AND [page] IS NULL) OR [page] = @p)');
            for (const rec of recs) {
                await new sql.Request(tx)
                    .input('id', sql.UniqueIdentifier, rec.id)
                    .input('m', sql.NVarChar, ctx.mod)
                    .input('s', sql.NVarChar, ctx.sub ?? null)
                    .input('p', sql.NVarChar, ctx.page ?? null)
                    .input('name', sql.NVarChar, rec.name)
                    .input('url', sql.NVarChar, rec.url ?? null)
                    .input('tipo', sql.VarChar, rec.tipo ?? null)
                    .input('status', sql.VarChar, rec.status ?? null)
                    .input('lok', sql.Bit, rec.lastResult ? rec.lastResult.ok : null)
                    .input('lpa', sql.Int, rec.lastResult ? rec.lastResult.passed : null)
                    .input('lfa', sql.Int, rec.lastResult ? rec.lastResult.failed : null)
                    .input('lru', sql.DateTime2, rec.lastResult ? new Date(rec.lastResult.runAt) : null)
                    .input('ac', sql.Int, rec.assertions ? rec.assertions.length : 0)
                    .input('data', sql.NVarChar(sql.MAX), JSON.stringify(rec))
                    .input('cat', sql.DateTime2, new Date(rec.createdAt))
                    .query('INSERT INTO dbo.e2e_flows (id,[module],submodule,[page],name,url,tipo,[status],last_ok,last_passed,last_failed,last_run_at,assertion_count,data,created_at) VALUES (@id,@m,@s,@p,@name,@url,@tipo,@status,@lok,@lpa,@lfa,@lru,@ac,@data,@cat)');
            }
            await tx.commit();
        } catch (err) {
            try { await tx.rollback(); } catch {}
            console.error('[e2e] SqlE2eStore.write fallo', err);
        }
    }
    async coverage(): Promise<E2eCoverageRow[]> {
        try {
            const rows = await executeQueryParam<{ module: string; submodule: string | null; page: string | null; cnt: number }>(
                'SELECT [module], submodule, [page], COUNT(*) AS cnt FROM dbo.e2e_flows GROUP BY [module], submodule, [page]',
                [],
            );
            return rows.map((r) => ({ module: r.module, submodule: r.submodule ?? undefined, page: r.page ?? undefined, count: r.cnt }));
        } catch (err) { console.error('[e2e] SqlE2eStore.coverage fallo', err); return []; }
    }
    async allFlows(): Promise<Array<{ ctx: E2eCtx; rec: E2eRecording }>> {
        try {
            const rows = await executeQueryParam<{ module: string; submodule: string | null; page: string | null; data: string }>(
                'SELECT [module], submodule, [page], data FROM dbo.e2e_flows',
                [],
            );
            return rows.map((r) => ({
                ctx: { mod: r.module, sub: r.submodule ?? undefined, page: r.page ?? undefined },
                rec: JSON.parse(r.data) as E2eRecording,
            }));
        } catch (err) { console.error('[e2e] SqlE2eStore.allFlows fallo', err); return []; }
    }
}

const e2eStore: E2eStore = (envs.E2E_STORE === 'sqlserver' && envs.db.enabled) ? new SqlE2eStore() : new FileE2eStore();

function read(file: string): Promise<E2eRecording[]> { return e2eStore.read(ctxFromFile(file)); }
function write(file: string, recs: E2eRecording[]): Promise<void> { return e2eStore.write(ctxFromFile(file), recs); }

// ---------------------------------------------------------------------------
// Historial de ejecuciones (append-only). Cada corrida de un flujo es un hecho
// inmutable: nunca se sobrescribe. Mismo patrón híbrido que los flujos —SQL si
// E2E_STORE=sqlserver y la BD está habilitada, si no un JSONL local.
// ---------------------------------------------------------------------------
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
    result?: E2eResult;
}

export interface E2eRunsFilter { mod?: string; sub?: string; page?: string; flowId?: string; limit?: number; }

// Flaky: un flujo que en sus últimas corridas alternó pass/fail sin cambios. Se agrupa por
// contexto (flujo + empresa + entorno) para no confundir "datos distintos" con "inestable".
export interface FlakyRow {
    module: string;
    submodule?: string;
    page?: string;
    flowId: string;
    flowName?: string;
    tipo?: E2eFlowType;
    empresaNombre?: string;
    entorno?: string;
    total: number;          // corridas consideradas (ventana)
    passed: number;
    failed: number;
    stabilityPct: number;   // % de verdes en la ventana
    flaky: boolean;         // mezcló pass y fail
    transitions: number;    // cuántas veces cambió de resultado (más = más inestable)
    lastOk: boolean;
    lastRunAt?: string;
    recent: { runAt: string; ok: boolean }[]; // más reciente primero
}

// Alerta: un flujo que en su corrida MÁS RECIENTE está fallando. Se agrupa por el mismo
// contexto que flaky (flujo + empresa + entorno) y cuenta la racha de fallos consecutivos.
export interface AlertRow {
    module: string;
    submodule?: string;
    page?: string;
    flowId: string;
    flowName?: string;
    tipo?: E2eFlowType;
    empresaNombre?: string;
    entorno?: string;
    runAt: string;
    consecutiveFails: number;
    error?: string;
}

// Trazabilidad a requisitos: agrupa los flujos E2E por su referencia de requisito (HU, Jira,
// ticket…) para mostrar cobertura por requisito con estado verde/rojo de la última corrida.
export interface RequirementRow {
    requirement: string;
    flows: Array<{ module: string; submodule?: string; page?: string; flowId: string; flowName?: string; tipo?: E2eFlowType; lastOk?: boolean; lastRunAt?: string }>;
    total: number;
    passing: number;
}

// Dashboard histórico: tendencia diaria de ejecuciones E2E en una ventana de N días. Cada día
// agrega cuántas corridas pasaron/fallaron; los totales resumen la ventana completa.
export interface HistoryDay { date: string; total: number; passed: number; failed: number; }
export interface HistoryReport { days: HistoryDay[]; totals: { runs: number; passed: number; failed: number; passRate: number }; }

// Resumen ejecutivo del dashboard: compone la tendencia histórica con KPIs de flaky/alertas y
// una comparación contra el período anterior (delta de tasa de éxito).
export interface DashboardTopFail { flowName?: string; module: string; submodule?: string; page?: string; empresaNombre?: string; entorno?: string; consecutiveFails: number; runAt: string; }
export interface DashboardSummary {
    days: HistoryDay[];
    totals: { runs: number; passed: number; failed: number; passRate: number };
    prevPassRate: number;   // pass rate del período anterior (mismos `days` días previos)
    deltaPassRate: number;  // totals.passRate - prevPassRate (1 decimal)
    flakyCount: number;     // flujos flaky (flakyReport con .flaky true)
    failingNow: number;     // alerts.length
    topFailing: DashboardTopFail[]; // top 5 de alerts
}

interface E2eRunsStore {
    append(run: E2eRunRecord): Promise<void>;
    list(filter: E2eRunsFilter): Promise<E2eRunRecord[]>;
}

class FileE2eRunsStore implements E2eRunsStore {
    private file = path.join(process.cwd(), envs.WORKSPACE_PATH, 'e2e-runs.jsonl');
    async append(run: E2eRunRecord): Promise<void> {
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            fs.appendFileSync(this.file, JSON.stringify(run) + '\n', 'utf-8');
        } catch (err) { console.error('[e2e] FileE2eRunsStore.append fallo', err); }
    }
    async list(filter: E2eRunsFilter): Promise<E2eRunRecord[]> {
        try {
            if (!fs.existsSync(this.file)) return [];
            const rows = fs.readFileSync(this.file, 'utf-8').split('\n').filter(Boolean)
                .map((l) => { try { return JSON.parse(l) as E2eRunRecord; } catch { return null; } })
                .filter(Boolean) as E2eRunRecord[];
            const f = rows.filter((r) =>
                (!filter.flowId || r.flowId === filter.flowId) &&
                (!filter.mod    || r.module === filter.mod) &&
                (filter.sub  === undefined || r.submodule === filter.sub) &&
                (filter.page === undefined || r.page === filter.page));
            f.sort((a, b) => (a.runAt < b.runAt ? 1 : -1));
            return f.slice(0, filter.limit ?? 200);
        } catch (err) { console.error('[e2e] FileE2eRunsStore.list fallo', err); return []; }
    }
}

class SqlE2eRunsStore implements E2eRunsStore {
    async append(run: E2eRunRecord): Promise<void> {
        try {
            await executeQueryParam(
                `INSERT INTO dbo.e2e_runs
                    (id, flow_id, [module], submodule, [page], flow_name, tipo, run_at, passed, failed, ok,
                     step_count, assertion_total, assertion_failed, empresa_nombre, sucursal_nombre, entorno, url_raiz, data)
                 VALUES
                    (@id, @flow, @m, @s, @p, @fname, @tipo, @runAt, @passed, @failed, @ok,
                     @steps, @atot, @afail, @emp, @suc, @ent, @url, @data)`,
                [
                    { name: 'id',    type: sql.UniqueIdentifier, value: run.id },
                    { name: 'flow',  type: sql.UniqueIdentifier, value: run.flowId },
                    { name: 'm',     type: sql.NVarChar, value: run.module },
                    { name: 's',     type: sql.NVarChar, value: run.submodule ?? null },
                    { name: 'p',     type: sql.NVarChar, value: run.page ?? null },
                    { name: 'fname', type: sql.NVarChar, value: run.flowName ?? null },
                    { name: 'tipo',  type: sql.VarChar,  value: run.tipo ?? null },
                    { name: 'runAt', type: sql.DateTime2, value: new Date(run.runAt) },
                    { name: 'passed', type: sql.Int, value: run.passed },
                    { name: 'failed', type: sql.Int, value: run.failed },
                    { name: 'ok',    type: sql.Bit, value: run.ok },
                    { name: 'steps', type: sql.Int, value: run.stepCount ?? null },
                    { name: 'atot',  type: sql.Int, value: run.assertionTotal },
                    { name: 'afail', type: sql.Int, value: run.assertionFailed },
                    { name: 'emp',   type: sql.NVarChar, value: run.empresaNombre ?? null },
                    { name: 'suc',   type: sql.NVarChar, value: run.sucursalNombre ?? null },
                    { name: 'ent',   type: sql.NVarChar, value: run.entorno ?? null },
                    { name: 'url',   type: sql.NVarChar, value: run.urlRaiz ?? null },
                    { name: 'data',  type: sql.NVarChar(sql.MAX), value: run.result ? JSON.stringify(run.result) : null },
                ],
            );
        } catch (err) { console.error('[e2e] SqlE2eRunsStore.append fallo', err); }
    }
    async list(filter: E2eRunsFilter): Promise<E2eRunRecord[]> {
        try {
            const top = Number(filter.limit) || 200;
            const rows = await executeQueryParam<any>(
                `SELECT TOP (${top}) id, flow_id, [module], submodule, [page], flow_name, tipo, run_at,
                        passed, failed, ok, step_count, assertion_total, assertion_failed,
                        empresa_nombre, sucursal_nombre, entorno, url_raiz, data
                 FROM dbo.e2e_runs
                 WHERE (@flow IS NULL OR flow_id = @flow)
                   AND (@m IS NULL OR [module] = @m)
                   AND (@sNull = 0 OR ((@s IS NULL AND submodule IS NULL) OR submodule = @s))
                   AND (@pNull = 0 OR ((@p IS NULL AND [page] IS NULL) OR [page] = @p))
                 ORDER BY run_at DESC`,
                [
                    { name: 'flow',  type: sql.UniqueIdentifier, value: filter.flowId ?? null },
                    { name: 'm',     type: sql.NVarChar, value: filter.mod ?? null },
                    { name: 's',     type: sql.NVarChar, value: filter.sub ?? null },
                    { name: 'p',     type: sql.NVarChar, value: filter.page ?? null },
                    { name: 'sNull', type: sql.Bit, value: filter.sub  !== undefined },
                    { name: 'pNull', type: sql.Bit, value: filter.page !== undefined },
                ],
            );
            return rows.map((r) => ({
                id: r.id,
                flowId: r.flow_id,
                module: r.module,
                submodule: r.submodule ?? undefined,
                page: r.page ?? undefined,
                flowName: r.flow_name ?? undefined,
                tipo: (r.tipo ?? undefined) as E2eFlowType | undefined,
                runAt: new Date(r.run_at).toISOString(),
                passed: r.passed,
                failed: r.failed,
                ok: !!r.ok,
                stepCount: r.step_count ?? undefined,
                assertionTotal: r.assertion_total,
                assertionFailed: r.assertion_failed,
                empresaNombre: r.empresa_nombre ?? undefined,
                sucursalNombre: r.sucursal_nombre ?? undefined,
                entorno: r.entorno ?? undefined,
                urlRaiz: r.url_raiz ?? undefined,
                result: r.data ? (JSON.parse(r.data) as E2eResult) : undefined,
            }));
        } catch (err) { console.error('[e2e] SqlE2eRunsStore.list fallo', err); return []; }
    }
}

const e2eRunsStore: E2eRunsStore = (envs.E2E_STORE === 'sqlserver' && envs.db.enabled) ? new SqlE2eRunsStore() : new FileE2eRunsStore();

// Recorder compartido: permite que ejecuciones UI/API (y cualquier otro tipo de flujo) queden
// registradas en el mismo historial que E2E, para que la analítica (flaky/alertas/dashboard)
// las incluya. Fire-and-forget: nunca bloquea ni lanza al camino de respuesta.
export async function recordRun(rec: E2eRunRecord): Promise<void> {
    try { await e2eRunsStore.append(rec); } catch (e) { console.error('[runs] recordRun fallo', e); }
}


function isLocalhostUrl(url: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
}

function isReactAppRoute(url: string): boolean {
    return /\/ADPRO\/Views\/reactapp\/#/i.test(url);
}

// Páginas ADPRO clásicas del ERP (informes/vistas .html/.aspx, ej:
// .../v3/adpro/Views/Informe/PanelInforme.html?TipInforme=811).
// Están diseñadas para correr DENTRO del Marco de SINCO como iframe hijo: el Marco
// mintea un token `vsADPRO` por sesión al abrir el reporte desde su menú. Abrir la página
// pelada (sin Marco padre, sin vsADPRO) se cuelga en "Cargando...". Por eso — igual que las
// rutas React — deben abrirse a través del Marco REAL.
// FALSE para: localhost, rutas React (se manejan aparte) y las páginas propias del Marco
// (Default_iv/Login/Seleccion, bajo /Marco/) para no recursar sobre el Marco mismo.
function isAdproErpPage(url: string): boolean {
    if (!/^https?:\/\//i.test(url)) return false;
    if (isLocalhostUrl(url)) return false;
    if (isReactAppRoute(url)) return false;
    if (/\/Marco\//i.test(url)) return false;
    return /\/adpro\//i.test(url) && /\.(aspx|html?)(\?|#|$)/i.test(url);
}

// URL que debe abrirse a través del Marco REAL de SINCO (autenticado), NO la página pelada y
// NO el "fake Marco" inyectado — porque depende del contexto de sesión que provee el Marco.
// Rutas React necesitan los globals de sesión reales (useSyncExternalStore); las páginas ADPRO
// clásicas necesitan el token vsADPRO minteado por el Marco.
function needsMarcoShell(url: string): boolean {
    return isReactAppRoute(url) || isAdproErpPage(url);
}

function tryDeriveMarcoUrl(targetUrl: string, sessionUrlRaiz: string): string | null {
    if (!targetUrl.includes('#/')) return null;
    if (isReactAppRoute(targetUrl)) return null; // Real Marco needed — fake Marco crashes React 18 useSyncExternalStore
    try {
        const pathWithoutHash = targetUrl.split('#')[0];
        const parsedTarget = new URL(pathWithoutHash);
        // Same origin: use sessionUrlRaiz — reliable for any path depth (CBRVentas, ADPRO/Views/reactapp, etc.)
        if (sessionUrlRaiz) {
            try {
                if (new URL(sessionUrlRaiz).origin === parsedTarget.origin) {
                    const base = sessionUrlRaiz.endsWith('/') ? sessionUrlRaiz : `${sessionUrlRaiz}/`;
                    return new URL('Marco/Default_iv.aspx', base).toString();
                }
            } catch { /* ignore */ }
        }
        // Fallback: derive 1 level up (works for shallow paths like CBRVentas on a different origin)
        const parts = parsedTarget.pathname.replace(/\/$/, '').split('/').filter(Boolean);
        if (parts.length < 1) return null;
        parts.pop();
        return `${parsedTarget.origin}/${parts.join('/')}/Marco/Default_iv.aspx`;
    } catch { return null; }
}

function buildSeleccionUrl(urlRaiz?: string): string {
    const base = urlRaiz?.trim();
    if (!base) return '';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return new URL('Marco/Seleccion_iv.aspx', normalizedBase).toString();
}

// Fills login credentials and clicks "Ingresar" — no Enter key, so the recorder
// captures: fill usuario → fill contraseña → click Ingresar (clean, replayable spec).
async function tryWebLogin(page: Page): Promise<void> {
    if (!/Login_iv\.aspx/i.test(page.url())) return;

    // Ingreso centralizado estilo Torre (keyC POST como usuario ERP, ej: admin).
    // NO se usan credenciales de desarrollo.
    const loginAspx = page.url().replace(/Login_iv\.aspx.*$/i, 'Login.aspx');
    let key = '';
    try {
        key = await torreService.getSsoKey();
    } catch (e) {
        console.error('[E2E Playwright] No se pudo obtener keyC de Torre:', e instanceof Error ? e.message : String(e));
        return;
    }
    const fields = torreService.loginFields(key);
    console.log('[E2E Playwright] Ingreso keyC (Torre) ->', loginAspx, '| usuario:', fields.usuario);

    try {
        await page.goto('about:blank');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined),
            page.evaluate((data: { action: string; fields: Record<string, string> }) => {
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = data.action;
                for (const [k, v] of Object.entries(data.fields)) {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = k;
                    input.value = String(v);
                    form.appendChild(input);
                }
                document.body.appendChild(form);
                form.submit();
            }, { action: loginAspx, fields }),
        ]);
        await page.waitForLoadState('networkidle').catch(() => undefined);
        if (/Login_iv\.aspx/i.test(page.url())) {
            console.log('[E2E Playwright] keyC NO autenticó (sigue en Login_iv)', { url: page.url() });
        } else {
            console.log('[E2E Playwright] Ingreso keyC OK', { currentUrl: page.url() });
        }
    } catch (e) {
        console.error('[E2E Playwright] Error en ingreso keyC:', e instanceof Error ? e.message : String(e));
    }
}


// Tries to select empresa/sucursal in a single frame. Returns true if navigation away
// from Seleccion_iv.aspx succeeded.
async function trySelectInFrame(frame: Frame, page: Page, sessionContext: AdproSessionContext): Promise<boolean> {
    // Find empresa select: first by ID pattern, then by scanning option texts
    const empresaInfo = await frame.evaluate(({ nombre, id }: { nombre: string; id: number }) => {
        const selects = Array.from(document.querySelectorAll('select'));
        if (!selects.length) return null;
        // Prefer a select whose id/name contains "empresa" (case-insensitive)
        const byId = selects.find((s) =>
            /empresa/i.test(s.id) || /empresa/i.test(s.name)
        );
        // Otherwise find one that has an option matching the empresa name or id
        const byText = selects.find((s) =>
            Array.from(s.options).some(
                (o) => o.text.trim().toLowerCase().includes(nombre.toLowerCase()) ||
                       o.value === String(id)
            )
        );
        const sel = byId ?? byText ?? null;
        if (!sel) return null;
        // Resolve which value to use: prefer matching by id number, then by name
        const optById   = Array.from(sel.options).find((o) => o.value === String(id));
        const optByName = Array.from(sel.options).find((o) =>
            o.text.trim().toLowerCase().includes(nombre.toLowerCase())
        );
        const chosen = optById ?? optByName ?? null;
        return { selector: sel.id ? `#${sel.id}` : `select[name="${sel.name}"]`, value: chosen?.value ?? null };
    }, { nombre: sessionContext.empresaNombre ?? '', id: sessionContext.empresaId ?? -1 });

    if (!empresaInfo?.value) return false;

    console.log('[E2E Playwright] Selecting empresa in frame', { frameUrl: frame.url(), empresaInfo });
    await frame.locator(empresaInfo.selector).selectOption({ value: empresaInfo.value }).catch(() => undefined);
    // Wait for any AJAX / ASP.NET postback that repopulates the sucursal dropdown
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // Find sucursal select with the same strategy
    const sucursalInfo = await frame.evaluate(({ nombre, id }: { nombre: string; id: number }) => {
        const selects = Array.from(document.querySelectorAll('select'));
        if (selects.length < 2) return null;
        const byId = selects.find((s) =>
            /sucursal/i.test(s.id) || /sucursal/i.test(s.name)
        );
        const byText = selects.find((s) =>
            Array.from(s.options).some(
                (o) => o.text.trim().toLowerCase().includes(nombre.toLowerCase()) ||
                       o.value === String(id)
            )
        );
        const sel = byId ?? byText ?? null;
        if (!sel) return null;
        const optById   = Array.from(sel.options).find((o) => o.value === String(id));
        const optByName = Array.from(sel.options).find((o) =>
            o.text.trim().toLowerCase().includes(nombre.toLowerCase())
        );
        const chosen = optById ?? optByName ?? null;
        return { selector: sel.id ? `#${sel.id}` : `select[name="${sel.name}"]`, value: chosen?.value ?? null };
    }, { nombre: sessionContext.sucursalNombre ?? '', id: sessionContext.sucursalId ?? -1 });

    if (sucursalInfo?.value) {
        console.log('[E2E Playwright] Selecting sucursal in frame', { frameUrl: frame.url(), sucursalInfo });
        await frame.locator(sucursalInfo.selector).selectOption({ value: sucursalInfo.value }).catch(() => undefined);
    }

    const btn = frame.locator([
        'button:has-text("Ingresar")',
        'button:has-text("Continuar")',
        'input[value="Ingresar"]',
        'input[value="Continuar"]',
        'input[type="submit"]',
    ].join(', ')).first();
    if (await btn.count()) await btn.click().catch(() => undefined);

    return page.waitForURL(
        (url) => !/Seleccion_iv\.aspx/i.test(url.toString()),
        { timeout: 10000 }
    ).then(() => true).catch(() => false);
}

async function injectBanner(page: Page): Promise<void> {
    const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
    for (const frame of frames) {
        await frame.evaluate(() => {
            if (document.getElementById('_tp_notice') || !document.body) return;
            const d = document.createElement('div');
            d.id = '_tp_notice';
            d.style.cssText = [
                'position:fixed', 'top:0', 'left:0', 'right:0',
                'background:#c62828', 'color:#fff',
                'padding:14px 20px', 'z-index:2147483647',
                'font-size:15px', 'font-weight:700', 'text-align:center',
                'box-shadow:0 3px 10px rgba(0,0,0,.4)', 'letter-spacing:.3px',
            ].join(';');
            d.textContent = '⚠  TestPlatform: seleccione empresa y sucursal, luego haga clic en Ingresar para continuar la grabación';
            document.body.prepend(d);
        }).catch(() => undefined);
    }
}

// Establishes a SINCO session before recording starts:
//   1. Navigates to Login_iv.aspx, fills credentials, waits 1 s, clicks "Ingresar"
//   2. On Seleccion.aspx waits 1 s for data to auto-fill, clicks "Ingresar"
// Using click (never Enter) keeps the recorded spec clean and replayable.
async function establishAdproSession(page: Page, sessionContext: AdproSessionContext): Promise<void> {
    if (!sessionContext.urlRaiz) return;

    const loginUrl = `${sessionContext.urlRaiz}/Marco/Login_iv.aspx`;
    console.log('[E2E Playwright] Navigating to SINCO login', { loginUrl });
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // ── Step 1: Login ──────────────────────────────────────────────────────────
    if (/Login_iv\.aspx/i.test(page.url())) {
        await tryWebLogin(page);
        await page.waitForLoadState('networkidle').catch(() => undefined);
    }

    // ── Step 2: Seleccion.aspx (empresa/sucursal auto-fills, then click Ingresar) ─
    const isSeleccion = (url: string) => /Seleccion(_iv)?\.aspx/i.test(url);

    if (isSeleccion(page.url())) {
        console.log('[E2E Playwright] Seleccion page — waiting 1 s for data to auto-fill');
        await page.waitForTimeout(1000);

        // Search all frames for the Ingresar button (ASP.NET frameset)
        const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
        let clicked = false;
        for (const frame of frames) {
            if (clicked) break;
            const btn = frame.locator([
                'button:has-text("Ingresar")',
                'button:has-text("Continuar")',
                'input[value="Ingresar"]',
                'input[value="Continuar"]',
                'input[type="submit"]',
            ].join(', ')).first();
            if (await btn.count()) {
                await btn.click();
                clicked = true;
            }
        }

        await page.waitForURL((url) => !isSeleccion(url.toString()), { timeout: 20000 }).catch(() => undefined);
        await page.waitForLoadState('networkidle').catch(() => undefined);
    }

    console.log('[E2E Playwright] Session established', { currentUrl: page.url() });
}

// Autentica en HEADLESS (keyC + Selección) y captura el storageState (cookies + localStorage),
// para abrir luego el navegador visible ya adentro del ERP — sin mostrar el login.
async function capturePreAuthState(sessionContext: AdproSessionContext): Promise<any | null> {
    if (!sessionContext.urlRaiz) return null;
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({ ignoreHTTPSErrors: true });
        const page = await context.newPage();
        await establishAdproSession(page, sessionContext);
        const base = sessionContext.urlRaiz.endsWith('/') ? sessionContext.urlRaiz : `${sessionContext.urlRaiz}/`;
        const marcoUrl = new URL('Marco/Default_iv.aspx', base).toString();
        await page.goto(marcoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
        await page.waitForLoadState('networkidle').catch(() => undefined);
        if (/Login(_iv)?\.aspx/i.test(page.url())) return null; // no autenticó
        return await context.storageState();
    } catch {
        return null;
    } finally {
        await browser.close().catch(() => undefined);
    }
}

export class E2eService {
    // Removes redundant actions and fixes known recorder quirks:
    //  - click() on same locator immediately after press('Enter') on it
    //  - .locator('#recttextomodulo') inside a getByTitle chain clicks an SVG rect
    //    instead of the module card — strip it so we click the title element itself
    private cleanupSpec(content: string): string {
        const actionRe = /^\s*await\s+(.+)\.(click|fill|selectOption|press|check|uncheck|dblclick|goto)\s*\(/;
        const lines = content.split('\n');
        const result: string[] = [];
        let lastPressLocator: string | null = null;
        let lastActionTrimmed: string | null = null;

        for (let line of lines) {
            // Fix: remove the inner #recttextomodulo locator so we click the parent element
            line = line.replace(/\.locator\(['"]#recttextomodulo['"]\)/g, '');

            const m = line.match(actionRe);
            if (m) {
                const [, locator, method] = m;
                const trimmed = line.trim();
                // Colapsar clics IDÉNTICOS consecutivos (doble-clic accidental al grabar).
                // Tras el primer clic la vista suele cambiar y el botón desaparece, dejando
                // el segundo clic esperando hasta el timeout (180s). Un clic basta.
                if (method === 'click' && trimmed === lastActionTrimmed) {
                    continue;
                }
                if (method === 'press' && line.includes("'Enter'")) {
                    lastPressLocator = locator.trim();
                    lastActionTrimmed = trimmed;
                    result.push(line);
                    continue;
                }
                if (lastPressLocator && method === 'click' && locator.trim() === lastPressLocator) {
                    lastPressLocator = null;
                    continue; // drop the redundant click after Enter
                }
                lastPressLocator = null;
                lastActionTrimmed = trimmed;
            }
            result.push(line);
        }
        return result.join('\n');
    }

    // Strips auth action lines from the recorded spec (goto Login/Seleccion, fill
    // credentials, click Ingresar on auth pages) and prepends a clean auth preamble
    // that uses the same flow as recording: fill → wait 1 s → click Ingresar (no Enter).
    // Lines before the first "main app" interaction (contentFrame / getByTitle) are
    // considered auth and are removed.
    private async buildRunSpec(specContent: string, ctx: AdproSessionContext, targetUrl?: string, adproToken?: any): Promise<string> {
        if (!ctx.urlRaiz) return specContent;

        // SPA con Marco+iframe (cualquier módulo): inyectar fake Marco + tokens inline en el spec
        const externalMarcoUrl = targetUrl ? tryDeriveMarcoUrl(targetUrl, ctx.urlRaiz) : null;
        if (externalMarcoUrl && adproToken?.access_token) {
            const accessToken = adproToken.access_token as string;
            const authorizationToken = (adproToken.authorization_token ?? accessToken) as string;
            const bearerValue = `${adproToken.token_type ?? 'Bearer'} ${accessToken}`;
            const iframeSrc = targetUrl!.replace(/'/g, "\\'");
            const marcoHtml = [
                '<!DOCTYPE html><html><head><meta charset="utf-8">',
                '<style>*{margin:0;padding:0}body,html{width:100%;height:100%;overflow:hidden}</style>',
                '</head><body>',
                `<iframe id="pagina1" name="pagina1" src="${iframeSrc}"`,
                ' style="width:100%;height:100vh;border:none;display:block;"></iframe>',
                '</body></html>',
            ].join('').replace(/`/g, '\\`');

            // Datos de sesión serializados para inyectarlos en localStorage via addInitScript
            const sessionPayload = JSON.stringify({
                accessToken,
                authorizationToken,
                bearerValue,
                tokenType: adproToken.token_type ?? 'Bearer',
                serializedToken: JSON.stringify(adproToken),
                urlRaiz: ctx.urlRaiz ?? '',
                empresaId: String(ctx.empresaId ?? ''),
                sucursalId: String(ctx.sucursalId ?? ''),
                empresaNombre: ctx.empresaNombre ?? '',
                sucursalNombre: ctx.sucursalNombre ?? '',
                entornoName: ctx.entornoName ?? '',
                empNombre: ctx.empNombre ?? '',
            });

            // Un solo handler: si es Marco/Default_iv.aspx → fake Marco, si no → auth headers.
            // Necesario porque Playwright procesa routes LIFO — dos handlers separados causarían
            // que **/* (registrado después) capture Marco antes que el handler específico.
            const extPreamble = [
                `  // ── External Marco SPA preamble (TestPlatform) ──────────────────────────`,
                `  // Inyectar sesión en localStorage (corre antes de cada página/iframe)`,
                `  await page.addInitScript((d) => {`,
                `    const w = (k, v) => { try { localStorage.setItem(k, v); } catch {} try { sessionStorage.setItem(k, v); } catch {} };`,
                `    w('access_token', d.accessToken);`,
                `    w('accessToken', d.accessToken);`,
                `    w('authorization_token', d.authorizationToken);`,
                `    w('adpro_token', d.serializedToken);`,
                `    w('adproToken', d.serializedToken);`,
                `    w('token', JSON.stringify({ state: { finalToken: d.accessToken, authorizationToken: d.authorizationToken }, version: 0 }));`,
                `    if (d.urlRaiz) w('urlRaiz', d.urlRaiz);`,
                `    if (d.empresaId) w('empresaId', d.empresaId);`,
                `    if (d.sucursalId) w('sucursalId', d.sucursalId);`,
                `    if (d.empresaNombre) w('empresaNombre', d.empresaNombre);`,
                `    if (d.sucursalNombre) w('sucursalNombre', d.sucursalNombre);`,
                `    if (d.entornoName) w('entornoName', d.entornoName);`,
                `    if (d.empNombre) w('empNombre', d.empNombre);`,
                `    try { window.getToken = () => d.accessToken; } catch {}`,
                `    try { window.getTokenAuth = () => d.authorizationToken; } catch {}`,
                `  }, ${sessionPayload});`,
                `  // Route único: Marco → fake Marco HTML, resto → headers de auth`,
                `  await page.route('**/*', async (route) => {`,
                `    const _url = route.request().url();`,
                `    if (/\\/Marco\\/Default_iv\\.aspx/i.test(_url)) {`,
                `      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',`,
                `        body: \`${marcoHtml}\` });`,
                `      return;`,
                `    }`,
                `    const headers = { ...route.request().headers() };`,
                `    if (!headers['authorization'] || !headers['authorization'].toLowerCase().startsWith('bearer ')) {`,
                `      headers['authorization'] = ${JSON.stringify(bearerValue)};`,
                `    }`,
                `    if (!headers['x-sincoerp-authorization']) {`,
                `      headers['x-sincoerp-authorization'] = ${JSON.stringify(authorizationToken)};`,
                `    }`,
                `    await route.continue({ headers });`,
                `  });`,
            ].join('\n');

            // Inyectar preamble + eliminar gotos de auth del spec original.
            // El spec puede tener goto(Login...), goto(Seleccion...) o goto(Marco...) grabados
            // con comportamiento anterior — los eliminamos y dejamos solo las acciones reales.
            // El preamble ya incluye goto(externalMarcoUrl) via fake Marco.
            // Also filter variable-based gotos like page.goto(datos.url) or page.goto(targetUrl)
            // that the AI-generated spec adds as setup — the preamble already handles navigation.
            const authGotoRe = /^\s*await page\.goto\s*\(\s*(?:['"`][^'"`]*(Login_iv|Seleccion_iv|Default_iv|Marco)\b|datos\.\w+|[a-z]\w*[Uu]rl\b)/i;
            const testOpenRe = /test\s*\(.*async.*\{/;
            const lines      = specContent.split('\n');
            const result: string[] = [];
            let injected = false;

            // Inject preamble at the start of EVERY test() block so each test has
            // tokens and route handlers — Playwright gives each test a fresh page.
            let anyInjected = false;
            let skipParenDepth = 0; // tracks continuation lines of a filtered multi-line call
            for (const line of lines) {
                // If we're inside a multi-line filtered statement, skip until parens close
                if (skipParenDepth > 0) {
                    for (const ch of line) {
                        if (ch === '(') skipParenDepth++;
                        else if (ch === ')') skipParenDepth--;
                    }
                    if (skipParenDepth < 0) skipParenDepth = 0;
                    continue;
                }
                if (testOpenRe.test(line)) {
                    result.push(line);
                    result.push(extPreamble);
                    result.push(`  await page.goto(${JSON.stringify(externalMarcoUrl)}, { waitUntil: 'domcontentloaded', timeout: 30000 });`);
                    result.push(`  await page.waitForLoadState('networkidle').catch(() => {});`);
                    anyInjected = true;
                } else if (anyInjected && authGotoRe.test(line)) {
                    // Count unmatched parens to skip multi-line continuations
                    let depth = 0;
                    for (const ch of line) { if (ch === '(') depth++; else if (ch === ')') depth--; }
                    if (depth > 0) skipParenDepth = depth;
                } else {
                    result.push(line);
                }
            }

            if (!anyInjected) return specContent;
            return result.join('\n');
        }

        const key = await torreService.getSsoKey();
        const keycPayload = JSON.stringify({ action: `${ctx.urlRaiz}/Marco/Login.aspx`, fields: torreService.loginFields(key) });

        // Auth preamble via keyC (estilo Torre, usuario admin) — SIN credenciales dev.
        const preamble = [
            `  // ── Auth preamble keyC (TestPlatform, estilo Torre, usuario admin) ──`,
            `  const __allFrames = () => [page.mainFrame(), ...page.frames().filter(f => f !== page.mainFrame())];`,
            `  const __clickBtn = async (texts) => {`,
            `    const sel = texts.flatMap(t => [\`button:has-text("\${t}")\`, \`input[value="\${t}"]\`]).join(', ') + ', input[type="submit"]';`,
            `    for (const fr of __allFrames()) { const b = fr.locator(sel).first(); if (await b.count()) { await b.click(); return; } }`,
            `  };`,
            `  await page.goto('about:blank');`,
            `  await Promise.all([`,
            `    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),`,
            `    page.evaluate((d) => {`,
            `      const f = document.createElement('form');`,
            `      f.method = 'POST'; f.action = d.action;`,
            `      for (const [k, v] of Object.entries(d.fields)) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = String(v); f.appendChild(i); }`,
            `      document.body.appendChild(f); f.submit();`,
            `    }, ${keycPayload}),`,
            `  ]);`,
            `  await page.waitForLoadState('networkidle').catch(() => {});`,
            `  if (/Seleccion(_iv)?\\.aspx/i.test(page.url())) {`,
            `    await page.waitForTimeout(1000);`,
            `    await __clickBtn(['Ingresar', 'Continuar']);`,
            `    await page.waitForURL(url => !/Seleccion/i.test(url.toString()), { timeout: 20000 }).catch(() => {});`,
            `    await page.waitForLoadState('networkidle').catch(() => {});`,
            `  }`,
        ].join('\n');

        // Para rutas React (reactapp/#/...) el login por keyC deja al usuario en el
        // menú del Marco; el spec grabado NO incluye la navegación del iframe (la hizo
        // el grabador). Sin esto, el replay se queda en ACTIVIDADES/SEGUIMIENTOS/ALERTAS.
        // Inyectamos la navegación de #pagina1 a la ruta destino, igual que al grabar.
        const __reactTarget = isReactAppRoute(String(targetUrl || ''));
        const __noHash = String(targetUrl || '').split('#')[0];
        const __marker = __noHash.split('/').filter(Boolean).pop() || 'reactapp';
        const iframeNav = __reactTarget ? ('\n' + [
            `  // ── Navegar el iframe #pagina1 del Marco a la ruta React destino ──`,
            `  {`,
            `    for (let __i = 0; __i < 30; __i++) {`,
            `      const __r = await page.evaluate((d) => {`,
            `        const ifr = (document.getElementById('pagina1') || document.querySelector('iframe[name="pagina1"], frame[name="pagina1"]'));`,
            `        if (!ifr) return { found: false, onTarget: false };`,
            `        let cur = '';`,
            `        try { cur = (ifr.contentWindow && ifr.contentWindow.location && ifr.contentWindow.location.href) || ''; } catch (e) {}`,
            `        if (!cur) cur = ifr.getAttribute('src') || '';`,
            `        const onTarget = cur.indexOf(d.marker) !== -1;`,
            `        if (!onTarget) { ifr.setAttribute('src', d.url); try { ifr.contentWindow.location.replace(d.url); } catch (e) {} }`,
            `        return { found: true, onTarget: onTarget };`,
            `      }, { url: ${JSON.stringify(targetUrl)}, marker: ${JSON.stringify(__marker)} });`,
            `      if (__r.onTarget) break;`,
            `      await page.waitForTimeout(400);`,
            `    }`,
            `    await page.waitForLoadState('networkidle').catch(() => {});`,
            `    await page.waitForTimeout(800);`,
            `  }`,
        ].join('\n')) : '';

        // Detect the first "main app" action line: contentFrame() or getByTitle(
        const actionRe   = /^\s*await .+\.(click|fill|selectOption|check|uncheck|dblclick|goto|press)\s*\(/;
        const mainAppRe  = /contentFrame\(\)|getByTitle\s*\(/;
        const testOpenRe = /test\s*\(.*async.*\{/;

        const lines = specContent.split('\n');
        const result: string[] = [];
        let inTestBody    = false;
        let mainAppFound  = false;
        let anyTestFound  = false;
        let skipDepth2    = 0; // tracks continuation lines of a filtered multi-line action

        for (const line of lines) {
            // Skip continuation lines of a filtered multi-line call
            if (skipDepth2 > 0) {
                for (const ch of line) { if (ch === '(') skipDepth2++; else if (ch === ')') skipDepth2--; }
                if (skipDepth2 < 0) skipDepth2 = 0;
                continue;
            }

            // Detect each test() block — reset state and inject preamble for every one
            if (testOpenRe.test(line)) {
                result.push(line);
                inTestBody   = true;
                mainAppFound = false;
                anyTestFound = true;
                result.push(preamble + iframeNav);
                continue;
            }

            if (!inTestBody) {
                result.push(line);
                continue;
            }

            // Inside test body — skip auth action lines until the first main-app line
            if (!mainAppFound) {
                if (actionRe.test(line) && mainAppRe.test(line)) {
                    mainAppFound = true;
                    result.push(line);
                } else if (actionRe.test(line)) {
                    // Drop auth action line — also track multi-line continuations
                    let depth = 0;
                    for (const ch of line) { if (ch === '(') depth++; else if (ch === ')') depth--; }
                    if (depth > 0) skipDepth2 = depth;
                } else {
                    result.push(line);
                }
            } else {
                result.push(line);
            }
        }

        // Fallback: if no test block found, return original unchanged
        if (!anyTestFound) return specContent;
        return result.join('\n');
    }

    private buildDocSpec(specContent: string, screenshotsDir: string): string {
        const fwdDir = screenshotsDir.replace(/\\/g, '/');
        const actionRe = /^\s*await .+\.(click|fill|selectOption|check|uncheck|dblclick|goto)\s*\(/;
        const testOpenRe = /^\s*test\s*\(/;
        const lines = specContent.split('\n');
        const result: string[] = [];
        let stepN = 0;
        let helperInjected = false;
        let multiLineDepth = 0; // skip __snap injection inside multi-line action calls

        for (const line of lines) {
            if (testOpenRe.test(line)) {
                helperInjected = false;
                multiLineDepth = 0;
            }

            // Track whether we're inside a multi-line call (don't inject __snap mid-statement)
            if (multiLineDepth > 0) {
                result.push(line);
                for (const ch of line) { if (ch === '(') multiLineDepth++; else if (ch === ')') multiLineDepth--; }
                if (multiLineDepth < 0) multiLineDepth = 0;
                continue;
            }

            if (!helperInjected && actionRe.test(line)) {
                const indent = line.match(/^(\s*)/)?.[1] ?? '  ';
                result.push(
                    `${indent}const __snap = async (p: string) => { try { await page.waitForTimeout(500); await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {}); const __fr = page.frame({ name: 'pagina1' }); if (__fr) { await __fr.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {}); } await page.waitForTimeout(350); if (await page.locator('#pagina1').count()) { await page.locator('#pagina1').screenshot({ path: p, timeout: 6000 }); } else { await page.screenshot({ path: p, timeout: 6000 }); } } catch {} };`
                );
                helperInjected = true;
            }
            result.push(line);
            if (actionRe.test(line)) {
                stepN++;
                const padded = String(stepN).padStart(2, '0');
                const indent = line.match(/^(\s*)/)?.[1] ?? '  ';
                result.push(`${indent}await __snap('${fwdDir}/step_${padded}.png');`);
                // Detect if this action spans multiple lines — track open parens
                let depth = 0;
                for (const ch of line) { if (ch === '(') depth++; else if (ch === ')') depth--; }
                if (depth > 0) multiLineDepth = depth;
            }
        }

        return result.join('\n');
    }

    /**
     * Self-healing en tiempo de ejecución (Opción A): reescribe `scope.locator('sel').accion(`
     * a `__smart(scope, 'sel').accion(`. El helper inyectado intenta el selector original y, si
     * no aparece, reintenta con candidatos derivados del propio selector (getByRole/Label/Text/
     * Placeholder) en el MISMO scope (page o frame). Si un candidato cura, deja un log `[HEAL] curó…`.
     * Solo toca cadenas `.locator(...).accion()` directas (no expects, no .first()/.nth() intermedios).
     */
    private applyLocatorHealing(spec: string, meta?: CapturedElement[]): string {
        const ACTION = 'click|fill|check|uncheck|selectOption|dblclick|type|press|hover|focus';
        const re = new RegExp(
            String.raw`\b((?:page|frame|[A-Za-z_$][\w$]*)(?:\.(?:frameLocator|frame)\([^()]*\))?)\.locator\((['"])((?:\\.|(?!\2).)*)\2\)\s*\.(${ACTION})\(`,
            'g',
        );
        const healed = spec.replace(re, (_w, scope, q, sel, action) => `__smart(${scope}, ${q}${sel}${q}).${action}(`);
        if (healed === spec) return spec; // no había locators sanables → no inyectamos nada

        const nl = spec.includes('\r\n') ? '\r\n' : '\n';
        // Metadata rica capturada en grabación (Option B). Vacío para grabaciones viejas → no-op.
        const metaJson = JSON.stringify(Array.isArray(meta) ? meta : []);
        const helper = [
            `// ── self-healing de selectores (inyectado por TestVerse) ──`,
            `const __meta = ${metaJson};`,
            `function __metaMatch(sel) {`,
            `  try {`,
            `    if (!__meta || !__meta.length) return null;`,
            `    const low = String(sel).toLowerCase();`,
            `    const has = (v, s) => (v != null && String(v).length >= 2 && low.indexOf(String(v).toLowerCase()) >= 0) ? s : -1;`,
            `    let best = null, bestScore = 0;`,
            `    for (let i = 0; i < __meta.length; i++) {`,
            `      const e = __meta[i]; let score = 0;`,
            `      score = Math.max(score, has(e.testId, 6));`,
            `      score = Math.max(score, has(e.id, 5));`,
            `      score = Math.max(score, has(e.name, 4));`,
            `      score = Math.max(score, has(e.ariaLabel, 3));`,
            `      score = Math.max(score, has(e.nearbyLabel, 3));`,
            `      score = Math.max(score, has(e.text, 2));`,
            `      if (score > bestScore) { bestScore = score; best = e; }`,
            `    }`,
            `    return best;`,
            `  } catch (e) { return null; }`,
            `}`,
            `function __cands(scope, sel) {`,
            `  const out = [{ loc: scope.locator(sel), desc: 'original' }]; let m;`,
            String.raw`  if ((m = sel.match(/\[aria-label=["']([^"']+)["']\]/i))) out.push({ loc: scope.getByLabel(m[1]), desc: 'aria-label' });`,
            String.raw`  if ((m = sel.match(/\[placeholder=["']([^"']+)["']\]/i))) out.push({ loc: scope.getByPlaceholder(m[1]), desc: 'placeholder' });`,
            String.raw`  if ((m = sel.match(/\[data-testid=["']([^"']+)["']\]/i))) out.push({ loc: scope.getByTestId(m[1]), desc: 'data-testid' });`,
            String.raw`  let t = sel.match(/:has-text\(\s*["']([^"']+)["']\s*\)/i) || sel.match(/>>\s*text=["']?([^"']+)["']?/i);`,
            `  if (t) { const tag = (sel.match(/^([a-z]+)/i)||[])[1]||''; const role = tag==='button'?'button':tag==='a'?'link':(tag==='input'||tag==='textarea')?'textbox':null; out.push({ loc: role ? scope.getByRole(role, { name: t[1] }) : scope.getByText(t[1]), desc: 'has-text' }); }`,
            String.raw`  let x = sel.match(/^(?:xpath=)?\/\/([a-z*]+)\[[^\]]*(?:contains\(\s*(?:\.|text\(\))\s*,\s*|text\(\)\s*=\s*)["']([^"']+)["']/i);`,
            `  if (x) { const role = x[1]==='button'?'button':x[1]==='a'?'link':null; out.push({ loc: role ? scope.getByRole(role, { name: x[2] }) : scope.getByText(x[2]), desc: 'xpath-text' }); }`,
            `  try {`,
            `    const e = __metaMatch(sel);`,
            `    if (e) {`,
            `      const seen = {};`,
            `      const add = (loc, d) => { if (loc && !seen[d]) { seen[d] = 1; out.push({ loc: loc, desc: d }); } };`,
            `      if (e.testId) add(scope.getByTestId(e.testId), 'meta:testId');`,
            `      if (e.id) add(scope.locator('[id="' + e.id + '"]'), 'meta:id');`,
            `      const rn = e.ariaLabel || e.nearbyLabel || e.text;`,
            `      if (e.role && rn) add(scope.getByRole(e.role, { name: rn, exact: false }), 'meta:role');`,
            `      const ln = e.ariaLabel || e.nearbyLabel;`,
            `      if (ln) add(scope.getByLabel(ln, { exact: false }), 'meta:label');`,
            `      if (e.placeholder) add(scope.getByPlaceholder(e.placeholder), 'meta:placeholder');`,
            `      if (e.name) add(scope.locator('[name="' + e.name + '"]'), 'meta:name');`,
            `      if (e.text) add(scope.getByText(e.text, { exact: false }), 'meta:text');`,
            `    }`,
            `  } catch (e) {}`,
            `  return out;`,
            `}`,
            `async function __pick(scope, sel) {`,
            `  const cs = __cands(scope, sel);`,
            `  for (let i = 0; i < cs.length; i++) {`,
            `    try { if ((await cs[i].loc.count()) > 0) { if (i > 0) console.log('[HEAL] curó "' + sel + '" con candidato #' + i + ' (' + cs[i].desc + ')'); return cs[i].loc.first(); } } catch (e) {}`,
            `  }`,
            `  return scope.locator(sel).first();`,
            `}`,
            `const __smart = (scope, sel) => ({`,
            `  click: async (o) => (await __pick(scope, sel)).click(o),`,
            `  fill: async (v, o) => (await __pick(scope, sel)).fill(v, o),`,
            `  check: async (o) => (await __pick(scope, sel)).check(o),`,
            `  uncheck: async (o) => (await __pick(scope, sel)).uncheck(o),`,
            `  selectOption: async (v, o) => (await __pick(scope, sel)).selectOption(v, o),`,
            `  dblclick: async (o) => (await __pick(scope, sel)).dblclick(o),`,
            `  type: async (v, o) => (await __pick(scope, sel)).type(v, o),`,
            `  press: async (k, o) => (await __pick(scope, sel)).press(k, o),`,
            `  hover: async (o) => (await __pick(scope, sel)).hover(o),`,
            `  focus: async (o) => (await __pick(scope, sel)).focus(o),`,
            `});`,
        ].join(nl);

        const lines = healed.split(/\r?\n/);
        let injectAt = 0;
        for (let i = 0; i < lines.length; i++) if (/^\s*import\b/.test(lines[i])) injectAt = i + 1;
        lines.splice(injectAt, 0, helper);
        return lines.join(nl);
    }

    // ── Reglas de datos de prueba (Rules 1/2/4) ──────────────────────────────
    //  Rule 1: cada .fill() de texto recibe data de prueba "QA <campo> <fecha> <hora>".
    //          Campos de fecha → fecha de hoy; valores numéricos (cantidades/precios)
    //          se dejan igual; limpiar campo (fill vacío) se respeta.
    //  Rule 4: el MISMO texto tecleado en varios pasos reusa el MISMO valor generado,
    //          así "crear X" y luego "buscar X" quedan encadenados y la búsqueda
    //          encuentra lo que se acaba de crear.
    //  Rule 2: se inserta una pequeña espera antes de cada acción de la app para
    //          estabilizar el replay en React (evita clic antes de render).
    //  Rule 3 (evidencia) sale sola: generatePDF parsea ESTE spec ya transformado,
    //          por lo que el reporte muestra los valores de prueba realmente usados.
    // ── Aserciones (roadmap #1): el flujo AFIRMA, no solo "no crashea" ──
    //  Cada aserción de texto se evalúa contra TODOS los frames al final del flujo.
    //  Si alguna no se cumple, se lanza un error → el flujo queda "Falló por aserción".
    private applyAssertions(spec: string, assertions: E2eAssertion[]): string {
        if (!assertions?.length) return spec;
        const nl2 = spec.includes('\r\n') ? '\r\n' : '\n';
        // Serializamos las defs como JSON (válido en JS) — evita escapar a mano el texto del usuario.
        const defs = assertions.map((a) => ({ id: a.id, type: a.type, text: a.text ?? '', target: a.target ?? '', op: a.op ?? 'atLeast' }));

        const block = [
            '',
            '    // ── Aserciones TestVerse (web-first, multi-frame por el ERP en iframe) ──',
            '    const __defs = ' + JSON.stringify(defs) + ';',
            '    const __assertions: { id: string; type: string; text: string; target: string; op: string; ok: boolean }[] = [];',
            '    const __frames = () => page.frames();',
            '    // Reintenta fn() hasta que devuelva true o venza el tiempo (auto-wait manual).',
            '    const __until = async (fn: () => Promise<boolean>, ms: number): Promise<boolean> => {',
            '        const __dl = Date.now() + ms;',
            '        while (Date.now() < __dl) { try { if (await fn()) return true; } catch {} await page.waitForTimeout(300); }',
            '        try { return await fn(); } catch { return false; }',
            '    };',
            '    const __hasText = async (t: string): Promise<boolean> => {',
            '        for (const __fr of __frames()) { try { if ((await __fr.getByText(t, { exact: false }).count()) > 0) return true; } catch {} }',
            '        return false;',
            '    };',
            '    const __rowCount = async (): Promise<number> => {',
            '        let __max = 0;',
            '        for (const __fr of __frames()) { try { const __c = await __fr.getByRole(\'row\').count(); if (__c > __max) __max = __c; } catch {} }',
            '        return __max;',
            '    };',
            '    const __fieldValue = async (name: string): Promise<string | null> => {',
            '        for (const __fr of __frames()) {',
            '            for (const __loc of [__fr.getByRole(\'textbox\', { name }), __fr.getByRole(\'combobox\', { name }), __fr.getByLabel(name)]) {',
            '                try { if ((await __loc.count()) > 0) return (await __loc.first().inputValue()); } catch {}',
            '            }',
            '        }',
            '        return null;',
            '    };',
            '    const __norm = (s: string) => (s || \'\').trim().toLowerCase();',
            '    const __assertOne = async (a: { id: string; type: string; text: string; target: string; op: string }): Promise<void> => {',
            '        let ok = false;',
            '        if (a.type === \'appears\')            ok = await __until(() => __hasText(a.text), 8000);',
            '        else if (a.type === \'not-appears\') { await page.waitForTimeout(1000); ok = !(await __hasText(a.text)); }',
            '        else if (a.type === \'url-contains\')   ok = await __until(async () => __norm(page.url()).includes(__norm(a.text)), 6000);',
            '        else if (a.type === \'title-contains\') ok = await __until(async () => __norm(await page.title()).includes(__norm(a.text)), 6000);',
            '        else if (a.type === \'count\') { const __n = parseInt(a.text, 10) || 0; ok = await __until(async () => { const __c = await __rowCount(); return a.op === \'exact\' ? __c === __n : __c >= __n; }, 8000); }',
            '        else if (a.type === \'value\')          ok = await __until(async () => { const __v = await __fieldValue(a.target); return __v != null && __norm(__v).includes(__norm(a.text)); }, 8000);',
            '        __assertions.push({ id: a.id, type: a.type, text: a.text, target: a.target, op: a.op, ok });',
            '    };',
            '    for (const __a of __defs) { await __assertOne(__a); }',
            "    console.log('TV_ASSERTIONS:' + JSON.stringify(__assertions));",
            '    {',
            '        const __describe = (a: { type: string; text: string; target: string; op: string }) => {',
            '            if (a.type === \'appears\') return \'no apareció el texto "\' + a.text + \'"\';',
            '            if (a.type === \'not-appears\') return \'apareció el texto "\' + a.text + \'"\';',
            '            if (a.type === \'url-contains\') return \'la URL no contiene "\' + a.text + \'"\';',
            '            if (a.type === \'title-contains\') return \'el título no contiene "\' + a.text + \'"\';',
            '            if (a.type === \'count\') return \'la cantidad de filas no es \' + (a.op === \'exact\' ? \'\' : \'al menos \') + a.text;',
            '            if (a.type === \'value\') return \'el campo "\' + a.target + \'" no tiene el valor "\' + a.text + \'"\';',
            '            return \'aserción no cumplida\';',
            '        };',
            '        const __fl = __assertions.filter((a) => !a.ok);',
            "        if (__fl.length) { throw new Error('Aserción fallida: ' + __fl.map(__describe).join(' | ')); }",
            '    }',
            '',
        ].join(nl2);
        const idx = spec.lastIndexOf('});');
        if (idx < 0) return spec + nl2 + block;
        return spec.slice(0, idx) + block + nl2 + spec.slice(idx);
    }

    private applyDataRules(spec: string, opts?: { testData?: boolean; waitBetween?: boolean }): string {
        const testData    = opts?.testData !== false;
        const waitBetween = opts?.waitBetween !== false;
        const nl = spec.includes('\r\n') ? '\r\n' : '\n';
        const lines = spec.split(/\r?\n/);

        const d = new Date();
        const p2 = (n: number) => String(n).padStart(2, '0');
        const fechaHoy = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
        const stamp    = `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

        // Reusar el mismo valor cuando se tecleó el mismo texto (encadenado entre pasos).
        const porTexto = new Map<string, string>();
        const genValor = (campo: string, original: string): string | null => {
            if (/fecha|date/i.test(campo)) return fechaHoy;      // campo fecha → hoy
            if (original.trim() === '') return null;             // limpiar campo → respetar
            if (/^[\d.,\s$%-]+$/.test(original)) return null;    // numérico → no tocar
            const key = original.trim().toLowerCase();
            const prev = porTexto.get(key);
            if (prev) return prev;
            const nombre = (campo || 'dato').replace(/[*:]/g, ' ').replace(/\s+/g, ' ').trim() || 'dato';
            const val = `QA ${nombre} ${stamp}`;
            porTexto.set(key, val);
            return val;
        };

        const actionRe = /^(\s*)await\s+.+\.(click|fill|selectOption|check|uncheck|dblclick|goto|press)\s*\(/;
        const isAppAction = (l: string) =>
            /contentFrame\(\)|getByTitle\(|getByRole\(|getByLabel\(|getByPlaceholder\(/.test(l) && !/\.goto\(/.test(l);
        const out: string[] = [];

        for (const line of lines) {
            const m = line.match(actionRe);
            if (m && waitBetween && isAppAction(line)) {
                out.push(`${m[1]}await page.waitForTimeout(500);`);
            }
            // ✋ Combo/autocomplete: el .fill() es el texto de BÚSQUEDA para filtrar y luego seleccionar
            // una opción que YA existe (líneas siguientes: click en option/button del resultado). Si le
            // inyectamos data inventada, teclea algo inexistente y no selecciona nada. Preservamos el
            // término grabado. Detectamos por el rol combobox (así los graba SINCO).
            const esComboFill = /getByRole\(\s*['"]combobox['"]/.test(line) || /role:\s*['"]combobox['"]/.test(line);
            if (m && testData && /\.fill\(/.test(line) && !esComboFill) {
                let campo = '';
                const nameM  = line.match(/name:\s*['"]([^'"]+)['"]/);
                const labelM = line.match(/getByLabel\(['"]([^'"]+)['"]/);
                const phM    = line.match(/getByPlaceholder\(['"]([^'"]+)['"]/);
                if (nameM) campo = nameM[1]; else if (labelM) campo = labelM[1]; else if (phM) campo = phM[1];
                const fillM = line.match(/\.fill\((['"])([\s\S]*?)\1\)/);
                if (fillM) {
                    const nuevo = genValor(campo, fillM[2]);
                    if (nuevo !== null) {
                        const safe = nuevo.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                        out.push(line.replace(/\.fill\((['"])[\s\S]*?\1\)/, `.fill('${safe}')`));
                        continue;
                    }
                }
            }
            out.push(line);
        }
        return out.join(nl);
    }

    // Selección dinámica de registro (Editar/Consultar). Un clic sobre una celda/fila
    // ESPECÍFICA (por texto) se reescribe a la fila destino:
    //   editar   → primera fila de prueba (texto "QA", lo que se creó antes)
    //   consultar→ primera fila de datos (la 0 es el encabezado)
    // Solo toca clics sobre gridcell/cell/row/rowheader por nombre; botones y campos
    // quedan intactos. Best-effort: si la grilla es muy custom puede requerir ajuste.
    private applyRowSelection(spec: string, tipo: 'editar' | 'consultar'): string {
        const nl = spec.includes('\r\n') ? '\r\n' : '\n';
        const lines = spec.split(/\r?\n/);
        const rowLoc = tipo === 'editar'
            ? "getByRole('row').filter({ hasText: 'QA' }).first()"
            : "getByRole('row').nth(1)";
        const selRe = /getByRole\(\s*['"](?:gridcell|cell|row|rowheader)['"]\s*,\s*\{\s*name:\s*['"][^'"]*['"]\s*\}\s*\)/;
        const out: string[] = [];
        let rewrites = 0;
        for (const line of lines) {
            if (/\.(click|dblclick)\(\)/.test(line) && /contentFrame\(\)/.test(line) && selRe.test(line)) {
                out.push(line.replace(selRe, rowLoc));
                rewrites++;
                continue;
            }
            out.push(line);
        }
        if (rewrites) console.log('[E2E Playwright] applyRowSelection', { tipo, rewrites, rowLoc });
        return out.join(nl);
    }

    private parseSpecSteps(specContent: string): { step: number; description: string; isPageAction: boolean; testName?: string }[] {
        const actionRe   = /^\s*await .+\.(click|fill|selectOption|check|uncheck|dblclick|goto)\s*\(/;
        const testNameRe = /^\s*test\s*\(\s*['"`]([^'"`]+)['"`]/;
        const steps: { step: number; description: string; isPageAction: boolean; testName?: string }[] = [];
        let stepN = 0;
        let currentTestName = '';
        for (const line of specContent.split('\n')) {
            const testMatch = line.match(testNameRe);
            if (testMatch) { currentTestName = testMatch[1]; continue; }
            if (!actionRe.test(line)) continue;
            stepN++;
            const isPageAction = line.includes('contentFrame()');
            const gotoM = line.match(/\.goto\(['"]([^'"]+)['"]\)/);
            if (gotoM) {
                const url = gotoM[1];
                const pagePart = url.split('#').pop()?.split('/').filter(Boolean).pop() ?? url;
                steps.push({ step: stepN, description: `Navegar a: ${pagePart}`, isPageAction, testName: currentTestName }); continue;
            }
            const fillRoleM = line.match(/getByRole\([^)]+name:\s*['"]([^'"]+)['"]\s*\}\)\.fill\(['"]([^'"]*)['"]\)/);
            if (fillRoleM) { steps.push({ step: stepN, description: `Ingresar "${fillRoleM[2]}" en el campo "${fillRoleM[1]}"`, isPageAction, testName: currentTestName }); continue; }
            const fillLocM = line.match(/\.locator\(['"]([^'"]+)['"]\)\.fill\(['"]([^'"]*)['"]\)/);
            if (fillLocM) { steps.push({ step: stepN, description: `Ingresar "${fillLocM[2]}" en campo ${fillLocM[1]}`, isPageAction, testName: currentTestName }); continue; }
            const fillM = line.match(/\.fill\(['"]([^'"]*)['"]\)/);
            if (fillM) { steps.push({ step: stepN, description: fillM[1] ? `Ingresar valor: "${fillM[1]}"` : 'Limpiar campo', isPageAction, testName: currentTestName }); continue; }
            const selLocM = line.match(/\.locator\(['"]([^'"]+)['"]\)\.selectOption\(/);
            if (selLocM) { steps.push({ step: stepN, description: `Seleccionar opción en combo: ${selLocM[1]}`, isPageAction, testName: currentTestName }); continue; }
            const selM = line.match(/\.selectOption\(['"]([^'"]*)['"]\)/);
            if (selM) { steps.push({ step: stepN, description: `Seleccionar: "${selM[1]}"`, isPageAction, testName: currentTestName }); continue; }
            const frameClickM = line.match(/contentFrame\(\).+name:\s*['"]([^'"]+)['"]\s*\}\)\.click/);
            if (frameClickM) { steps.push({ step: stepN, description: `Clic en: "${frameClickM[1]}"`, isPageAction, testName: currentTestName }); continue; }
            const btnM = line.match(/getByRole\(['"]button['"],\s*\{\s*name:\s*['"]([^'"]+)['"]/);
            if (btnM) { steps.push({ step: stepN, description: `Clic en botón: "${btnM[1]}"`, isPageAction, testName: currentTestName }); continue; }
            const locBtnM = line.match(/\.locator\(['"]([^'"]*(?:btn|button|Btn|Button|guardar|Guardar|buscar|Buscar|confirmar|Confirmar)[^'"]*)['"]\)\.click/i);
            if (locBtnM) { steps.push({ step: stepN, description: `Clic en botón: ${locBtnM[1]}`, isPageAction, testName: currentTestName }); continue; }
            const titleM = line.match(/getByTitle\(['"]([^'"]+)['"]\)/);
            if (titleM) { steps.push({ step: stepN, description: `Abrir módulo: "${titleM[1]}"`, isPageAction, testName: currentTestName }); continue; }
            const checkM = line.match(/\.(check|uncheck)\(\)/);
            if (checkM) { steps.push({ step: stepN, description: checkM[1] === 'check' ? 'Marcar casilla' : 'Desmarcar casilla', isPageAction, testName: currentTestName }); continue; }
            const dblM = line.match(/\.dblclick\(\)/);
            if (dblM) { steps.push({ step: stepN, description: 'Doble clic en elemento', isPageAction, testName: currentTestName }); continue; }
            // Variable-based fill: varName.fill('value') or varName.fill(variable)
            const varFillLitM = line.match(/\b(\w+)\.fill\(['"]([^'"]*)['"]\)/);
            if (varFillLitM) { steps.push({ step: stepN, description: varFillLitM[2] ? `Ingresar "${varFillLitM[2]}"` : 'Limpiar campo', isPageAction, testName: currentTestName }); continue; }
            const varFillRefM = line.match(/\b(\w+)\.fill\((\w+)\)/);
            if (varFillRefM) { steps.push({ step: stepN, description: 'Ingresar valor en campo', isPageAction, testName: currentTestName }); continue; }
            // Variable-based click: varName.click()
            const varClickM = line.match(/\b(\w+)\.click\(\)/);
            if (varClickM) {
                const vname = varClickM[1].toLowerCase();
                let desc = 'Clic en elemento';
                if (/guardar|save|submit|confirm/i.test(vname))    desc = 'Clic en botón Guardar';
                else if (/eliminar|delete|remove|borrar/i.test(vname)) desc = 'Clic en botón Eliminar';
                else if (/buscar|search|find/i.test(vname))        desc = 'Clic en botón Buscar';
                else if (/cancelar|cancel|cerrar|close/i.test(vname)) desc = 'Clic en botón Cancelar';
                else if (/input|campo|field|txt|text/i.test(vname)) desc = 'Clic en campo de texto';
                else if (/btn|boton|button/i.test(vname))          desc = 'Clic en botón';
                else if (/modal|dialog/i.test(vname))              desc = 'Clic en modal';
                else if (/negativo|negative/i.test(vname))         desc = 'Clic para validar caso negativo';
                steps.push({ step: stepN, description: desc, isPageAction, testName: currentTestName }); continue;
            }
            const generic = line.trim().replace(/^await\s+/, '').replace(/\s*\{[^}]*\}/g, '').substring(0, 90);
            steps.push({ step: stepN, description: generic, isPageAction, testName: currentTestName });
        }
        return steps;
    }

    private translatePlaywrightError(raw: string): string {
        const lines = raw.split('\n').slice(0, 30).join('\n');
        let msg = 'Ocurrió un error durante la ejecución del test.';

        if (/Aserción fallida/i.test(lines))            msg = (lines.match(/Aserción fallida:[^\n]*/)?.[0]) ?? 'Una aserción del flujo no se cumplió.';
        else if (/toBeVisible.*failed/i.test(lines))    msg = 'Un elemento que debería estar visible no apareció en pantalla dentro del tiempo de espera.';
        else if (/toBeHidden.*failed/i.test(lines))     msg = 'Un elemento que debería estar oculto siguió visible en pantalla.';
        else if (/toBeDisabled.*failed/i.test(lines))   msg = 'Se esperaba que un botón o campo estuviera deshabilitado, pero estaba activo.';
        else if (/toBeEnabled.*failed/i.test(lines))    msg = 'Se esperaba que un botón o campo estuviera habilitado, pero estaba deshabilitado.';
        else if (/toBeEmpty.*failed/i.test(lines))      msg = 'Se esperaba que un campo estuviera vacío, pero tenía contenido.';
        else if (/toHaveValue.*failed/i.test(lines))    msg = 'El valor de un campo no coincidió con el valor esperado.';
        else if (/toContainText.*failed/i.test(lines))  msg = 'El texto esperado no se encontró en el elemento.';
        else if (/not\.toBeVisible.*failed/i.test(lines)) msg = 'Se esperaba que un elemento no estuviera visible, pero sí aparecía en pantalla.';
        else if (/element.*not found/i.test(lines))     msg = 'El elemento indicado no existe en la página actual.';
        else if (/Timeout.*exceeded/i.test(lines))      msg = 'Se agotó el tiempo de espera. La página o el elemento tardó demasiado en responder.';
        else if (/ReferenceError/i.test(lines))         msg = 'Error en el código del test: se usó una variable que no está definida en este bloque.';
        else if (/locator.*resolved.*multiple/i.test(lines)) msg = 'El selector encontró múltiples elementos. Debe ser más específico.';

        // Extract the locator for context
        const locatorM = raw.match(/Locator:\s*(.+)/);
        const locatorHint = locatorM ? `\nSelector involucrado: ${locatorM[1].trim().substring(0, 120)}` : '';

        // Extract the failing line
        const lineM = raw.match(/^\s*>\s*\d+\s*\|(.+)$/m);
        const lineHint = lineM ? `\nLínea que falló: ${lineM[1].trim().substring(0, 120)}` : '';

        return msg + locatorHint + lineHint;
    }

    private buildPdfHtml(
        rec: E2eRecording,
        steps: { step: number; description: string; isPageAction: boolean; testName?: string }[],
        screenshotsDir: string,
        mod: string,
        pageName?: string,
        failureScreenshots?: string[]
    ): string {
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const date = new Date(rec.lastResult?.runAt ?? new Date().toISOString())
            .toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
        const totalPassed = rec.lastResult?.passed ?? 0;
        const totalFailed = rec.lastResult?.failed ?? 0;
        const stepCount   = rec.lastResult?.stepCount ?? 0;
        const ok          = rec.lastResult?.ok ?? false;
        const pct         = ok ? 100 : (totalFailed > 0 ? 0 : 100);
        const pctColor    = ok ? '#16a34a' : '#dc2626';
        const pctIcon     = ok ? '✓' : '✗';
        const pctLabel    = ok
            ? `${pctIcon} ${stepCount} paso(s) completados correctamente`
            : stepCount > 0
                ? `${pctIcon} ${stepCount} paso(s) ejecutados — el test falló`
                : '✗ El test no completó ningún paso';

        const resultBadge = `
          <div style="display:flex;align-items:center;gap:12px;margin-top:10px;">
            <div style="flex:1;background:#e5e7eb;border-radius:999px;height:14px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${pctColor};border-radius:999px;transition:width .3s;"></div>
            </div>
            <span style="font-weight:700;font-size:14px;color:${pctColor};white-space:nowrap;">${pct}%</span>
          </div>
          <div style="margin-top:6px;font-size:12px;color:${pctColor};font-weight:600;">${esc(pctLabel)}</div>`;

        // Show every step that has a screenshot on disk — robust regardless of
        // whether the spec uses contentFrame() inline or via a stored variable.
        const pageSteps = steps.filter(s => {
            const imgFile = path.join(screenshotsDir, `step_${String(s.step).padStart(2, '0')}.png`);
            return fs.existsSync(imgFile);
        });

        // Group steps by test name for section headers in PDF
        let lastTestName = '';
        const rows = pageSteps.map((s, idx) => {
            const displayNum = idx + 1;
            const imgFile = path.join(screenshotsDir, `step_${String(s.step).padStart(2, '0')}.png`);
            const imgTag = `<img src="data:image/png;base64,${fs.readFileSync(imgFile).toString('base64')}" style="max-width:100%;border:1px solid #e5e7eb;border-radius:4px;" />`;

            let sectionHeader = '';
            if (s.testName && s.testName !== lastTestName) {
                lastTestName = s.testName;
                const isNegative = /negativo|negativa|error|fallo|sin completar/i.test(s.testName);
                const sectionColor = isNegative ? '#7f1d1d' : '#1e3a5f';
                sectionHeader = `
                <div style="margin:32px 0 16px;padding:10px 16px;background:${sectionColor};color:#fff;border-radius:6px;font-size:13px;font-weight:700;">
                  ${isNegative ? '⚠' : '▶'} ${esc(s.testName)}
                </div>`;
            }

            return `${sectionHeader}
            <div style="page-break-inside:avoid;margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <div style="background:#f8fafc;padding:10px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #e5e7eb;">
                <span style="background:#1e3a5f;color:#fff;font-weight:700;border-radius:50%;min-width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;">${displayNum}</span>
                <span style="font-size:13px;color:#1f2937;font-weight:500;">${esc(s.description)}</span>
              </div>
              <div style="padding:12px;">${imgTag}</div>
            </div>`;
        }).join('');

        // Build failure section: human-readable error + failure screenshots
        let errorSection = '';
        if (!rec.lastResult?.ok && rec.lastResult?.output) {
            const humanError = this.translatePlaywrightError(rec.lastResult.output);
            const failImgs = (failureScreenshots ?? []).map((p, i) => {
                try {
                    const b64 = fs.readFileSync(p).toString('base64');
                    return `<div style="margin-bottom:16px;">
                      <div style="font-size:12px;color:#7f1d1d;font-weight:600;margin-bottom:6px;">Pantalla al momento del error (fallo ${i + 1})</div>
                      <img src="data:image/png;base64,${b64}" style="max-width:100%;border:2px solid #dc2626;border-radius:4px;" />
                    </div>`;
                } catch { return ''; }
            }).join('');

            errorSection = `
            <div style="margin-top:32px;padding:20px;background:#fef2f2;border:2px solid #fecaca;border-radius:8px;page-break-inside:avoid;">
              <div style="font-size:15px;font-weight:700;color:#dc2626;margin-bottom:12px;">✗ ¿Qué salió mal?</div>
              <div style="font-size:13px;color:#7f1d1d;white-space:pre-line;margin-bottom:${failImgs ? '20px' : '0'}">${esc(humanError)}</div>
              ${failImgs}
              <details style="margin-top:12px;">
                <summary style="font-size:11px;color:#9ca3af;cursor:pointer;">Ver error técnico completo</summary>
                <pre style="font-size:10px;color:#6b7280;white-space:pre-wrap;word-break:break-all;margin-top:8px;">${esc(rec.lastResult.output.slice(0, 3000))}</pre>
              </details>
            </div>`;
        }

        return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #111827; background: #fff; padding: 0 20px 40px; }
          .header { border-bottom: 3px solid #1e3a5f; padding: 24px 0 16px; margin-bottom: 32px; }
          .header h1 { font-size: 22px; color: #1e3a5f; margin-bottom: 8px; }
          .meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; color: #6b7280; margin-top: 8px; }
          .meta span b { color: #374151; }
        </style></head><body>
        <div class="header">
          <h1>Documentación de Prueba E2E</h1>
          <div style="font-size:15px;font-weight:600;margin-bottom:4px;">${esc(rec.name)}</div>
          <div class="meta">
            <span><b>Módulo:</b> ${esc(mod)}</span>
            ${pageName ? `<span><b>Página:</b> ${esc(pageName)}</span>` : ''}
            <span><b>Fecha:</b> ${date}</span>
          </div>
          ${resultBadge}
        </div>
        ${rows}
        ${errorSection}
        </body></html>`;
    }

    private async generatePDF(mod: string, id: string, sub?: string, page?: string, processedSpec?: string, failureScreenshots?: string[]): Promise<void> {
        const file = recordingsPath(mod, sub, page);
        const recs = await read(file);
        const rec  = recs.find(r => r.id === id);
        if (!rec || !fs.existsSync(rec.specFile)) return;

        const specDir      = path.dirname(rec.specFile);
        const screenshotsDir = path.join(specDir, 'screenshots');
        const pdfPath      = path.join(specDir, `doc-${id}.pdf`);

        const steps = this.parseSpecSteps(processedSpec ?? fs.readFileSync(rec.specFile, 'utf-8'));
        const html  = this.buildPdfHtml(rec, steps, screenshotsDir, mod, page, failureScreenshots);

        const browser = await chromium.launch({ headless: true });
        try {
            const ctx     = await browser.newContext();
            const pw_page = await ctx.newPage();
            await pw_page.setContent(html, { waitUntil: 'networkidle' });
            const pdfBuf = await pw_page.pdf({
                format: 'A4', printBackground: true,
                margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
            });
            fs.writeFileSync(pdfPath, pdfBuf);
        } finally {
            await browser.close().catch(() => undefined);
        }

        const current = await read(file);
        const r = current.find(x => x.id === id);
        if (r?.lastResult) { r.lastResult.hasPdf = true; await write(file, current); }
    }

    private async generateScreenshots(mod: string, id: string, sub?: string, page?: string): Promise<void> {
        const file = recordingsPath(mod, sub, page);
        const rec  = (await read(file)).find(r => r.id === id);
        if (!rec || !fs.existsSync(rec.specFile)) return;

        const specDir = path.dirname(rec.specFile);
        const screenshotsDir = path.join(specDir, 'screenshots');
        fs.mkdirSync(screenshotsDir, { recursive: true });

        // Clear screenshots and previous PDF
        fs.readdirSync(screenshotsDir)
            .filter(f => f.endsWith('.png'))
            .forEach(f => { try { fs.unlinkSync(path.join(screenshotsDir, f)); } catch {} });
        const oldPdf = path.join(specDir, `doc-${id}.pdf`);
        try { if (fs.existsSync(oldPdf)) fs.unlinkSync(oldPdf); } catch {}

        const docContent = this.buildDocSpec(fs.readFileSync(rec.specFile, 'utf-8'), screenshotsDir);
        const docFile    = path.join(specDir, `${id}-doc.spec.ts`);
        fs.writeFileSync(docFile, docContent, 'utf-8');

        try {
            await execAsync(
                `npx playwright test "${path.basename(docFile)}" --reporter=list --headed --timeout=180000`,
                { cwd: specDir, timeout: 240000 }
            );
        } catch { /* screenshots captured even on partial failure */ }

        try { if (fs.existsSync(docFile)) fs.unlinkSync(docFile); } catch {}

        const screenshots = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png')).sort();
        if (screenshots.length > 0) {
            const recs = await read(file);
            const r    = recs.find(x => x.id === id);
            if (r?.lastResult) { r.lastResult.screenshots = screenshots; await write(file, recs); }
        }
        // El PDF ya no se genera ni se guarda: se arma on-demand en el cliente (@react-pdf).
    }

    startScreenshotGen(mod: string, id: string, sub?: string, page?: string): void {
        this.generateScreenshots(mod, id, sub, page)
            .catch(e => console.error('[E2E] generateScreenshots error', e?.message));
    }

    private collectPngs(dir: string): string[] {
        const results: string[] = [];
        try {
            for (const entry of fs.readdirSync(dir)) {
                const full = path.join(dir, entry);
                if (fs.statSync(full).isDirectory()) results.push(...this.collectPngs(full));
                else if (entry.endsWith('.png')) results.push(full);
            }
        } catch {}
        return results.sort();
    }

    private flattenScreenshots(screenshotsDir: string): string[] {
        const pngs = this.collectPngs(screenshotsDir);
        const renamed: string[] = [];
        pngs.forEach((src, i) => {
            const name = `step_${String(i + 1).padStart(2, '0')}.png`;
            const dest = path.join(screenshotsDir, name);
            try { fs.copyFileSync(src, dest); renamed.push(name); } catch {}
        });
        for (const entry of fs.readdirSync(screenshotsDir)) {
            const full = path.join(screenshotsDir, entry);
            if (fs.statSync(full).isDirectory()) {
                try { fs.rmSync(full, { recursive: true, force: true }); } catch {}
            }
        }
        return renamed;
    }


    async list(mod: string, sub?: string, page?: string): Promise<E2eRecording[]> {
        return read(recordingsPath(mod, sub, page));
    }

    async rename(mod: string, id: string, newName: string, sub?: string, page?: string): Promise<E2eRecording> {
        const file = recordingsPath(mod, sub, page);
        const recs = await read(file);
        const rec = recs.find(r => r.id === id);
        if (!rec) throw new Error('Grabación no encontrada');
        const v = String(newName).trim();
        if (!v) throw new Error('El nombre no puede estar vacío');
        rec.name = v;
        await write(file, recs);
        return rec;
    }

    async setRequirement(mod: string, id: string, requirement: string, sub?: string, page?: string): Promise<E2eRecording> {
        const file = recordingsPath(mod, sub, page);
        const recs = await read(file);
        const rec = recs.find(r => r.id === id);
        if (!rec) throw new Error('Grabación no encontrada');
        rec.requirement = String(requirement ?? '').trim() || undefined;
        await write(file, recs);
        return rec;
    }

    async create(mod: string, data: Pick<E2eRecording, 'name' | 'url' | 'tipo'>, sub?: string, page?: string): Promise<E2eRecording> {
        const file = recordingsPath(mod, sub, page);
        const dir  = path.dirname(file);
        const id   = randomUUID();
        const specFile = path.join(dir, `${id}.spec.ts`);
        const recs = await read(file);
        const rec: E2eRecording = { ...data, id, specFile, status: 'idle', createdAt: new Date().toISOString() };
        recs.push(rec);
        await write(file, recs);
        return rec;
    }

    async delete(mod: string, id: string, sub?: string, page?: string): Promise<void> {
        const file = recordingsPath(mod, sub, page);
        const recs = await read(file);
        const rec  = recs.find(r => r.id === id);
        if (rec?.specFile && fs.existsSync(rec.specFile)) fs.unlinkSync(rec.specFile);
        const browser = activeProcs.get(id);
        if (browser) { await browser.close().catch(() => undefined); activeProcs.delete(id); }
        await write(file, recs.filter(r => r.id !== id));
    }

    async startRecording(
        mod: string,
        id: string,
        sub?: string,
        page?: string,
        overrideUrl?: string,
        adproToken?: any,
        sessionContext?: AdproSessionContext,
    ): Promise<void> {
        const file = recordingsPath(mod, sub, page);
        const recs = await read(file);
        const rec  = recs.find(r => r.id === id);
        if (!rec) throw new Error('Grabación no encontrada');
        if (activeProcs.has(id)) throw new Error('Ya hay una grabación activa para este flujo');

        const targetUrl = hasSpaRoute(rec.url) && !hasSpaRoute(overrideUrl) ? rec.url : (overrideUrl?.trim() || rec.url);
        console.log('[E2E Playwright] startRecording', { targetUrl, hasSession: !!sessionContext?.urlRaiz });
        fs.mkdirSync(path.dirname(rec.specFile), { recursive: true });
        rec.url = targetUrl;
        await write(file, recs);

        // Pre-auth OCULTO: si esta grabación mostraría login (no hay URL SPA sembrada, no es React ni localhost),
        // autenticamos en headless y reusamos la sesión para abrir el navegador visible ya en el menú.
        let preState: any = null;
        const mostrariaLogin = !!sessionContext?.urlRaiz && !isLocalhostUrl(targetUrl) && (isReactAppRoute(targetUrl) || !hasSpaRoute(targetUrl));
        if (mostrariaLogin) {
            try { preState = await capturePreAuthState(sessionContext!); } catch { preState = null; }
        }

        const browser = await chromium.launch({ headless: false });
        const context = await browser.newContext({ ignoreHTTPSErrors: true, ...(preState ? { storageState: preState } : {}) });

        // Inject ADPRO token + session data into localStorage (same as uiTest.service.ts createContext)
        if (adproToken?.access_token || sessionContext?.urlRaiz) {
            await context.addInitScript(
                ({ token, session }: { token?: any; session?: AdproSessionContext }) => {
                    const writeValue = (key: string, value: string) => {
                        try { localStorage.setItem(key, value); } catch {}
                        try { sessionStorage.setItem(key, value); } catch {}
                    };
                    if (token?.access_token) {
                        const serialized = JSON.stringify(token);
                        writeValue('adpro_token', serialized);
                        writeValue('adproToken', serialized);
                        writeValue('access_token', token.access_token);
                        writeValue('accessToken', token.access_token);
                        if ((token as any).authorization_token) {
                            writeValue('authorization_token', (token as any).authorization_token);
                        }
                        try { (window as any).getToken = () => token.access_token; } catch {}
                        try {
                            (window as any).getTokenAuth = () => (token as any).authorization_token ?? '';
                        } catch {}
                        // Solo mock en top frame — en iframes window.parent.getToken() ya funciona.
                        // Usar value (estable) no get (crea objeto nuevo cada acceso → rompe comparaciones React).
                        try {
                            if (!(window as any).opener && window === (window as any).parent) {
                                const mockParent = {
                                    getToken: () => token?.access_token ?? '',
                                    getTokenAuth: () => (token as any).authorization_token ?? token?.access_token ?? '',
                                };
                                Object.defineProperty(window, 'opener', {
                                    value: { parent: mockParent },
                                    writable: true,
                                    configurable: true,
                                });
                            }
                        } catch {}
                    }
                    if (session) {
                        const persistedFinalToken = {
                            state: {
                                finalToken: token?.access_token ?? '',
                                authorizationToken: (token as any).authorization_token ?? '',
                            },
                            version: 0,
                        };
                        writeValue('adpro_session_context', JSON.stringify(session));
                        if (session.urlRaiz) writeValue('urlRaiz', session.urlRaiz);
                        if (typeof session.clienteId === 'number') writeValue('clienteId', String(session.clienteId));
                        if (typeof session.empresaId === 'number') writeValue('empresaId', String(session.empresaId));
                        if (typeof session.sucursalId === 'number') writeValue('sucursalId', String(session.sucursalId));
                        if (session.empresaNombre) writeValue('empresaNombre', session.empresaNombre);
                        if (session.sucursalNombre) writeValue('sucursalNombre', session.sucursalNombre);
                        if (session.entornoName) writeValue('entornoName', session.entornoName);
                        if (session.empNombre) writeValue('empNombre', session.empNombre);
                        writeValue('token', JSON.stringify(persistedFinalToken));
                    }
                },
                { token: adproToken, session: sessionContext }
            );
        }

        // Modelo Doble Token: inyectar Authorization y X-SincoERP-Authorization en todos los requests
        if (adproToken?.access_token) {
            const bearerValue = `${adproToken.token_type ?? 'Bearer'} ${adproToken.access_token}`;
            const authorizationToken = adproToken.authorization_token ?? adproToken.access_token;
            await context.route('**/*', async (route) => {
                const headers = { ...route.request().headers() };
                if (!headers['authorization'] || !headers['authorization'].toLowerCase().startsWith('bearer ')) {
                    headers['authorization'] = bearerValue;
                }
                if (!headers['x-sincoerp-authorization'] && authorizationToken) {
                    headers['x-sincoerp-authorization'] = authorizationToken;
                }
                await route.continue({ headers });
            });
        }

        // ── Self-healing Option B: captura de metadata rica en tiempo de grabación ──
        // El recorder es dueño del spec (no podemos enganchar su callback por-acción), así que
        // capturamos por separado vía un hook DOM inyectado + un binding que sobrevive navegaciones.
        recMeta.set(id, []);
        await context.exposeBinding('__tvCapture', (_source: any, meta: CapturedElement) => {
            try {
                const buf = recMeta.get(id);
                if (!buf || !meta || typeof meta !== 'object') return;
                meta.seq = buf.length; // orden de interacción, asignado del lado Node
                buf.push(meta);
            } catch { /* nunca romper la grabación por un fallo de captura */ }
        });
        await context.addInitScript(() => {
            try {
                const w = window as any;
                if (w.__tvCaptureInstalled) return; // evitar doble instalación por frame/reejecución
                w.__tvCaptureInstalled = true;

                const clean = (s: any): string => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();

                // Sube desde el target (posible nodo de texto o <span> interno) al ancestro interactivo real.
                const resolve = (node: any): any => {
                    let el: any = node;
                    if (el && el.nodeType === 3) el = el.parentElement; // nodo de texto → su elemento
                    let cur: any = el;
                    for (let i = 0; i < 6 && cur && cur.nodeType === 1; i++) {
                        const tag = (cur.tagName || '').toLowerCase();
                        if (cur.hasAttribute && cur.hasAttribute('role')) return cur;
                        if (['button', 'a', 'input', 'select', 'textarea', 'label'].indexOf(tag) >= 0) return cur;
                        cur = cur.parentElement;
                    }
                    return el;
                };

                const roleOf = (el: any, tag: string, type?: string): string | undefined => {
                    try { if (el.getAttribute && el.getAttribute('role')) return el.getAttribute('role'); } catch {}
                    if (tag === 'button') return 'button';
                    if (tag === 'a') return 'link';
                    if (tag === 'select') return 'combobox';
                    if (tag === 'textarea') return 'textbox';
                    if (tag === 'input') {
                        const t = (type || 'text').toLowerCase();
                        if (t === 'checkbox') return 'checkbox';
                        if (t === 'radio') return 'radio';
                        if (t === 'button' || t === 'submit' || t === 'reset') return 'button';
                        return 'textbox';
                    }
                    return undefined;
                };

                const nearbyLabelOf = (el: any): string | undefined => {
                    try {
                        const id2 = el.getAttribute && el.getAttribute('id');
                        if (id2) {
                            const esc = (w.CSS && CSS.escape) ? CSS.escape(id2) : String(id2).replace(/["\\]/g, '\\$&');
                            const lbl = document.querySelector('label[for="' + esc + '"]');
                            if (lbl) { const t = clean(lbl.textContent); if (t) return t; }
                        }
                        let cur: any = el;
                        for (let i = 0; i < 4 && cur; i++) {
                            if (cur.tagName && cur.tagName.toLowerCase() === 'label') {
                                let txt = clean(cur.textContent);
                                const own = clean(el.textContent);
                                if (own && own.length < txt.length && txt.indexOf(own) >= 0) txt = clean(txt.replace(own, ''));
                                return txt || undefined;
                            }
                            cur = cur.parentElement;
                        }
                    } catch {}
                    return undefined;
                };

                const classesOf = (el: any): string[] | undefined => {
                    try {
                        const raw = (typeof el.className === 'string')
                            ? el.className
                            : (el.getAttribute ? (el.getAttribute('class') || '') : '');
                        const list = String(raw).split(/\s+/)
                            .filter((c: string) => !!c && !/^(css-|jss-|sc-|Mui.*-)/.test(c))
                            .slice(0, 6);
                        return list.length ? list : undefined;
                    } catch { return undefined; }
                };

                const handler = (ev: any) => {
                    try {
                        const el = resolve(ev.target);
                        if (!el || el.nodeType !== 1) return;
                        const tag = (el.tagName || '').toLowerCase();
                        const attr = (n: string): string | undefined => {
                            try { return (el.getAttribute && el.getAttribute(n)) || undefined; } catch { return undefined; }
                        };
                        const type = attr('type');
                        const testId = attr('data-testid') || attr('data-test') || attr('data-cy') || attr('data-qa');
                        let text: string | undefined = clean(el.textContent);
                        if (!text || text.length > 200) text = undefined;
                        else if (text.length > 80) text = text.slice(0, 80);
                        const meta: any = {
                            seq: 0,
                            event: String(ev.type),
                            tag: tag,
                            id: attr('id'),
                            testId: testId || undefined,
                            name: attr('name'),
                            role: roleOf(el, tag, type),
                            ariaLabel: attr('aria-label'),
                            placeholder: attr('placeholder'),
                            title: attr('title'),
                            text: text,
                            inputType: type,
                            classes: classesOf(el),
                            nearbyLabel: nearbyLabelOf(el),
                        };
                        if (w.__tvCapture) w.__tvCapture(meta);
                    } catch { /* jamás interrumpir la grabación del usuario */ }
                };

                document.addEventListener('click', handler, true);
                document.addEventListener('input', handler, true);
                document.addEventListener('change', handler, true);
            } catch { /* noop */ }
        });

        // Enable recorder FIRST so every action (including login) is captured in the spec.
        // This makes the spec self-contained: when replayed it handles its own authentication.
        await (context as any)._enableRecorder({
            language: 'playwright-test',
            mode: 'recording',
            outputFile: path.resolve(rec.specFile),
            handleSIGINT: false,
        });

        // Create page — recorder attaches immediately since it was enabled on the context first.
        const recPage = await context.newPage();
        recPages.set(id, recPage);

        // Mark as recording BEFORE navigation so the HTTP response is sent immediately.
        // Navigation (including manual SINCO empresa/sucursal selection) runs in background.
        activeProcs.set(id, browser);
        rec.status = 'recording';
        await write(file, recs);

        const externalMarcoUrl = sessionContext?.urlRaiz
            ? tryDeriveMarcoUrl(targetUrl, sessionContext.urlRaiz)
            : null;

        if (externalMarcoUrl) {
            // SPA con Marco+iframe (cualquier módulo con hash routing): navegar directo al Marco URL.
            // Tokens ya inyectados — sin pasar por Seleccion_iv.aspx ni login.
            recPage.route('**/Marco/Default_iv.aspx*', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'text/html; charset=utf-8',
                    body: [
                        '<!DOCTYPE html><html><head><meta charset="utf-8">',
                        '<style>*{margin:0;padding:0}body,html{width:100%;height:100%;overflow:hidden}</style>',
                        '</head><body>',
                        `<iframe id="pagina1" name="pagina1" src="${targetUrl}"`,
                        ' style="width:100%;height:100vh;border:none;display:block;"></iframe>',
                        '</body></html>',
                    ].join(''),
                });
            }).catch(() => undefined);
            recPage.goto(externalMarcoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
        } else if (sessionContext?.urlRaiz && !isLocalhostUrl(targetUrl)) {
            if (needsMarcoShell(targetUrl)) {
                // Páginas que requieren el Marco REAL (autenticado), no el fake Marco:
                //  • React (reactapp/#/...): el fake Marco crashea React 18 (useSyncExternalStore
                //    necesita los globals de sesión reales).
                //  • ADPRO clásicas (.html/.aspx): el Marco mintea el token vsADPRO por sesión al
                //    abrir el reporte desde su menú; sin Marco padre la página queda en "Cargando...".
                // En ambos casos abrimos el Marco real (pre-auth vía storageState o login visible).
                const setupReact = async () => {
                    const raiz = sessionContext!.urlRaiz!;
                    const rbase = raiz.endsWith('/') ? raiz : `${raiz}/`;
                    const rmarco = new URL('Marco/Default_iv.aspx', rbase).toString();
                    if (preState) {
                        await recPage.goto(rmarco, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
                    } else {
                        await establishAdproSession(recPage, sessionContext);
                    }
                    // Páginas ADPRO clásicas: NO forzamos el iframe (abrir el .html directo sin
                    // vsADPRO vuelve a colgar). Dejamos al usuario navegar el menú del Marco real;
                    // el Marco mintea vsADPRO al abrir el reporte y el grabador captura esos clicks.
                    if (!isReactAppRoute(targetUrl)) {
                        console.log('[E2E Playwright] Classic ADPRO page: Marco real abierto, usuario navega el menú', { targetUrl });
                        return;
                    }
                    // El Marco real carga su dashboard por defecto dentro de #pagina1 al
                    // montar. Una sola inyeccion pierde la carrera: el Marco sobrescribe el
                    // iframe y nos deja en el menu (ACTIVIDADES/SEGUIMIENTOS/ALERTAS).
                    // Vigilamos el iframe ~12s y, mientras NO apunte a la app React,
                    // forzamos su src a la ruta destino. En cuanto React carga, paramos
                    // (para no interferir con la navegacion del usuario dentro del flujo).
                    let sawIframe = false;
                    let reachedTarget = false;
                    for (let intento = 0; intento < 30; intento++) {
                        const res = await recPage.evaluate((url) => {
                            const iframe = (document.getElementById('pagina1') as HTMLIFrameElement)
                                ?? (document.querySelector('iframe[name="pagina1"], frame[name="pagina1"]') as HTMLIFrameElement);
                            if (!iframe) return { found: false, onTarget: false };
                            let current = '';
                            try { current = iframe.contentWindow?.location?.href || ''; } catch { /* cross-origin */ }
                            if (!current) current = iframe.getAttribute('src') || '';
                            const onTarget = /reactapp/i.test(current);
                            if (!onTarget) {
                                iframe.setAttribute('src', url);
                                try { (iframe.contentWindow as Window).location.replace(url); } catch { /* ignore */ }
                            }
                            return { found: true, onTarget };
                        }, targetUrl).catch(() => ({ found: false, onTarget: false }));
                        if (res.found) sawIframe = true;
                        if (res.onTarget) { reachedTarget = true; break; }
                        await recPage.waitForTimeout(400);
                    }
                    console.log('[E2E Playwright] React route: setup done', { targetUrl, sawIframe, reachedTarget });
                };
                setupReact().catch((e) => console.error('[E2E Playwright] React route setup error:', e));
            } else if (preState) {
                // Autenticado vía storageState (headless), SIN login visible.
                const base = sessionContext.urlRaiz.endsWith('/') ? sessionContext.urlRaiz : `${sessionContext.urlRaiz}/`;
                const marcoUrl = new URL('Marco/Default_iv.aspx', base).toString();
                const esPaginaReal = /^https?:\/\//i.test(targetUrl) && !/\/Marco\/(Default_iv|Login|Seleccion)/i.test(targetUrl);
                if (esPaginaReal) {
                    // Marco falso con la página en un iframe → recibe window.parent.getToken();
                    // el context ya trae storageState (cookies keyC) + headers de token, así no expira la sesión.
                    recPage.route('**/Marco/Default_iv.aspx*', async (route) => {
                        await route.fulfill({
                            status: 200,
                            contentType: 'text/html; charset=utf-8',
                            body: [
                                '<!DOCTYPE html><html><head><meta charset="utf-8">',
                                '<style>*{margin:0;padding:0}body,html{width:100%;height:100%;overflow:hidden}</style>',
                                '</head><body>',
                                `<iframe id="pagina1" name="pagina1" src="${targetUrl}" style="width:100%;height:100vh;border:none;display:block;"></iframe>`,
                                '</body></html>',
                            ].join(''),
                        });
                    }).catch(() => undefined);
                }
                console.log('[E2E Playwright] abrir grabador (pre-auth) ->', esPaginaReal ? `${targetUrl} (en marco)` : marcoUrl);
                recPage.goto(marcoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
            } else {
                // Fallback: si el pre-auth headless no funcionó, hacemos el login visible.
                establishAdproSession(recPage, sessionContext).catch((e) =>
                    console.error('[E2E Playwright] Session establishment error:', e)
                );
            }
        } else {
            recPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
        }

        browser.on('disconnected', async () => {
            console.log('[E2E Playwright] Browser disconnected', { id });
            activeProcs.delete(id);
            recPages.delete(id);
            try {
                const currentRecs = await read(file);
                const r = currentRecs.find(x => x.id === id);
                if (r && r.status === 'recording') {
                    // Corregir import: @playwright/test no está instalado; playwright/test sí
                    if (fs.existsSync(r.specFile)) {
                        const src = fs.readFileSync(r.specFile, 'utf-8');
                        fs.writeFileSync(r.specFile, src.replace(/@playwright\/test/g, 'playwright/test'), 'utf-8');
                    }
                    r.status = fs.existsSync(r.specFile) ? 'ready' : 'idle';
                    // Persistir metadata rica (self-healing Option B) — cubre el cierre de ventana
                    // sin stopRecording explícito. Condicional para no pisar con vacío.
                    const __mbuf = recMeta.get(id);
                    if (__mbuf && __mbuf.length) r.locatorMeta = __mbuf;
                    recMeta.delete(id);
                    await write(file, currentRecs);
                }
            } catch { /* ignore */ }
        });
    }

    async stopRecording(mod: string, id: string, sub?: string, page?: string): Promise<void> {
        let capturedUrl = '';
        const recPage = recPages.get(id);
        if (recPage) {
            try {
                const cand = recPage.frames()
                    .map(fr => fr.url())
                    .filter(u => hasSpaRoute(u) && !/(Login|Seleccion|Default_iv)/i.test(u));
                if (cand.length) capturedUrl = cand[cand.length - 1];
            } catch { /* ignore */ }
        }
        recPages.delete(id);

        const browser = activeProcs.get(id);
        if (browser) {
            await browser.close().catch(() => undefined);
            activeProcs.delete(id);
        }

        const file = recordingsPath(mod, sub, page);
        const recs = await read(file);
        const rec  = recs.find(r => r.id === id);
        if (rec) {
            rec.status = fs.existsSync(rec.specFile) ? 'ready' : 'idle';
            if (capturedUrl && capturedUrl !== rec.url) {
                rec.url = capturedUrl;
                console.log('[E2E Playwright] URL real sembrada en el flujo', { id, capturedUrl });
            }
            // Persistir metadata rica capturada durante la grabación (self-healing Option B).
            // Guardado condicional: si el buffer ya fue consumido por el handler 'disconnected',
            // no lo sobrescribimos con vacío — rec.locatorMeta ya viene del store.
            const __mbuf = recMeta.get(id);
            if (__mbuf && __mbuf.length) rec.locatorMeta = __mbuf;
            recMeta.delete(id);
            await write(file, recs);
        }
    }

    async saveAssertions(mod: string, id: string, assertions: E2eAssertion[], sub?: string, page?: string): Promise<E2eRecording> {
        const file = recordingsPath(mod, sub, page);
        const recs = await read(file);
        const rec = recs.find((r) => r.id === id);
        if (!rec) throw new Error('Flujo no encontrado');
        rec.assertions = (assertions ?? []).map((a) => ({ id: a.id, type: a.type, text: a.text, target: a.target, op: a.op }));
        await write(file, recs);
        return rec;
    }

    async run(mod: string, id: string, sub?: string, page?: string, overrideUrl?: string, empresaNombre?: string, sucursalNombre?: string, sessionContext?: AdproSessionContext, adproToken?: any): Promise<E2eResult> {
        const file = recordingsPath(mod, sub, page);
        const recs = await read(file);
        const rec  = recs.find(r => r.id === id);
        if (!rec)                          throw new Error('Grabación no encontrada');
        if (!fs.existsSync(rec.specFile))  throw new Error('No hay spec grabado aún — grabá primero el flujo');

        const runAt = new Date().toISOString();
        let output = '';
        let ok = false;
        const targetUrl = hasSpaRoute(rec.url) && !hasSpaRoute(overrideUrl) ? rec.url : (overrideUrl?.trim() || rec.url);
        console.log('[E2E Playwright] run target URL', { mod, id, sub, page, targetUrl });

        if (targetUrl && rec.url !== targetUrl) {
            const currentSpec = fs.readFileSync(rec.specFile, 'utf-8');
            fs.writeFileSync(rec.specFile, currentSpec.split(rec.url).join(targetUrl), 'utf-8');
            rec.url = targetUrl;
            await write(file, recs);
        }

        // Corregir import @playwright/test → playwright/test (solo playwright está instalado)
        if (fs.existsSync(rec.specFile)) {
            const src = fs.readFileSync(rec.specFile, 'utf-8');
            if (src.includes('@playwright/test')) {
                fs.writeFileSync(rec.specFile, src.replace(/@playwright\/test/g, 'playwright/test'), 'utf-8');
            }
        }

        // Single headed browser run: doc spec captures screenshots on every action.
        // Replaces the original two-run approach (test + separate screenshot gen).
        const specDir = path.dirname(rec.specFile);

        const screenshotsDir = path.join(specDir, 'screenshots');
        fs.mkdirSync(screenshotsDir, { recursive: true });
        fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png'))
            .forEach(f => { try { fs.unlinkSync(path.join(screenshotsDir, f)); } catch {} });
        try { const p = path.join(specDir, `doc-${id}.pdf`); if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
        // Limpiar traza anterior y el test-results temporal de corridas previas.
        try { const t = path.join(specDir, `trace-${id}.zip`); if (fs.existsSync(t)) fs.unlinkSync(t); } catch {}
        try { fs.rmSync(path.join(specDir, 'test-results'), { recursive: true, force: true }); } catch {}

        let specSrc = this.cleanupSpec(fs.readFileSync(rec.specFile, 'utf-8'));
        if (sessionContext?.urlRaiz) {
            specSrc = await this.buildRunSpec(specSrc, sessionContext, targetUrl, adproToken);
        }
        // Reglas por tipo de flujo. crear/editar → data de prueba; consultar/otro → sin data.
        // editar/consultar → selección dinámica de primera/siguiente fila. Esperas siempre.
        // La evidencia (Rule 3) sale sola: generatePDF parsea este spec ya transformado.
        const __tipo: E2eFlowType = rec.tipo ?? 'otro';
        specSrc = this.applyDataRules(specSrc, { testData: __tipo === 'crear' || __tipo === 'editar', waitBetween: true });
        if (__tipo === 'editar' || __tipo === 'consultar') {
            specSrc = this.applyRowSelection(specSrc, __tipo);
        }
        if (rec.assertions?.length) {
            specSrc = this.applyAssertions(specSrc, rec.assertions);
        }
        // Self-healing en vivo: envuelve los locators para reintentar con alternativas si el original falla.
        // Option B: además de candidatos derivados del string, usa metadata rica capturada en grabación.
        specSrc = this.applyLocatorHealing(specSrc, rec.locatorMeta);
        const docContent = this.buildDocSpec(specSrc, screenshotsDir);
        const docFile    = path.join(specDir, `${id}-doc.spec.ts`);
        fs.writeFileSync(docFile, docContent, 'utf-8');

        try {
            const r = await execAsync(
                `npx playwright test "${path.basename(docFile)}" --reporter=list --headed --trace on --timeout=180000`,
                { cwd: specDir, timeout: 240000 }
            );
            output = r.stdout + r.stderr;
            ok = true;
        } catch (e: any) {
            output = (e.stdout ?? '') + (e.stderr ?? '') + (e.message ?? '');
        } finally {
            try { if (fs.existsSync(docFile)) fs.unlinkSync(docFile); } catch {}
        }

        const passed      = Number(output.match(/(\d+) passed/)?.[1] ?? 0);
        const failed      = Number(output.match(/(\d+) failed/)?.[1] ?? 0);
        const screenshots = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png')).sort();

        // Last captured screenshot is the closest state to the failure point
        const failureScreenshots = !ok || failed > 0
            ? screenshots.slice(-1).map(f => path.join(screenshotsDir, f))
            : [];

        // Trace on-failure: si falló, Playwright dejó un trace.zip en test-results — lo movemos junto al
        // flujo para poder servirlo, y limpiamos el directorio temporal. Si pasó, no hay traza (retain-on-failure).
        // Traza SIEMPRE (--trace on): la conservamos pase o falle, para poder depurar cualquier corrida.
        let hasTrace = false;
        try {
            const found = this.findTraceZip(path.join(specDir, 'test-results'));
            if (found) { fs.copyFileSync(found, path.join(specDir, `trace-${id}.zip`)); hasTrace = true; }
        } catch { /* la traza es best-effort */ }
        try { fs.rmSync(path.join(specDir, 'test-results'), { recursive: true, force: true }); } catch {}

        const result: E2eResult = { passed, failed, output, ok: ok && failed === 0, runAt, screenshots, failureScreenshots, stepCount: screenshots.length, hasTrace };
        const __am = output.match(/TV_ASSERTIONS:(\[[\s\S]*?\])/);
        if (__am) { try { result.assertionResults = JSON.parse(__am[1]); } catch {} }
        // Selectores auto-curados en esta corrida (self-healing en vivo).
        const __healed = [...output.matchAll(/\[HEAL\] curó "([^"]+)" con candidato #\d+/g)].map((m) => m[1]);
        if (__healed.length) result.healed = [...new Set(__healed)];

        // Preserve previous result in history before overwriting
        if (rec.lastResult) {
            const entry: E2eRunLog = {
                passed:         rec.lastResult.passed,
                failed:         rec.lastResult.failed,
                ok:             rec.lastResult.ok,
                runAt:          rec.lastResult.runAt,
                output:         rec.lastResult.output,
                empresaNombre,
                sucursalNombre,
            };
            rec.history = [entry, ...(rec.history ?? [])].slice(0, 20);
        }
        rec.lastResult = result;
        await write(file, recs);

        // Historial append-only: cada corrida es un hecho inmutable (reportería #3).
        // En background: no bloquea el resultado que devolvemos al usuario.
        {
            const __ar = result.assertionResults ?? [];
            const runRec: E2eRunRecord = {
                id: randomUUID(),
                flowId: rec.id,
                module: mod,
                submodule: sub,
                page,
                flowName: rec.name,
                tipo: rec.tipo,
                runAt: result.runAt,
                passed: result.passed,
                failed: result.failed,
                ok: result.ok,
                stepCount: result.stepCount,
                assertionTotal: __ar.length,
                assertionFailed: __ar.filter((a) => !a.ok).length,
                empresaNombre,
                sucursalNombre,
                entorno: sessionContext?.entornoName,
                urlRaiz: sessionContext?.urlRaiz,
                result,
            };
            void e2eRunsStore.append(runRec).catch((err) => console.error('[e2e] append run history fallo', err));
        }


        // El PDF ya no se genera acá: el cliente lo arma on-demand desde /e2e/:id/doc-data (@react-pdf).
        // Las capturas quedan en disco (evidencia real, no reconstruible).
        return result;
    }

    /** Historial de ejecuciones (reportería). Por flujo (flowId) o por contexto (module/sub/page). */
    async runsHistory(filter: E2eRunsFilter): Promise<E2eRunRecord[]> {
        return e2eRunsStore.list(filter);
    }

    /**
     * Reporte de flaky: agrupa el historial por (flujo + empresa + entorno), mira las últimas
     * `windowSize` corridas de cada grupo y marca como flaky las que mezclan verdes y rojos.
     * Ordena lo más inestable primero (más transiciones / menor estabilidad).
     */
    async flakyReport(windowSize = 10): Promise<FlakyRow[]> {
        const runs = await e2eRunsStore.list({ limit: 5000 });
        const groups = new Map<string, E2eRunRecord[]>();
        for (const r of runs) {
            const key = [r.module, r.submodule ?? '', r.page ?? '', r.flowId, r.empresaNombre ?? '', r.entorno ?? ''].join('|');
            const arr = groups.get(key);
            if (arr) arr.push(r); else groups.set(key, [r]);
        }
        const rows: FlakyRow[] = [];
        for (const list of groups.values()) {
            const sorted = [...list].sort((a, b) => (a.runAt < b.runAt ? 1 : -1)); // desc por fecha
            const recent = sorted.slice(0, windowSize);
            if (recent.length < 2) continue; // con una sola corrida no se puede juzgar
            const passed = recent.filter((r) => r.ok).length;
            const failed = recent.length - passed;
            // transiciones: cambios de resultado entre corridas consecutivas (cronológico)
            const chrono = [...recent].reverse();
            let transitions = 0;
            for (let i = 1; i < chrono.length; i++) if (chrono[i].ok !== chrono[i - 1].ok) transitions++;
            const first = recent[0];
            rows.push({
                module: first.module, submodule: first.submodule, page: first.page, flowId: first.flowId,
                flowName: first.flowName, tipo: first.tipo, empresaNombre: first.empresaNombre, entorno: first.entorno,
                total: recent.length, passed, failed,
                stabilityPct: Math.round((passed / recent.length) * 100),
                flaky: passed > 0 && failed > 0,
                transitions,
                lastOk: first.ok, lastRunAt: first.runAt,
                recent: recent.map((r) => ({ runAt: r.runAt, ok: r.ok })),
            });
        }
        rows.sort((a, b) =>
            (Number(b.flaky) - Number(a.flaky)) ||
            (b.transitions - a.transitions) ||
            (a.stabilityPct - b.stabilityPct));
        return rows;
    }

    /**
     * Dashboard histórico: tendencia de las últimas `days` fechas calendario. Siembra el rango
     * completo con ceros para que los días sin corridas se vean, y agrega cada corrida del historial
     * por su fecha (YYYY-MM-DD). Devuelve los días en orden ascendente y los totales de la ventana.
     */
    async historyReport(days = 30): Promise<HistoryReport> {
        const runs = await e2eRunsStore.list({ limit: 5000 });
        // Rango de fechas: de (hoy - days + 1) a hoy inclusive, en UTC, como 'YYYY-MM-DD'.
        const today = new Date();
        const bucket = new Map<string, { passed: number; failed: number }>();
        const order: string[] = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
            const key = d.toISOString().slice(0, 10);
            bucket.set(key, { passed: 0, failed: 0 });
            order.push(key);
        }
        for (const r of runs) {
            const date = r.runAt.slice(0, 10);
            const cell = bucket.get(date);
            if (!cell) continue;
            if (r.ok === true) cell.passed++;
            else if (r.ok === false) cell.failed++;
        }
        const list: HistoryDay[] = order.map((date) => {
            const cell = bucket.get(date)!;
            return { date, total: cell.passed + cell.failed, passed: cell.passed, failed: cell.failed };
        });
        const passed = list.reduce((s, d) => s + d.passed, 0);
        const failed = list.reduce((s, d) => s + d.failed, 0);
        const total = passed + failed;
        return {
            days: list,
            totals: { runs: total, passed, failed, passRate: total > 0 ? Math.round((passed / total) * 1000) / 10 : 0 },
        };
    }

    /**
     * Resumen ejecutivo del dashboard: compone la tendencia histórica (`historyReport`) con la tasa
     * de éxito del período anterior (mismos `days` días previos, para el delta), el conteo de flujos
     * flaky y las alertas activas (fallando ahora) con su top 5. Reutiliza los reportes existentes.
     */
    async dashboardSummary(days = 30): Promise<DashboardSummary> {
        const current = await this.historyReport(days);

        // Tasa de éxito del período anterior: los `days` días inmediatamente ANTES de la ventana
        // actual. Con fechas UTC 'YYYY-MM-DD': ventana anterior = [hoy - 2*days + 1 .. hoy - days].
        const runs = await e2eRunsStore.list({ limit: 5000 });
        const today = new Date();
        const dayStr = (offset: number) => {
            const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
            return d.toISOString().slice(0, 10);
        };
        const prevStart = dayStr(2 * days - 1); // hoy - 2*days + 1
        const prevEnd = dayStr(days);           // hoy - days
        let prevPassed = 0, prevTotal = 0;
        for (const r of runs) {
            const date = r.runAt.slice(0, 10);
            if (date < prevStart || date > prevEnd) continue;
            if (r.ok === true) { prevPassed++; prevTotal++; }
            else if (r.ok === false) { prevTotal++; }
        }
        const prevPassRate = prevTotal > 0 ? Math.round((prevPassed / prevTotal) * 1000) / 10 : 0;
        const deltaPassRate = Math.round((current.totals.passRate - prevPassRate) * 10) / 10;

        const flaky = await this.flakyReport();
        const flakyCount = flaky.filter((f) => f.flaky).length;

        const al = await this.alerts();
        const failingNow = al.length;
        const topFailing: DashboardTopFail[] = al.slice(0, 5).map((a) => ({
            flowName: a.flowName, module: a.module, submodule: a.submodule, page: a.page,
            empresaNombre: a.empresaNombre, entorno: a.entorno, consecutiveFails: a.consecutiveFails, runAt: a.runAt,
        }));

        return { days: current.days, totals: current.totals, prevPassRate, deltaPassRate, flakyCount, failingNow, topFailing };
    }

    /**
     * Trazabilidad a requisitos: enumera TODOS los flujos E2E (disco o SQL), resuelve el estado de
     * la última corrida de cada uno desde el historial y los agrupa por su referencia de requisito.
     * Los flujos sin requisito caen en el grupo literal '(sin requisito)', que se ordena al final.
     */
    async requirementsReport(): Promise<RequirementRow[]> {
        const NO_REQ = '(sin requisito)';
        const flows = await e2eStore.allFlows();
        // Última corrida por flujo: recorre el historial (desc por fecha) y guarda la primera vista.
        const runs = await e2eRunsStore.list({ limit: 5000 });
        const lastRun = new Map<string, { ok: boolean; runAt: string }>();
        for (const r of runs) {
            if (!lastRun.has(r.flowId)) lastRun.set(r.flowId, { ok: r.ok, runAt: r.runAt });
        }
        const groups = new Map<string, RequirementRow>();
        for (const { ctx, rec } of flows) {
            const req = (rec.requirement ?? '').trim() || NO_REQ;
            let row = groups.get(req);
            if (!row) { row = { requirement: req, flows: [], total: 0, passing: 0 }; groups.set(req, row); }
            const lr = lastRun.get(rec.id);
            row.flows.push({
                module: ctx.mod, submodule: ctx.sub, page: ctx.page, flowId: rec.id,
                flowName: rec.name, tipo: rec.tipo, lastOk: lr?.ok, lastRunAt: lr?.runAt,
            });
            row.total += 1;
            if (lr?.ok === true) row.passing += 1;
        }
        const rows = [...groups.values()];
        rows.sort((a, b) => {
            if (a.requirement === NO_REQ) return 1;
            if (b.requirement === NO_REQ) return -1;
            return a.requirement.localeCompare(b.requirement);
        });
        return rows;
    }

    /**
     * Alertas de fallos: agrupa el historial por (flujo + empresa + entorno), mira la corrida
     * MÁS RECIENTE de cada grupo y, si falló, la reporta como alerta. `consecutiveFails` es la
     * racha de fallos consecutivos desde la última corrida hacia atrás. Ordena la racha más larga
     * primero (más grave), luego lo más reciente.
     */
    async alerts(): Promise<AlertRow[]> {
        const runs = await e2eRunsStore.list({ limit: 5000 });
        const groups = new Map<string, E2eRunRecord[]>();
        for (const r of runs) {
            const key = [r.module, r.submodule ?? '', r.page ?? '', r.flowId, r.empresaNombre ?? '', r.entorno ?? ''].join('|');
            const arr = groups.get(key);
            if (arr) arr.push(r); else groups.set(key, [r]);
        }
        const rows: AlertRow[] = [];
        for (const list of groups.values()) {
            const sorted = [...list].sort((a, b) => (a.runAt < b.runAt ? 1 : -1)); // desc por fecha
            const latest = sorted[0];
            if (!latest || latest.ok !== false) continue; // solo si la última corrida falló
            // racha de fallos consecutivos desde la más reciente hasta el primer verde
            let consecutiveFails = 0;
            for (const r of sorted) { if (r.ok === false) consecutiveFails++; else break; }
            rows.push({
                module: latest.module, submodule: latest.submodule, page: latest.page, flowId: latest.flowId,
                flowName: latest.flowName, tipo: latest.tipo, empresaNombre: latest.empresaNombre, entorno: latest.entorno,
                runAt: latest.runAt,
                consecutiveFails,
                error: this.errorSnippet(latest.result?.output),
            });
        }
        rows.sort((a, b) =>
            (b.consecutiveFails - a.consecutiveFails) ||
            (a.runAt < b.runAt ? 1 : -1));
        return rows;
    }

    /** Extrae una línea corta y representativa del error desde el output crudo de Playwright. */
    private errorSnippet(output?: string): string | undefined {
        if (!output) return undefined;
        const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
        const hit = lines.find((l) => /Error|Timeout|failed|expect|Aserción/i.test(l)) ?? lines[0];
        if (!hit) return undefined;
        return hit.length > 160 ? hit.slice(0, 160) + '…' : hit;
    }

    /** Cobertura E2E: contextos (módulo/submódulo/página) que tienen flujos, con su cantidad. */
    async coverage(): Promise<E2eCoverageRow[]> {
        return e2eStore.coverage();
    }

    /**
     * Cobertura unificada de los tres tipos de prueba (E2E/UI/API) por contexto.
     * E2E sale del store activo (SQL o disco); UI y API siempre de disco (son file-based).
     * Se fusiona por (módulo, submódulo, página) para que una página cuente como cubierta
     * si tiene pruebas de cualquier tipo.
     */
    async coverageAll(): Promise<CoverageRow[]> {
        const [e2e, ui, api] = [await e2eStore.coverage(), collectJsonCoverage('ui'), collectJsonCoverage('api')];
        const map = new Map<string, CoverageRow>();
        const key = (r: E2eCoverageRow) => `${r.module} ${r.submodule ?? ''} ${r.page ?? ''}`;
        const bump = (rows: E2eCoverageRow[], field: 'e2e' | 'ui' | 'api') => {
            for (const r of rows) {
                const k = key(r);
                let row = map.get(k);
                if (!row) { row = { module: r.module, submodule: r.submodule, page: r.page, e2e: 0, ui: 0, api: 0, count: 0 }; map.set(k, row); }
                row[field] += r.count;
                row.count += r.count;
            }
        };
        bump(e2e, 'e2e');
        bump(ui, 'ui');
        bump(api, 'api');
        return [...map.values()];
    }

    /**
     * Payload del reporte para armar el PDF on-demand en el cliente. Reutiliza el parseo de pasos y la
     * traducción del error; solo incluye pasos que tienen captura en disco (renumerados), igual que
     * el doc anterior. No genera ni guarda ningún PDF.
     */
    async docData(mod: string, id: string, sub?: string, page?: string): Promise<E2eDocData> {
        const file = recordingsPath(mod, sub, page);
        const rec = (await read(file)).find((r) => r.id === id);
        if (!rec) throw new Error('Grabación no encontrada');
        const lr = rec.lastResult;
        const screenshotsDir = path.join(path.dirname(rec.specFile), 'screenshots');
        const specContent = fs.existsSync(rec.specFile) ? fs.readFileSync(rec.specFile, 'utf-8') : '';

        const steps: E2eDocStep[] = [];
        for (const s of this.parseSpecSteps(specContent)) {
            const fname = `step_${String(s.step).padStart(2, '0')}.png`;
            if (fs.existsSync(path.join(screenshotsDir, fname))) {
                steps.push({ num: steps.length + 1, description: s.description, testName: s.testName, screenshot: fname });
            }
        }

        const humanError = (lr && !lr.ok && lr.output) ? this.translatePlaywrightError(lr.output) : undefined;
        return {
            name: rec.name,
            module: mod,
            page,
            tipo: rec.tipo,
            runAt: lr?.runAt,
            result: { passed: lr?.passed ?? 0, failed: lr?.failed ?? 0, ok: lr?.ok ?? false, stepCount: lr?.stepCount ?? 0 },
            steps,
            humanError,
            failureScreenshots: (lr?.failureScreenshots ?? []).map((p) => path.basename(p)),
            outputExcerpt: (lr && !lr.ok && lr.output) ? lr.output.slice(0, 3000) : undefined,
        };
    }

    async getSpec(mod: string, id: string, sub?: string, page?: string): Promise<string> {
        const file = recordingsPath(mod, sub, page);
        const rec  = (await read(file)).find(r => r.id === id);
        if (!rec?.specFile || !fs.existsSync(rec.specFile)) return '';
        return fs.readFileSync(rec.specFile, 'utf-8');
    }

    /** Salud de selectores: detecta locators frágiles del spec y sugiere el robusto (self-healing preventivo). */
    async locatorHealth(mod: string, id: string, sub?: string, page?: string): Promise<LocatorFinding[]> {
        const spec = await this.getSpec(mod, id, sub, page);
        return spec ? analyzeSpecLocators(spec) : [];
    }

    /** Aplica los reemplazos seguros (locator CSS → getByRole/Label/Text derivable) y guarda el spec. */
    async healLocators(mod: string, id: string, sub?: string, page?: string): Promise<{ applied: { line: number; from: string; to: string }[]; remaining: LocatorFinding[] }> {
        const spec = await this.getSpec(mod, id, sub, page);
        if (!spec) return { applied: [], remaining: [] };
        const { spec: healed, applied } = healSpecLocators(spec);
        if (applied.length) await this.saveEnhancedSpec(mod, id, healed, sub, page);
        return { applied, remaining: analyzeSpecLocators(healed) };
    }

    async getScreenshotPath(mod: string, id: string, filename: string, sub?: string, page?: string): Promise<string> {
        if (!/^[\w-]+\.png$/i.test(filename)) throw new Error('Nombre de archivo inválido');
        const file = recordingsPath(mod, sub, page);
        const rec  = (await read(file)).find(r => r.id === id);
        if (!rec) throw new Error('Grabación no encontrada');
        const fullPath = path.join(path.dirname(rec.specFile), 'screenshots', filename);
        if (!fs.existsSync(fullPath)) throw new Error('Archivo no encontrado');
        return fullPath;
    }

    async getPdfPath(mod: string, id: string, sub?: string, page?: string): Promise<string> {
        const file = recordingsPath(mod, sub, page);
        const rec  = (await read(file)).find(r => r.id === id);
        if (!rec) throw new Error('Grabación no encontrada');
        const pdfPath = path.join(path.dirname(rec.specFile), `doc-${id}.pdf`);
        if (!fs.existsSync(pdfPath)) throw new Error('PDF no generado aún');
        return pdfPath;
    }

    /** Busca recursivamente el trace.zip que dejó Playwright en test-results (best-effort). */
    private findTraceZip(dir: string): string | null {
        try {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) { const f = this.findTraceZip(full); if (f) return f; }
                else if (entry.name === 'trace.zip') return full;
            }
        } catch { /* sin test-results */ }
        return null;
    }

    /** Ruta del trace.zip del último run fallido (para descargarlo y abrirlo en el visor de Playwright). */
    async getTracePath(mod: string, id: string, sub?: string, page?: string): Promise<string> {
        const file = recordingsPath(mod, sub, page);
        const rec  = (await read(file)).find(r => r.id === id);
        if (!rec) throw new Error('Grabación no encontrada');
        const tracePath = path.join(path.dirname(rec.specFile), `trace-${id}.zip`);
        if (!fs.existsSync(tracePath)) throw new Error('No hay traza (solo se conserva cuando el flujo falla)');
        return tracePath;
    }

    /**
     * Abre el visor de trazas de Playwright (show-trace) en la máquina donde corre el backend.
     * Se lanza como proceso independiente (detached) para no bloquear la respuesta; el visor levanta
     * su propio server local y abre el navegador con la traza cargada.
     */
    async openTraceViewer(mod: string, id: string, sub?: string, page?: string): Promise<void> {
        const tracePath = await this.getTracePath(mod, id, sub, page);
        const child = spawn('npx', ['playwright', 'show-trace', tracePath], {
            cwd: path.dirname(tracePath), detached: true, stdio: 'ignore', shell: true,
        });
        child.unref();
    }

    async saveEnhancedSpec(mod: string, id: string, enhancedSpec: string, sub?: string, page?: string): Promise<void> {
        const file = recordingsPath(mod, sub, page);
        const recs = await read(file);
        const rec  = recs.find(r => r.id === id);
        if (!rec) throw new Error('Grabación no encontrada');
        if (!rec.specFile) throw new Error('La grabación no tiene spec file');

        // Preserve original before first enhancement
        if (!rec.originalSpec && fs.existsSync(rec.specFile)) {
            rec.originalSpec = fs.readFileSync(rec.specFile, 'utf-8');
        }

        fs.mkdirSync(path.dirname(rec.specFile), { recursive: true });
        fs.writeFileSync(rec.specFile, enhancedSpec, 'utf-8');
        await write(file, recs);
    }
}

// Instancia compartida para reutilizar la ejecución de flujos desde otras features (p. ej. Suites).
export const e2eService = new E2eService();
