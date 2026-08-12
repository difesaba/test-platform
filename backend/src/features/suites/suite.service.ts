import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { envs } from '../../shared/config/envs';
import { executeQueryParam, getPool, sql } from '../../shared/database';
import { e2eService, type AdproSessionContext } from '../e2e/e2e.service';
import { uiTestService } from '../uiTests/uiTest.service';
import { apiTestService } from '../apiTests/apiTest.service';

/**
 * Suites de pruebas. Una suite es un conjunto reutilizable de pruebas de UN mismo tipo (e2e | ui | api)
 * que corre en ORDEN y produce un resultado AGREGADO. Cada prueba adentro sigue guardando su corrida
 * individual; la suite agrega por encima. Un motor único despacha al ejecutor según el tipo.
 *
 * Mismo patrón híbrido del resto: SQL si E2E_STORE=sqlserver y la BD está habilitada, si no archivos.
 */

export type SuiteType = 'e2e' | 'ui' | 'api';

export interface E2eSuiteFlow {
    module: string;
    submodule?: string;
    page?: string;
    flowId: string; // id de la prueba (flujo e2e, test de ui o de api) según el tipo de la suite
    name: string;   // snapshot para mostrar sin resolver la prueba
    order: number;
}

export interface E2eSuite {
    id: string;
    name: string;
    description?: string;
    tipo: SuiteType;            // tipo de la suite: todas sus pruebas son de este tipo
    stopOnFailure?: boolean;    // si un paso falla, no se ejecutan los siguientes (dependencias)
    flows: E2eSuiteFlow[];
    createdAt: string;
    updatedAt: string;
}

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

export interface E2eSuiteRun {
    id: string;
    suiteId: string;
    suiteName: string;
    runAt: string;
    total: number;
    passed: number;   // flujos que pasaron
    failed: number;   // flujos que fallaron
    ok: boolean;      // toda la suite pasó
    empresaNombre?: string;
    entorno?: string;
    results: E2eSuiteRunFlow[];
}

// ---------------------------------------------------------------------------
// Stores (híbrido)
// ---------------------------------------------------------------------------
interface SuiteStore {
    list(): Promise<E2eSuite[]>;
    get(id: string): Promise<E2eSuite | null>;
    save(suite: E2eSuite): Promise<void>;
    remove(id: string): Promise<void>;
}

class FileSuiteStore implements SuiteStore {
    private file = path.join(process.cwd(), envs.WORKSPACE_PATH, 'suites.json');
    private readAll(): E2eSuite[] {
        try { return fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf-8')) : []; } catch { return []; }
    }
    private writeAll(list: E2eSuite[]): void {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(list, null, 2), 'utf-8');
    }
    async list(): Promise<E2eSuite[]> { return this.readAll().sort((a, b) => (a.name > b.name ? 1 : -1)); }
    async get(id: string): Promise<E2eSuite | null> { return this.readAll().find((s) => s.id === id) ?? null; }
    async save(suite: E2eSuite): Promise<void> {
        const list = this.readAll();
        const i = list.findIndex((s) => s.id === suite.id);
        if (i >= 0) list[i] = suite; else list.push(suite);
        this.writeAll(list);
    }
    async remove(id: string): Promise<void> { this.writeAll(this.readAll().filter((s) => s.id !== id)); }
}

