import fs from 'fs';
import path from 'path';
import { envs } from '../config/envs';
import { randomUUID } from 'crypto';

export interface ApiTestRunLog {
    status: number;
    time: number;
    ok: boolean;
    runAt: string;
    body: any;
    empresaNombre?: string;
    sucursalNombre?: string;
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
    lastResult?: ApiTestResult;
    history?: ApiTestRunLog[];
}

export interface ApiTestResult {
    status: number;
    time: number;
    body: any;
    ok: boolean;
    runAt: string;
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

    async run(moduleName: string, id: string, submodule?: string, page?: string, adproToken?: any, empresaNombre?: string, sucursalNombre?: string): Promise<ApiTestResult> {
        const file = testsPath(moduleName, submodule, page);
        const tests = readTests(file);
        const test = tests.find(t => t.id === id);
        if (!test) throw new Error(`Test ${id} no encontrado`);

        const headers: Record<string, string> = { 'Content-Type': 'application/json', ...test.headers };

        // Auto-inject ADPRO token if available and test URL targets ADPRO
        if (adproToken?.access_token && !headers['Authorization']) {
            headers['Authorization'] = `${adproToken.token_type ?? 'Bearer'} ${adproToken.access_token}`;
        }
        const start = Date.now();
        console.log(`[ApiTest] ${test.method} ${test.url}`);

        const res = await fetch(test.url, {
            method: test.method,
            headers,
            body: ['GET', 'HEAD'].includes(test.method) ? undefined : (test.body || undefined),
        });

        const time = Date.now() - start;
        console.log(`[ApiTest] → ${res.status} (${time}ms)`);
        let body: any;
        const text = await res.text();
        try { body = JSON.parse(text); } catch { body = text; }

        const result: ApiTestResult = {
            status: res.status,
            time,
            body,
            ok: test.expectedStatus ? res.status === test.expectedStatus : res.ok,
            runAt: new Date().toISOString(),
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
        return result;
    }
}
