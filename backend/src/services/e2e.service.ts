import fs from 'fs';
import path from 'path';
import { envs } from '../config/envs';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { chromium, type Browser, type Frame, type Page } from 'playwright';

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

function isLocalhostUrl(url: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
}

function buildSeleccionUrl(urlRaiz?: string): string {
    const base = urlRaiz?.trim();
    if (!base) return '';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return new URL('Marco/Seleccion_iv.aspx', normalizedBase).toString();
}

// Fills login credentials when redirected to Login_iv.aspx.
// Searches all frames (main + iframes) because SINCO Login page may use frames.
async function tryWebLogin(page: Page): Promise<void> {
    if (!/Login_iv\.aspx/i.test(page.url())) return;
    console.log('[E2E Playwright] Login page detected, filling credentials');

    const roots: Frame[] = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];

    for (const [idx, root] of roots.entries()) {
        const usernameField = root.locator('input[type="text"], input[type="email"]').first();
        const passwordField = root.locator('input[type="password"]').first();
        const loginButton = root.locator([
            'button:has-text("Iniciar sesión")',
            'button:has-text("Ingresar")',
            'input[value="Iniciar sesión"]',
            'input[value="Ingresar"]',
            'input[type="submit"]',
        ].join(', ')).first();

        if (!await usernameField.count() || !await passwordField.count() || !await loginButton.count()) {
            continue;
        }

        try {
            await usernameField.waitFor({ state: 'visible', timeout: 8000 });
            console.log('[E2E Playwright] Login form found in frame', { idx, frameUrl: root.url() });

            await usernameField.click();
            await usernameField.fill(envs.NOM_USUARIO);
            await passwordField.click();
            await passwordField.fill(envs.CLAVE_USUARIO);

            // Press Enter on password field — most reliable way to submit any login form
            await passwordField.press('Enter');

            // Wait for redirect away from login; if Enter didn't work, fall back to button click
            const navigated = await page.waitForURL(
                (url) => !/Login_iv\.aspx/i.test(url.toString()),
                { timeout: 5000 }
            ).then(() => true).catch(() => false);

            if (!navigated) {
                console.log('[E2E Playwright] Enter did not submit form, trying button click');
                await loginButton.click({ force: true }).catch(() => undefined);
                await page.waitForURL(
                    (url) => !/Login_iv\.aspx/i.test(url.toString()),
                    { timeout: 15000 }
                );
            }

            await page.waitForLoadState('networkidle').catch(() => undefined);
            console.log('[E2E Playwright] Login succeeded', { currentUrl: page.url() });
            return;
        } catch (e) {
            console.error('[E2E Playwright] Login attempt failed in frame', { idx, error: e instanceof Error ? e.message : String(e) });
        }
    }

    console.log('[E2E Playwright] Could not complete login — no suitable form found in any frame');
}

