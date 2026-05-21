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
    if (sub && page)    dir = path.join(base, 'submodules', sub, 'pages', page, 'e2e');
    else if (page)      dir = path.join(base, 'pages', page, 'e2e');
    else if (sub)       dir = path.join(base, 'submodules', sub, 'e2e');
    else                dir = path.join(base, 'e2e');
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

function isReactAppRoute(url: string): boolean {
    return /\/ADPRO\/Views\/reactapp\/#/i.test(url);
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
    console.log('[E2E Playwright] Login page detected, filling credentials');

    const roots: Frame[] = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];

    for (const [idx, root] of roots.entries()) {
        const usernameField = root.locator('input[type="text"], input[type="email"]').first();
        const passwordField = root.locator('input[type="password"]').first();
        const loginButton   = root.locator([
            'button:has-text("Iniciar sesión")',
            'button:has-text("Ingresar")',
            'input[value="Iniciar sesión"]',
            'input[value="Ingresar"]',
            'input[type="submit"]',
        ].join(', ')).first();

        if (!await usernameField.count() || !await passwordField.count() || !await loginButton.count()) continue;

        try {
            await usernameField.waitFor({ state: 'visible', timeout: 8000 });
            console.log('[E2E Playwright] Login form found in frame', { idx, frameUrl: root.url() });

            await usernameField.fill(envs.NOM_USUARIO);
            await passwordField.fill(envs.CLAVE_USUARIO);

            // Wait 1 second then click the button — no Enter, produces a clean recorded spec.
            await page.waitForTimeout(1000);
            await loginButton.click();

            await page.waitForURL(
                (url) => !/Login_iv\.aspx/i.test(url.toString()),
                { timeout: 20000 }
            );
            await page.waitForLoadState('networkidle').catch(() => undefined);
            console.log('[E2E Playwright] Login succeeded', { currentUrl: page.url() });
            return;
        } catch (e) {
            console.error('[E2E Playwright] Login attempt failed in frame', { idx, error: e instanceof Error ? e.message : String(e) });
        }
    }

    console.log('[E2E Playwright] Could not complete login — no suitable form found in any frame');
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

        for (let line of lines) {
            // Fix: remove the inner #recttextomodulo locator so we click the parent element
            line = line.replace(/\.locator\(['"]#recttextomodulo['"]\)/g, '');

            const m = line.match(actionRe);
            if (m) {
                const [, locator, method] = m;
                if (method === 'press' && line.includes("'Enter'")) {
                    lastPressLocator = locator.trim();
                    result.push(line);
                    continue;
                }
                if (lastPressLocator && method === 'click' && locator.trim() === lastPressLocator) {
                    lastPressLocator = null;
                    continue; // drop the redundant click after Enter
                }
                lastPressLocator = null;
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
    private buildRunSpec(specContent: string, ctx: AdproSessionContext, targetUrl?: string, adproToken?: any): string {
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
            const authGotoRe = /^\s*await page\.goto\s*\(\s*['"`][^'"`]*(Login_iv|Seleccion_iv|Default_iv|Marco)\b/i;
            const testOpenRe = /test\s*\(.*async.*\{/;
            const lines      = specContent.split('\n');
            const result: string[] = [];
            let injected = false;

            for (const line of lines) {
                if (!injected) {
                    result.push(line);
                    if (testOpenRe.test(line)) {
                        // Preamble incluye el goto al fake Marco al final
                        result.push(extPreamble);
                        result.push(`  await page.goto(${JSON.stringify(externalMarcoUrl)}, { waitUntil: 'domcontentloaded', timeout: 30000 });`);
                        result.push(`  await page.waitForLoadState('networkidle').catch(() => {});`);
                        injected = true;
                    }
                } else if (authGotoRe.test(line)) {
                    continue; // descartar gotos de auth del spec grabado
                } else {
                    result.push(line);
                }
            }

            if (!injected) return specContent;
            return result.join('\n');
        }

        const nomUsuario   = JSON.stringify(envs.NOM_USUARIO);
        const claveUsuario = JSON.stringify(envs.CLAVE_USUARIO);
        const loginUrl     = JSON.stringify(`${ctx.urlRaiz}/Marco/Login_iv.aspx`);

        // Helper that searches all frames for a button by any of the given texts.
        // This mirrors tryWebLogin() — handles iframes and both button label variants.
        const preamble = [
            `  // ── Auth preamble (TestPlatform auto-login) ──────────────────────────────`,
            `  const __allFrames = () => [page.mainFrame(), ...page.frames().filter(f => f !== page.mainFrame())];`,
            `  const __clickBtn = async (texts) => {`,
            `    const sel = texts.flatMap(t => [\`button:has-text("\${t}")\`, \`input[value="\${t}"]\`]).join(', ') + ', input[type="submit"]';`,
            `    for (const fr of __allFrames()) { const b = fr.locator(sel).first(); if (await b.count()) { await b.click(); return; } }`,
            `  };`,
            `  await page.goto(${loginUrl}, { waitUntil: 'domcontentloaded', timeout: 30000 });`,
            `  await page.waitForLoadState('networkidle').catch(() => {});`,
            `  if (/Login_iv\\.aspx/i.test(page.url())) {`,
            `    for (const fr of __allFrames()) {`,
            `      const usr = fr.locator('input[type="text"], input[type="email"]').first();`,
            `      const pwd = fr.locator('input[type="password"]').first();`,
            `      if (await usr.count() && await pwd.count()) {`,
            `        await usr.fill(${nomUsuario});`,
            `        await pwd.fill(${claveUsuario});`,
            `        await page.waitForTimeout(1000);`,
            `        await __clickBtn(['Ingresar', 'Iniciar sesión']);`,
            `        break;`,
            `      }`,
            `    }`,
            `    await page.waitForURL(url => !/Login_iv\\.aspx/i.test(url.toString()), { timeout: 20000 }).catch(() => {});`,
            `    await page.waitForLoadState('networkidle').catch(() => {});`,
            `  }`,
            `  if (/Seleccion(_iv)?\\.aspx/i.test(page.url())) {`,
            `    await page.waitForTimeout(1000);`,
            `    await __clickBtn(['Ingresar', 'Continuar']);`,
            `    await page.waitForURL(url => !/Seleccion/i.test(url.toString()), { timeout: 20000 }).catch(() => {});`,
            `    await page.waitForLoadState('networkidle').catch(() => {});`,
            `  }`,
        ].join('\n');

        // Detect the first "main app" action line: contentFrame() or getByTitle(
        const actionRe   = /^\s*await .+\.(click|fill|selectOption|check|uncheck|dblclick|goto|press)\s*\(/;
        const mainAppRe  = /contentFrame\(\)|getByTitle\s*\(/;
        const testOpenRe = /test\s*\(.*async.*\{/;

        const lines = specContent.split('\n');
        const result: string[] = [];
        let inTestBody    = false;
        let mainAppFound  = false;

        for (const line of lines) {
            if (!inTestBody) {
                result.push(line);
                if (testOpenRe.test(line)) {
                    inTestBody = true;
                    result.push(preamble); // inject preamble right after test opens
                }
                continue;
            }

            // Inside test body — skip auth action lines until the first main-app line
            if (!mainAppFound) {
                if (actionRe.test(line) && mainAppRe.test(line)) {
                    mainAppFound = true;
                    result.push(line); // keep this and everything after
                } else if (actionRe.test(line)) {
                    continue; // drop auth action line
                } else {
                    result.push(line); // keep non-action lines (blank, const, etc.)
                }
            } else {
                result.push(line);
            }
        }

        // Fallback: if no main-app line was found, return original (don't strip anything)
        if (!mainAppFound) return specContent;
        return result.join('\n');
    }

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
                    `${indent}const __snap = async (p: string) => { try { await page.waitForTimeout(400); await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {}); if (await page.locator('#pagina1').count()) { await page.locator('#pagina1').screenshot({ path: p, timeout: 3000 }); } else { await page.screenshot({ path: p, timeout: 3000 }); } } catch {} };`
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

    private async generatePDF(mod: string, id: string, sub?: string, page?: string, processedSpec?: string): Promise<void> {
        const file = recordingsPath(mod, sub, page);
        const recs = read(file);
        const rec  = recs.find(r => r.id === id);
        if (!rec || !fs.existsSync(rec.specFile)) return;

        const specDir      = path.dirname(rec.specFile);
        const screenshotsDir = path.join(specDir, 'screenshots');
        const pdfPath      = path.join(specDir, `doc-${id}.pdf`);

        // Use processedSpec when available so step numbers match the screenshots
        // generated by buildDocSpec (which also ran over the processed spec).
        const steps = this.parseSpecSteps(processedSpec ?? fs.readFileSync(rec.specFile, 'utf-8'));
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

        // Mark as recording BEFORE navigation so the HTTP response is sent immediately.
        // Navigation (including manual SINCO empresa/sucursal selection) runs in background.
        activeProcs.set(id, browser);
        rec.status = 'recording';
        write(file, recs);

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
            if (isReactAppRoute(targetUrl)) {
                // ADPRO React routes: use real Marco (via Seleccion) + direct iframe injection.
                // Fake Marco crashes React 18 apps (useSyncExternalStore needs real session globals).
                const setupReact = async () => {
                    await establishAdproSession(recPage, sessionContext);
                    const f = await recPage.waitForSelector(
                        '#pagina1, iframe[name="pagina1"]', { timeout: 20000 }
                    ).catch(() => null);
                    if (f) {
                        await recPage.evaluate((url) => {
                            const iframe = (document.getElementById('pagina1') as HTMLIFrameElement)
                                ?? (document.querySelector('iframe[name="pagina1"]') as HTMLIFrameElement);
                            if (iframe) iframe.src = url;
                        }, targetUrl);
                        console.log('[E2E Playwright] React route: iframe injected', { targetUrl });
                    }
                };
                setupReact().catch((e) => console.error('[E2E Playwright] React route setup error:', e));
            } else {
                // Fire-and-forget: establishes ADPRO session (may require user to select empresa/sucursal
                // manually in the opened browser — the recorder captures those actions too).
                establishAdproSession(recPage, sessionContext).catch((e) =>
                    console.error('[E2E Playwright] Session establishment error:', e)
                );
            }
        } else {
            recPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
        }

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

    async run(mod: string, id: string, sub?: string, page?: string, overrideUrl?: string, empresaNombre?: string, sucursalNombre?: string, sessionContext?: AdproSessionContext, adproToken?: any): Promise<E2eResult> {
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

        let specSrc = this.cleanupSpec(fs.readFileSync(rec.specFile, 'utf-8'));
        if (sessionContext?.urlRaiz) {
            specSrc = this.buildRunSpec(specSrc, sessionContext, targetUrl, adproToken);
        }
        const docContent = this.buildDocSpec(specSrc, screenshotsDir);
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

        // Generate PDF headlessly — pass the processed spec so step numbers match screenshots.
        await this.generatePDF(mod, id, sub, page, specSrc);

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
