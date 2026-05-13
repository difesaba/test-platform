import fs from 'fs';
import path from 'path';
import { envs } from '../config/envs';
import { randomUUID } from 'crypto';
import { spawn, exec, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface E2eRecording {
    id: string;
    name: string;
    url: string;
    specFile: string;
    status: 'idle' | 'recording' | 'ready' | 'error';
    createdAt: string;
    lastResult?: E2eResult;
}

export interface E2eResult {
    passed: number;
    failed: number;
    output: string;
    ok: boolean;
    runAt: string;
}

// Tracks active codegen processes by recording ID
const activeProcs = new Map<string, ChildProcess>();

function recordingsPath(mod: string, sub?: string, page?: string): string {
    const base = path.join(process.cwd(), envs.WORKSPACE_PATH, 'modules', mod);
    let dir: string;
    if (page)      dir = path.join(base, 'pages', page, 'e2e');
    else if (sub)  dir = path.join(base, 'submodules', sub, 'e2e');
    else           dir = path.join(base, 'e2e');
    return path.join(dir, 'recordings.json');
}

function read(file: string): E2eRecording[] {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function write(file: string, recs: E2eRecording[]): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(recs, null, 2), 'utf-8');
}

export class E2eService {
    list(mod: string, sub?: string, page?: string) {
        return read(recordingsPath(mod, sub, page));
    }

    create(mod: string, data: Pick<E2eRecording, 'name' | 'url'>, sub?: string, page?: string): E2eRecording {
        const file = recordingsPath(mod, sub, page);
        const dir  = path.dirname(file);
        const id   = randomUUID();
        const specFile = path.join(dir, `${id}.spec.ts`);
        const recs = read(file);
        const rec: E2eRecording = { ...data, id, specFile, status: 'idle', createdAt: new Date().toISOString() };
        recs.push(rec);
        write(file, recs);
        return rec;
    }

    delete(mod: string, id: string, sub?: string, page?: string) {
        const file = recordingsPath(mod, sub, page);
        const recs = read(file);
        const rec  = recs.find(r => r.id === id);
        if (rec?.specFile && fs.existsSync(rec.specFile)) fs.unlinkSync(rec.specFile);
        const proc = activeProcs.get(id);
        if (proc) { proc.kill('SIGTERM'); activeProcs.delete(id); }
        write(file, recs.filter(r => r.id !== id));
    }

    startRecording(mod: string, id: string, sub?: string, page?: string, overrideUrl?: string): void {
        const file = recordingsPath(mod, sub, page);
        const recs = read(file);
        const rec  = recs.find(r => r.id === id);
        if (!rec) throw new Error('Grabación no encontrada');
        if (activeProcs.has(id)) throw new Error('Ya hay una grabación activa para este flujo');
        const targetUrl = overrideUrl?.trim() || rec.url;
        console.log('[E2E Playwright] startRecording target URL', { mod, id, sub, page, targetUrl });

        fs.mkdirSync(path.dirname(rec.specFile), { recursive: true });

        rec.url = targetUrl;
        write(file, recs);

        const proc = spawn('npx', ['playwright', 'codegen', '--output', rec.specFile, targetUrl], {
            shell: true,
            cwd: process.cwd(),
            stdio: 'ignore',
        });

        activeProcs.set(id, proc);
        rec.status = 'recording';
        write(file, recs);

        proc.on('exit', () => { activeProcs.delete(id); });
    }

    stopRecording(mod: string, id: string, sub?: string, page?: string): void {
        const proc = activeProcs.get(id);
        if (proc) {
            proc.kill('SIGTERM');
            activeProcs.delete(id);
        }

        const file = recordingsPath(mod, sub, page);
        const recs = read(file);
        const rec  = recs.find(r => r.id === id);
        if (rec) {
            rec.status = fs.existsSync(rec.specFile) ? 'ready' : 'idle';
            write(file, recs);
        }
    }

    async run(mod: string, id: string, sub?: string, page?: string, overrideUrl?: string): Promise<E2eResult> {
        const file = recordingsPath(mod, sub, page);
        const recs = read(file);
        const rec  = recs.find(r => r.id === id);
        if (!rec)                          throw new Error('Grabación no encontrada');
        if (!fs.existsSync(rec.specFile))  throw new Error('No hay spec grabado aún — grabá primero el flujo');

        const runAt = new Date().toISOString();
        let output = '';
        let ok = false;
        const targetUrl = overrideUrl?.trim() || rec.url;
        console.log('[E2E Playwright] run target URL', { mod, id, sub, page, targetUrl });

        if (targetUrl && rec.url !== targetUrl) {
            const currentSpec = fs.readFileSync(rec.specFile, 'utf-8');
            fs.writeFileSync(rec.specFile, currentSpec.split(rec.url).join(targetUrl), 'utf-8');
            rec.url = targetUrl;
            write(file, recs);
        }

        try {
            const r = await execAsync(
                `npx playwright test "${rec.specFile}" --reporter=list`,
                { cwd: process.cwd(), timeout: 60000 }
            );
            output = r.stdout + r.stderr;
            ok = true;
        } catch (e: any) {
            output = (e.stdout ?? '') + (e.stderr ?? '') + (e.message ?? '');
        }

        const passed = Number(output.match(/(\d+) passed/)?.[1] ?? 0);
        const failed = Number(output.match(/(\d+) failed/)?.[1] ?? 0);

        const result: E2eResult = { passed, failed, output, ok: ok && failed === 0, runAt };
        rec.lastResult = result;
        write(file, recs);
        return result;
    }

    getSpec(mod: string, id: string, sub?: string, page?: string): string {
        const file = recordingsPath(mod, sub, page);
        const rec  = read(file).find(r => r.id === id);
        if (!rec?.specFile || !fs.existsSync(rec.specFile)) return '';
        return fs.readFileSync(rec.specFile, 'utf-8');
    }
}