class SqlSuiteStore implements SuiteStore {
    async list(): Promise<E2eSuite[]> {
        try {
            const rows = await executeQueryParam<{ data: string }>('SELECT data FROM dbo.e2e_suites ORDER BY name', []);
            return rows.map((r) => JSON.parse(r.data) as E2eSuite);
        } catch (err) { console.error('[suite] SqlSuiteStore.list fallo', err); return []; }
    }
    async get(id: string): Promise<E2eSuite | null> {
        try {
            const rows = await executeQueryParam<{ data: string }>(
                'SELECT data FROM dbo.e2e_suites WHERE id = @id',
                [{ name: 'id', type: sql.UniqueIdentifier, value: id }],
            );
            return rows[0] ? (JSON.parse(rows[0].data) as E2eSuite) : null;
        } catch (err) { console.error('[suite] SqlSuiteStore.get fallo', err); return null; }
    }
    async save(suite: E2eSuite): Promise<void> {
        const pool = await getPool();
        await new sql.Request(pool)
            .input('id', sql.UniqueIdentifier, suite.id)
            .input('name', sql.NVarChar, suite.name)
            .input('desc', sql.NVarChar, suite.description ?? null)
            .input('fc', sql.Int, suite.flows.length)
            .input('data', sql.NVarChar(sql.MAX), JSON.stringify(suite))
            .input('cat', sql.DateTime2, new Date(suite.createdAt))
            .query(`
                MERGE dbo.e2e_suites AS t USING (SELECT @id AS id) AS s ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET name=@name, description=@desc, flow_count=@fc, data=@data, updated_at=SYSUTCDATETIME()
                WHEN NOT MATCHED THEN INSERT (id,name,description,flow_count,data,created_at) VALUES (@id,@name,@desc,@fc,@data,@cat);`);
    }
    async remove(id: string): Promise<void> {
        const pool = await getPool();
        await new sql.Request(pool).input('id', sql.UniqueIdentifier, id).query('DELETE FROM dbo.e2e_suites WHERE id = @id');
    }
}

interface SuiteRunsStore {
    append(run: E2eSuiteRun): Promise<void>;
    list(suiteId: string | undefined, limit: number): Promise<E2eSuiteRun[]>;
}

class FileSuiteRunsStore implements SuiteRunsStore {
    private file = path.join(process.cwd(), envs.WORKSPACE_PATH, 'suite-runs.jsonl');
    async append(run: E2eSuiteRun): Promise<void> {
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            fs.appendFileSync(this.file, JSON.stringify(run) + '\n', 'utf-8');
        } catch (err) { console.error('[suite] FileSuiteRunsStore.append fallo', err); }
    }
    async list(suiteId: string | undefined, limit: number): Promise<E2eSuiteRun[]> {
        try {
            if (!fs.existsSync(this.file)) return [];
            const rows = fs.readFileSync(this.file, 'utf-8').split('\n').filter(Boolean)
                .map((l) => { try { return JSON.parse(l) as E2eSuiteRun; } catch { return null; } })
                .filter(Boolean) as E2eSuiteRun[];
            return rows.filter((r) => !suiteId || r.suiteId === suiteId)
                .sort((a, b) => (a.runAt < b.runAt ? 1 : -1))
                .slice(0, limit);
        } catch (err) { console.error('[suite] FileSuiteRunsStore.list fallo', err); return []; }
    }
}

class SqlSuiteRunsStore implements SuiteRunsStore {
    async append(run: E2eSuiteRun): Promise<void> {
        try {
            await executeQueryParam(
                `INSERT INTO dbo.e2e_suite_runs (id,suite_id,suite_name,run_at,total,passed,failed,ok,empresa_nombre,entorno,data)
                 VALUES (@id,@sid,@sname,@runAt,@total,@passed,@failed,@ok,@emp,@ent,@data)`,
                [
                    { name: 'id', type: sql.UniqueIdentifier, value: run.id },
                    { name: 'sid', type: sql.UniqueIdentifier, value: run.suiteId },
                    { name: 'sname', type: sql.NVarChar, value: run.suiteName },
                    { name: 'runAt', type: sql.DateTime2, value: new Date(run.runAt) },
                    { name: 'total', type: sql.Int, value: run.total },
                    { name: 'passed', type: sql.Int, value: run.passed },
                    { name: 'failed', type: sql.Int, value: run.failed },
                    { name: 'ok', type: sql.Bit, value: run.ok },
                    { name: 'emp', type: sql.NVarChar, value: run.empresaNombre ?? null },
                    { name: 'ent', type: sql.NVarChar, value: run.entorno ?? null },
                    { name: 'data', type: sql.NVarChar(sql.MAX), value: JSON.stringify(run) },
                ],
            );
        } catch (err) { console.error('[suite] SqlSuiteRunsStore.append fallo', err); }
    }
    async list(suiteId: string | undefined, limit: number): Promise<E2eSuiteRun[]> {
        try {
            const top = Number(limit) || 100;
            const rows = await executeQueryParam<{ data: string }>(
                `SELECT TOP (${top}) data FROM dbo.e2e_suite_runs
                 WHERE (@sid IS NULL OR suite_id = @sid) ORDER BY run_at DESC`,
                [{ name: 'sid', type: sql.UniqueIdentifier, value: suiteId ?? null }],
            );
            return rows.map((r) => JSON.parse(r.data) as E2eSuiteRun);
        } catch (err) { console.error('[suite] SqlSuiteRunsStore.list fallo', err); return []; }
    }
}

