import fs from 'fs';
import path from 'path';
import { envs } from '../config/envs';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { chromium, type Browser, type Frame, type Page } from 'playwright';

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

export interface E2eRecording {
    id: string;
    name: string;
    url: string;
    specFile: string;
    status: 'idle' | 'recording' | 'ready' | 'error';
    createdAt: string;
    lastResult?: E2eResult;
    history?: E2eRunLog[];
}

export interface E2eResult {
    passed: number;
    failed: number;
    output: string;
    ok: boolean;
    runAt: string;
    screenshots?: string[];
    hasPdf?: boolean;
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
    private buildDocSpec(specContent: string, screenshotsDir: string): string {
        const fwdDir = screenshotsDir.replace(/\\/g, '/');
        // goto included so the first page load is captured too
        const actionRe = /^\s*await .+\.(click|fill|selectOption|check|uncheck|dblclick|goto)\s*\(/;
        const lines = specContent.split('\n');
        const result: string[] = [];
        let stepN = 0;
        let helperInjected = false;

        for (const line of lines) {
            if (!helperInjected && actionRe.test(line)) {
                const indent = line.match(/^(\s*)/)?.[1] ?? '  ';
                result.push(
                    `${indent}const __snap = async (p: string) => { try { await page.waitForLoadState('domcontentloaded', { timeout: 1000 }).catch(() => {}); if (await page.locator('#pagina1').count()) { await page.locator('#pagina1').screenshot({ path: p, timeout: 500 }); } else { await page.screenshot({ path: p, timeout: 500 }); } } catch {} };`
                );
                helperInjected = true;
            }
            result.push(line);
            if (actionRe.test(line)) {
                stepN++;
                const padded = String(stepN).padStart(2, '0');
                const indent = line.match(/^(\s*)/)?.[1] ?? '  ';
                result.push(`${indent}await __snap('${fwdDir}/step_${padded}.png');`);
            }
        }

        return result.join('\n');
    }

    private parseSpecSteps(specContent: string): { step: number; description: string; isPageAction: boolean }[] {
        const actionRe = /^\s*await .+\.(click|fill|selectOption|check|uncheck|dblclick|goto)\s*\(/;
        const steps: { step: number; description: string; isPageAction: boolean }[] = [];
        let stepN = 0;
        for (const line of specContent.split('\n')) {
            if (!actionRe.test(line)) continue;
            stepN++;
            const isPageAction = line.includes('contentFrame()');
            let desc = line.trim().replace(/^await\s+/, '');
            const gotoM = line.match(/\.goto\(['"]([^'"]+)['"]\)/);
            if (gotoM) { steps.push({ step: stepN, description: `Navegar a: ${gotoM[1]}`, isPageAction }); continue; }
            const fillRoleM = line.match(/getByRole\([^)]+name:\s*['"]([^'"]+)['"]\s*\}\)\.fill\(['"]([^'"]*)['"]\)/);
            if (fillRoleM) { steps.push({ step: stepN, description: `Ingresar "${fillRoleM[2]}" en campo "${fillRoleM[1]}"`, isPageAction }); continue; }
            const fillM = line.match(/\.fill\(['"]([^'"]*)['"]\)/);
            if (fillM) { steps.push({ step: stepN, description: `Ingresar: ${fillM[1]}`, isPageAction }); continue; }
            const frameClickM = line.match(/contentFrame\(\).+name:\s*['"]([^'"]+)['"]\s*\}\)\.click/);
            if (frameClickM) { steps.push({ step: stepN, description: `Clic en: ${frameClickM[1]}`, isPageAction }); continue; }
            const btnM = line.match(/getByRole\(['"]button['"],\s*\{\s*name:\s*['"]([^'"]+)['"]/);
            if (btnM) { steps.push({ step: stepN, description: `Clic en botón: ${btnM[1]}`, isPageAction }); continue; }
            const titleM = line.match(/getByTitle\(['"]([^'"]+)['"]\)/);
            if (titleM) { steps.push({ step: stepN, description: `Navegar al módulo: ${titleM[1]}`, isPageAction }); continue; }
            const selM = line.match(/\.selectOption\(['"]([^'"]*)['"]\)/);
            if (selM) { steps.push({ step: stepN, description: `Seleccionar: ${selM[1]}`, isPageAction }); continue; }
            steps.push({ step: stepN, description: desc.replace(/\s*\{[^}]*\}/g, '').substring(0, 80), isPageAction });
        }
        return steps;
    }

    private buildPdfHtml(
        rec: E2eRecording,
        steps: { step: number; description: string; isPageAction: boolean }[],
        screenshotsDir: string,
        mod: string,
        pageName?: string
    ): string {
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const date = new Date(rec.lastResult?.runAt ?? new Date().toISOString())
            .toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
        const resultBadge = rec.lastResult?.ok
            ? `<span style="color:#16a34a;font-weight:700;">✓ PASÓ (${rec.lastResult.passed} paso(s))</span>`
            : `<span style="color:#dc2626;font-weight:700;">✗ FALLÓ (${rec.lastResult?.failed ?? 0} fallo(s))</span>`;

        // Only include direct page actions (inside #pagina1 contentFrame); skip login and navigation
        const pageSteps = steps.filter(s => s.isPageAction);
        const rows = pageSteps.map((s, idx) => {
            const displayNum = idx + 1;
            const imgFile = path.join(screenshotsDir, `step_${String(s.step).padStart(2, '0')}.png`);
            const imgTag = fs.existsSync(imgFile)
                ? `<img src="data:image/png;base64,${fs.readFileSync(imgFile).toString('base64')}" style="max-width:100%;border:1px solid #e5e7eb;border-radius:4px;" />`
                : `<div style="background:#f3f4f6;padding:16px;color:#9ca3af;text-align:center;border-radius:4px;">Sin captura</div>`;
            return `
            <div style="page-break-inside:avoid;margin-bottom:32px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <div style="background:#1e3a5f;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:12px;">
                <span style="background:#fff;color:#1e3a5f;font-weight:700;border-radius:50%;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${displayNum}</span>
                <span style="font-size:14px;">${esc(s.description)}</span>
              </div>
              <div style="padding:16px;">${imgTag}</div>
            </div>`;
        }).join('');

        return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #111827; background: #fff; padding: 0 20px; }
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
            <span><b>Resultado:</b> ${resultBadge}</span>
          </div>
        </div>
        ${rows}
        </body></html>`;
    }

    private async generatePDF(mod: string, id: string, sub?: string, page?: string): Promise<void> {
        const file = recordingsPath(mod, sub, page);
        const recs = read(file);
        const rec  = recs.find(r => r.id === id);
        if (!rec || !fs.existsSync(rec.specFile)) return;

        const specDir      = path.dirname(rec.specFile);
        const screenshotsDir = path.join(specDir, 'screenshots');
        const pdfPath      = path.join(specDir, `doc-${id}.pdf`);

        const steps = this.parseSpecSteps(fs.readFileSync(rec.specFile, 'utf-8'));
        const html  = this.buildPdfHtml(rec, steps, screenshotsDir, mod, page);

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

        const current = read(file);
        const r = current.find(x => x.id === id);
        if (r?.lastResult) { r.lastResult.hasPdf = true; write(file, current); }
    }

    private async generateScreenshots(mod: string, id: string, sub?: string, page?: string): Promise<void> {
        const file = recordingsPath(mod, sub, page);
        const rec  = read(file).find(r => r.id === id);
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
            const recs = read(file);
            const r    = recs.find(x => x.id === id);
            if (r?.lastResult) { r.lastResult.screenshots = screenshots; write(file, recs); }
        }

        await this.generatePDF(mod, id, sub, page);
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

    async run(mod: string, id: string, sub?: string, page?: string, overrideUrl?: string, empresaNombre?: string, sucursalNombre?: string): Promise<E2eResult> {
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

        // Single headed browser run: doc spec captures screenshots on every action.
        // Replaces the original two-run approach (test + separate screenshot gen).
        const specDir = path.dirname(rec.specFile);

        const screenshotsDir = path.join(specDir, 'screenshots');
        fs.mkdirSync(screenshotsDir, { recursive: true });
        fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.png'))
            .forEach(f => { try { fs.unlinkSync(path.join(screenshotsDir, f)); } catch {} });
        try { const p = path.join(specDir, `doc-${id}.pdf`); if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}

        const docContent = this.buildDocSpec(fs.readFileSync(rec.specFile, 'utf-8'), screenshotsDir);
        const docFile    = path.join(specDir, `${id}-doc.spec.ts`);
        fs.writeFileSync(docFile, docContent, 'utf-8');

        try {
            const r = await execAsync(
                `npx playwright test "${path.basename(docFile)}" --reporter=list --headed --timeout=180000`,
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

        const result: E2eResult = { passed, failed, output, ok: ok && failed === 0, runAt, screenshots };

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
        write(file, recs);

        // Generate PDF headlessly (invisible, brief — no second headed browser)
        await this.generatePDF(mod, id, sub, page);

        return result;
    }

    getSpec(mod: string, id: string, sub?: string, page?: string): string {
        const file = recordingsPath(mod, sub, page);
        const rec  = read(file).find(r => r.id === id);
        if (!rec?.specFile || !fs.existsSync(rec.specFile)) return '';
        return fs.readFileSync(rec.specFile, 'utf-8');
    }

    getScreenshotPath(mod: string, id: string, filename: string, sub?: string, page?: string): string {
        if (!/^[\w-]+\.png$/i.test(filename)) throw new Error('Nombre de archivo inválido');
        const file = recordingsPath(mod, sub, page);
        const rec  = read(file).find(r => r.id === id);
        if (!rec) throw new Error('Grabación no encontrada');
        const fullPath = path.join(path.dirname(rec.specFile), 'screenshots', filename);
        if (!fs.existsSync(fullPath)) throw new Error('Archivo no encontrado');
        return fullPath;
    }

    getPdfPath(mod: string, id: string, sub?: string, page?: string): string {
        const file = recordingsPath(mod, sub, page);
        const rec  = read(file).find(r => r.id === id);
        if (!rec) throw new Error('Grabación no encontrada');
        const pdfPath = path.join(path.dirname(rec.specFile), `doc-${id}.pdf`);
        if (!fs.existsSync(pdfPath)) throw new Error('PDF no generado aún');
        return pdfPath;
    }
}