// Establishes an ADPRO ASP.NET session by going through Seleccion_iv.aspx.
// Must be called BEFORE _enableRecorder so the login navigation is not recorded.
async function establishAdproSession(page: Page, sessionContext: AdproSessionContext): Promise<void> {
    const seleccionUrl = buildSeleccionUrl(sessionContext.urlRaiz);
    if (!seleccionUrl) return;

    console.log('[E2E Playwright] Establishing session via Seleccion_iv.aspx', { seleccionUrl });
    await page.goto(seleccionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // If redirected to Login_iv.aspx, fill credentials first
    if (/Login_iv\.aspx/i.test(page.url())) {
        await tryWebLogin(page);
        await page.waitForLoadState('networkidle').catch(() => undefined);
        // After login we should be on Seleccion_iv.aspx — fall through to click Ingresar
    }

    // addInitScript already put empresaId/sucursalId in localStorage.
    // Seleccion_iv.aspx reads them and pre-selects the dropdowns — just click Ingresar.
    const ingresarBtn = page.locator([
        'button:has-text("Ingresar")',
        'button:has-text("Continuar")',
        'input[value="Ingresar"]',
        'input[value="Continuar"]',
        'input[type="submit"]',
    ].join(', ')).first();

    let sessionEstablished = false;
    if (await ingresarBtn.count()) {
        await ingresarBtn.click().catch(() => undefined);
        await page.waitForURL(
            (url) => !/Seleccion_iv\.aspx/i.test(url.toString()),
            { timeout: 6000 }
        ).then(() => { sessionEstablished = true; }).catch(() => undefined);
        console.log('[E2E Playwright] Direct Ingresar click', { sessionEstablished });
    }

    // Fallback: select empresa/sucursal manually and retry
    if (!sessionEstablished) {
        console.log('[E2E Playwright] Direct click failed, selecting empresa/sucursal manually');
        try {
            const empresaSelect = page.locator('select[id*="empresa" i], select[name*="empresa" i]').first();
            if (await empresaSelect.count() && typeof sessionContext.empresaId === 'number') {
                await empresaSelect.selectOption({ value: String(sessionContext.empresaId) }).catch(() => undefined);
                await page.waitForSelector('select[id*="sucursal" i], select[name*="sucursal" i]', { timeout: 5000 }).catch(() => undefined);
            }
            const sucursalSelect = page.locator('select[id*="sucursal" i], select[name*="sucursal" i]').first();
            if (await sucursalSelect.count() && typeof sessionContext.sucursalId === 'number') {
                await sucursalSelect.selectOption({ value: String(sessionContext.sucursalId) }).catch(() => undefined);
            }
            const btn = page.locator('button:has-text("Ingresar"), input[value="Ingresar"], input[type="submit"]').first();
            if (await btn.count()) await btn.click().catch(() => undefined);
            await page.waitForURL(
                (url) => !/Seleccion_iv\.aspx/i.test(url.toString()),
                { timeout: 10000 }
            ).catch(() => undefined);
        } catch { /* ignore */ }
    }

    await page.waitForLoadState('networkidle').catch(() => undefined);
    console.log('[E2E Playwright] Session established', { currentUrl: page.url() });
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

    async delete(mod: string, id: string, sub?: string, page?: string): Promise<void> {
        const file = recordingsPath(mod, sub, page);
        const recs = read(file);
        const rec  = recs.find(r => r.id === id);
        if (rec?.specFile && fs.existsSync(rec.specFile)) fs.unlinkSync(rec.specFile);
        const browser = activeProcs.get(id);
        if (browser) { await browser.close().catch(() => undefined); activeProcs.delete(id); }
        write(file, recs.filter(r => r.id !== id));
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
        const recs = read(file);
        const rec  = recs.find(r => r.id === id);
        if (!rec) throw new Error('Grabación no encontrada');
        if (activeProcs.has(id)) throw new Error('Ya hay una grabación activa para este flujo');

        const targetUrl = overrideUrl?.trim() || rec.url;
        console.log('[E2E Playwright] startRecording', { targetUrl, hasSession: !!sessionContext?.urlRaiz });
        fs.mkdirSync(path.dirname(rec.specFile), { recursive: true });
        rec.url = targetUrl;
        write(file, recs);

        const browser = await chromium.launch({ headless: false });
        const context = await browser.newContext({ ignoreHTTPSErrors: true });

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
                    }
                    if (session) {
                        writeValue('adpro_session_context', JSON.stringify(session));
                        if (session.urlRaiz) writeValue('urlRaiz', session.urlRaiz);
                        if (typeof session.clienteId === 'number') writeValue('clienteId', String(session.clienteId));
                        if (typeof session.empresaId === 'number') writeValue('empresaId', String(session.empresaId));
                        if (typeof session.sucursalId === 'number') writeValue('sucursalId', String(session.sucursalId));
                        if (session.empresaNombre) writeValue('empresaNombre', session.empresaNombre);
                        if (session.sucursalNombre) writeValue('sucursalNombre', session.sucursalNombre);
                        if (session.entornoName) writeValue('entornoName', session.entornoName);
                        if (session.empNombre) writeValue('empNombre', session.empNombre);
                    }
                },
                { token: adproToken, session: sessionContext }
            );
        }

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

        if (sessionContext?.urlRaiz && !isLocalhostUrl(targetUrl)) {
            // Navigate through Seleccion → (Login if redirected, fills credentials) → Default_iv.aspx.
            // Recorder captures all of these steps so the spec can replay the full auth flow.
            await establishAdproSession(recPage, sessionContext);
        } else {
            await recPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
        }

        activeProcs.set(id, browser);
        rec.status = 'recording';
        write(file, recs);

        browser.on('disconnected', () => {
            console.log('[E2E Playwright] Browser disconnected', { id });
            activeProcs.delete(id);
            try {
                const currentRecs = read(file);
                const r = currentRecs.find(x => x.id === id);
                if (r && r.status === 'recording') {
                    // Corregir import: @playwright/test no está instalado; playwright/test sí
                    if (fs.existsSync(r.specFile)) {
                        const src = fs.readFileSync(r.specFile, 'utf-8');
                        fs.writeFileSync(r.specFile, src.replace(/@playwright\/test/g, 'playwright/test'), 'utf-8');
                    }
                    r.status = fs.existsSync(r.specFile) ? 'ready' : 'idle';
                    write(file, currentRecs);
                }
            } catch { /* ignore */ }
        });
    }

    async stopRecording(mod: string, id: string, sub?: string, page?: string): Promise<void> {
        const browser = activeProcs.get(id);
        if (browser) {
            await browser.close().catch(() => undefined);
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

        // Corregir import @playwright/test → playwright/test (solo playwright está instalado)
        if (fs.existsSync(rec.specFile)) {
            const src = fs.readFileSync(rec.specFile, 'utf-8');
            if (src.includes('@playwright/test')) {
                fs.writeFileSync(rec.specFile, src.replace(/@playwright\/test/g, 'playwright/test'), 'utf-8');
            }
        }

        try {
            // Run from the spec's own directory and pass only the filename (UUID — no spaces,
            // no backslash regex issues). cwd with spaces is handled by the OS, not the shell.
            const specDir  = path.dirname(rec.specFile);
            const specName = path.basename(rec.specFile);
            const r = await execAsync(
                `npx playwright test "${specName}" --reporter=list --headed`,
                { cwd: specDir, timeout: 120000 }
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