const useSql = () => envs.E2E_STORE === 'sqlserver' && envs.db.enabled;
const suiteStore: SuiteStore = useSql() ? new SqlSuiteStore() : new FileSuiteStore();
const suiteRunsStore: SuiteRunsStore = useSql() ? new SqlSuiteRunsStore() : new FileSuiteRunsStore();

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------
export class SuiteService {
    /** Lista suites; si se pasa tipo, filtra por él (las suites viejas sin tipo se tratan como e2e). */
    async list(tipo?: SuiteType): Promise<E2eSuite[]> {
        const all = (await suiteStore.list()).map((s) => ({ ...s, tipo: s.tipo ?? 'e2e' as SuiteType }));
        return tipo ? all.filter((s) => s.tipo === tipo) : all;
    }
    get(id: string): Promise<E2eSuite | null> { return suiteStore.get(id); }

    async create(name: string, description?: string, tipo: SuiteType = 'e2e', stopOnFailure = false): Promise<E2eSuite> {
        const v = String(name ?? '').trim();
        if (!v) throw new Error('El nombre de la suite no puede estar vacío');
        const now = new Date().toISOString();
        const suite: E2eSuite = { id: randomUUID(), name: v, description: description?.trim() || undefined, tipo, stopOnFailure, flows: [], createdAt: now, updatedAt: now };
        await suiteStore.save(suite);
        return suite;
    }

    async update(id: string, data: { name?: string; description?: string; stopOnFailure?: boolean }): Promise<E2eSuite> {
        const suite = await suiteStore.get(id);
        if (!suite) throw new Error('Suite no encontrada');
        if (data.name !== undefined) {
            const v = String(data.name).trim();
            if (!v) throw new Error('El nombre no puede estar vacío');
            suite.name = v;
        }
        if (data.description !== undefined) suite.description = data.description.trim() || undefined;
        if (data.stopOnFailure !== undefined) suite.stopOnFailure = data.stopOnFailure;
        suite.updatedAt = new Date().toISOString();
        await suiteStore.save(suite);
        return suite;
    }

    async remove(id: string): Promise<void> { await suiteStore.remove(id); }

    /** Agrega un flujo a la suite (idempotente por flowId). */
    async addFlow(id: string, flow: Omit<E2eSuiteFlow, 'order'>): Promise<E2eSuite> {
        const suite = await suiteStore.get(id);
        if (!suite) throw new Error('Suite no encontrada');
        if (!suite.flows.some((f) => f.flowId === flow.flowId)) {
            suite.flows.push({ ...flow, order: suite.flows.length });
            suite.updatedAt = new Date().toISOString();
            await suiteStore.save(suite);
        }
        return suite;
    }

    async removeFlow(id: string, flowId: string): Promise<E2eSuite> {
        const suite = await suiteStore.get(id);
        if (!suite) throw new Error('Suite no encontrada');
        suite.flows = suite.flows.filter((f) => f.flowId !== flowId).map((f, i) => ({ ...f, order: i }));
        suite.updatedAt = new Date().toISOString();
        await suiteStore.save(suite);
        return suite;
    }

    /**
     * Corre las pruebas de la suite en ORDEN (secuencial, evita caos de navegadores en paralelo),
     * despachando al ejecutor según el tipo de la suite (e2e/ui/api), y persiste el resultado agregado.
     * Si stopOnFailure está activo, al primer paso fallido no ejecuta los siguientes (dependencias).
     */
    async run(id: string, ctx: AdproSessionContext, adproToken?: any): Promise<E2eSuiteRun> {
        const suite = await suiteStore.get(id);
        if (!suite) throw new Error('Suite no encontrada');
        const tipo: SuiteType = suite.tipo ?? 'e2e';

        const runAt = new Date().toISOString();
        const results: E2eSuiteRunFlow[] = [];
        // Contexto de variables encadenadas: una prueba API extrae valores y las siguientes los reutilizan con {{var}}.
        const apiVars: Record<string, string> = {};
        for (const f of [...suite.flows].sort((a, b) => a.order - b.order)) {
            try {
                if (tipo === 'ui') {
                    const r = await uiTestService.run(f.module, f.flowId, f.submodule, f.page, adproToken, undefined, ctx as any);
                    results.push({ flowId: f.flowId, name: f.name, module: f.module, ok: r.ok, passed: r.ok ? 1 : 0, failed: r.ok ? 0 : 1, runAt: r.runAt, error: r.ok ? undefined : (r.error ?? undefined) });
                } else if (tipo === 'api') {
                    const r = await apiTestService.run(f.module, f.flowId, f.submodule, f.page, adproToken, ctx.empresaNombre, ctx.sucursalNombre, apiVars, ctx.urlRaiz, ctx.clienteId, ctx.empresaId, ctx.sucursalId);
                    if (r.extracted) Object.assign(apiVars, r.extracted);
                    const failedAssert = r.assertionResults?.find((a) => !a.ok)?.message;
                    const apiError = r.ok ? undefined : (r.statusOk === false ? `HTTP ${r.status}` : (failedAssert ?? `HTTP ${r.status}`));
                    results.push({ flowId: f.flowId, name: f.name, module: f.module, ok: r.ok, passed: r.ok ? 1 : 0, failed: r.ok ? 0 : 1, runAt: r.runAt, error: apiError });
                } else {
                    const r = await e2eService.run(f.module, f.flowId, f.submodule, f.page, undefined, ctx.empresaNombre, ctx.sucursalNombre, ctx, adproToken);
                    results.push({ flowId: f.flowId, name: f.name, module: f.module, ok: r.ok, passed: r.passed, failed: r.failed, runAt: r.runAt, error: r.ok ? undefined : (r.output?.match(/Aserción fallida:[^\n]*/)?.[0] ?? undefined) });
                }
            } catch (e: any) {
                results.push({ flowId: f.flowId, name: f.name, module: f.module, ok: false, passed: 0, failed: 1, runAt: new Date().toISOString(), error: e?.message ?? 'Error al ejecutar la prueba' });
            }
            // Dependencias: si está activado y el último paso falló, cortamos (no seguimos con los que dependen).
            if (suite.stopOnFailure && !results[results.length - 1].ok) break;
        }

        const passed = results.filter((r) => r.ok).length;
        const failed = results.length - passed;
        const run: E2eSuiteRun = {
            id: randomUUID(), suiteId: suite.id, suiteName: suite.name, runAt,
            total: results.length, passed, failed, ok: failed === 0 && results.length > 0,
            empresaNombre: ctx.empresaNombre, entorno: ctx.entornoName,
            results,
        };
        await suiteRunsStore.append(run);
        return run;
    }

    runsHistory(suiteId: string | undefined, limit = 50): Promise<E2eSuiteRun[]> {
        return suiteRunsStore.list(suiteId, limit);
    }
}

export const suiteService = new SuiteService();
