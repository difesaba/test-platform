import { chromium } from 'playwright';
import { torreService } from './torre.service';

function toSeleccionUrl(loginUrl: string): string {
    return loginUrl.replace(/Login\.aspx$/i, 'Seleccion_iv.aspx');
}

// Home del Marco: ahí quedan definidas window.getToken() / window.getTokenAuth().
function toDefaultUrl(loginUrl: string): string {
    return loginUrl.replace(/Login\.aspx.*$/i, 'Default_iv.aspx');
}

export async function playwrightLogin(loginUrl: string): Promise<any> {
    const browser = await chromium.launch({
        channel: 'chrome',
        headless: false,
    });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    let capturedToken: any = null;
    page.on('response', async (res) => {
        if (res.url().includes('/API/Auth/') && res.status() === 200) {
            try {
                const json = await res.json();
                if (json?.access_token) capturedToken = json;
            } catch {}
        }
    });

    const seleccionUrl = toSeleccionUrl(loginUrl);
    console.log(`[Playwright] Navegando a: ${seleccionUrl}`);
    await page.goto(seleccionUrl, { waitUntil: 'networkidle', timeout: 30000 });

    await page.locator('button:has-text("Ingresar"), input[value="Ingresar"], input[type="submit"]')
              .first()
              .click();

    const deadline = Date.now() + 15000;
    while (!capturedToken && Date.now() < deadline) {
        await page.waitForTimeout(300);
    }

    await browser.close();

    if (!capturedToken) throw new Error('No se capturó el token ADPRO — verificar acceso a ' + seleccionUrl);
    console.log('[Playwright] Token capturado correctamente');
    return capturedToken;
}

// Desempaqueta un valor de storage (puede venir como JSON string "\"x\"" o crudo)
function unwrap(raw: string): string {
    let v = raw ?? '';
    try { const p = JSON.parse(v); if (typeof p === 'string') v = p; else if (p && typeof p === 'object' && typeof p.token === 'string') v = p.token; } catch {}
    return v.trim();
}

// Extrae el token desde localStorage/sessionStorage (varias formas conocidas de ADPRO)
function extractTokenFromStorage(store: Record<string, string>): any | null {
    // --- Formato ADPRO v3: claves "<host>_<app>_<guid>?_token" y "..._token_auth" ---
    const tokenKey = Object.keys(store).find(k => /_token$/i.test(k) && !/token[_-]?auth|authoriz/i.test(k));
    // El authorization_token puede venir bajo varias formas: _token_auth, tokenauth, token-auth, ...authorization
    const authKey  = Object.keys(store).find(k => /token[_-]?auth|authoriz/i.test(k));
    if (tokenKey) {
        let rawTok = unwrap(store[tokenKey]);
        let tokenType = 'Bearer';
        let accessToken = rawTok;
        const m = rawTok.match(/^(Bearer)\s+(.+)$/i);
        if (m) { tokenType = m[1]; accessToken = m[2]; }
        const authTok = authKey ? unwrap(store[authKey]) : '';
        if (accessToken && accessToken.length > 20) {
            return {
                access_token: accessToken,
                token_type: tokenType,
                expires_in: 0,
                authorization_token: authTok || undefined,
            };
        }
    }

    // --- Fallbacks (formatos previos) ---
    for (const k of ['access_token', 'accessToken']) {
        if (store[k] && store[k].length > 20) {
            return { access_token: store[k], token_type: 'Bearer' };
        }
    }
    for (const k of ['adpro_token', 'adproToken']) {
        if (store[k]) {
            try {
                const obj = JSON.parse(store[k]);
                if (obj?.access_token) return obj;
            } catch {}
        }
    }
    if (store['token']) {
        try {
            const obj = JSON.parse(store['token']);
            const at = obj?.state?.finalToken ?? obj?.access_token ?? obj?.finalToken;
            const au = obj?.state?.authorizationToken;
            if (at && String(at).length > 20) {
                return { access_token: at, authorization_token: au, token_type: 'Bearer' };
            }
        } catch {}
    }
    return null;
}

async function readStorage(page: any): Promise<Record<string, string>> {
    return page.evaluate(() => {
        const dump: Record<string, string> = {};
        try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; dump[k] = localStorage.getItem(k) ?? ''; } } catch {}
        try { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i)!; if (!(k in dump)) dump[k] = sessionStorage.getItem(k) ?? ''; } } catch {}
        return dump;
    }).catch(() => ({} as Record<string, string>));
}

/**
 * En el Marco de SINCO los tokens se obtienen llamando funciones JS: getToken() (JWT/Bearer)
 * y getTokenAuth() (el authorization_token, a veces como objeto completo). No siempre están en
 * el storage. Las buscamos en window / parent / opener.
 */
async function readMarcoTokens(page: any): Promise<{ access?: string; auth?: string; diag?: string }> {
    return page.evaluate(() => {
        const scopes: [string, any][] = [['window', window]];
        try { if ((window as any).parent && (window as any).parent !== window) scopes.push(['parent', (window as any).parent]); } catch {}
        try { if ((window as any).opener) scopes.push(['opener', (window as any).opener]); } catch {}
        try { if ((window as any).opener?.parent) scopes.push(['opener.parent', (window as any).opener.parent]); } catch {}
        // Diagnóstico: en qué scope existe cada función.
        const diag = scopes.map(([n, s]) => {
            let gt = '-', gta = '-';
            try { gt = typeof s.getToken; } catch { gt = 'x'; }
            try { gta = typeof s.getTokenAuth; } catch { gta = 'x'; }
            return `${n}[getToken=${gt},getTokenAuth=${gta}]`;
        }).join(' ');
        const call = (name: string): any => {
            for (const [, s] of scopes) {
                try { if (typeof s[name] === 'function') { const v = s[name](); if (v) return v; } } catch {}
            }
            return undefined;
        };
        const deBearer = (s: any) => { const m = String(s ?? '').match(/^Bearer\s+(.+)$/i); return m ? m[1] : String(s ?? ''); };
        const tok = call('getToken');
        const authRaw = call('getTokenAuth');
        const access = tok ? deBearer(tok) : (authRaw && typeof authRaw === 'object' ? deBearer(authRaw.access_token ?? authRaw.AccessToken) : '');
        let auth: string | undefined;
        if (typeof authRaw === 'string') auth = deBearer(authRaw);
        else if (authRaw && typeof authRaw === 'object') auth = authRaw.authorization_token ?? authRaw.AuthorizationToken ?? authRaw.tokenAuth ?? authRaw.token_auth ?? undefined;
        return { access: access || undefined, auth: auth || undefined, diag };
    }).catch(() => ({} as { access?: string; auth?: string; diag?: string }));
}

/**
 * Ingreso estilo Torre vía keyC.
 * 1) POST del keyC a Login.aspx (formulario x-www-form-urlencoded, EXACTAMENTE como Torre)
 *    → el servidor valida la llave, arma la sesión y redirige a Seleccion_iv.aspx (autenticado).
 * 2) En Seleccion_iv.aspx se elige empresa/sucursal y se pulsa "Ingresar" → dispara el token.
 * 3) Captura el token de la respuesta /API/Auth/ o del localStorage.
 * Instrumentado para diagnóstico.
 */
export async function loginWithKeyC(loginUrl: string, usuarioErp?: string): Promise<any> {
    const key    = await torreService.getSsoKey();
    const fields = torreService.loginFields(key, usuarioErp);
    console.log('===================== [keyC] DIAGNÓSTICO =====================');
    console.log('[keyC] keyC longitud:', key?.length ?? 0);
    console.log('[keyC] POST →', loginUrl, '| campos:', JSON.stringify({ ...fields, keyC: '***' }));

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page    = await context.newPage();

    let capturedToken: any = null;
    const relevantResponses: string[] = [];

    page.on('response', async (res) => {
        const u = res.url();
        if (/auth|token|sesion|iniciar|autenticar|usuario/i.test(u)) {
            relevantResponses.push(`${res.status()} ${res.request().method()} ${u}`);
            if (res.status() === 200) {
                try {
                    const json = await res.json();
                    if (json?.access_token) { capturedToken = json; console.log('[keyC] token en respuesta:', u); }
                } catch {}
            }
        }
    });
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('[keyC] navegó a:', f.url()); });

    try {
        // 1) POST del keyC a Login.aspx (formulario), tal como lo hace Torre → establece la sesión
        await page.goto('about:blank');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 })
                .catch((e: any) => console.log('[keyC] waitForNavigation:', e.message)),
            page.evaluate((data: { action: string; fields: Record<string, string> }) => {
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = data.action;
                for (const [k, v] of Object.entries(data.fields)) {
                    const input = document.createElement('input');
                    input.type  = 'hidden';
                    input.name  = k;
                    input.value = String(v);
                    form.appendChild(input);
                }
                document.body.appendChild(form);
                form.submit();
            }, { action: loginUrl, fields }),
        ]);
        await page.waitForTimeout(2000);
        console.log('[keyC] tras POST, URL:', page.url(), '| storage:', Object.keys(await readStorage(page)).join(',') || '(vacío)');

        // 2) Ir a Seleccion y pulsar Ingresar para disparar el token
        if (!capturedToken) {
            const seleccionUrl = toSeleccionUrl(loginUrl);
            console.log('[keyC] navegando a Seleccion:', seleccionUrl);
            await page.goto(seleccionUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => console.log('[keyC] goto seleccion:', e.message));
            await page.waitForTimeout(1500);
            console.log('[keyC] en Seleccion, URL:', page.url(), '| title:', await page.title().catch(() => ''));

            try {
                const btn = page.locator('button:has-text("Ingresar"), input[value="Ingresar"], input[type="submit"], a:has-text("Ingresar")').first();
                if (await btn.count().then((c: number) => c > 0).catch(() => false)) {
                    console.log('[keyC] botón Ingresar encontrado — clic');
                    await btn.click({ timeout: 4000 }).catch(() => {});
                } else {
                    console.log('[keyC] sin botón Ingresar visible');
                }
            } catch {}
        }

        // 3) Esperar token (respuesta o storage)
        const deadline = Date.now() + 30000;
        while (!capturedToken && Date.now() < deadline) {
            const fromLs = extractTokenFromStorage(await readStorage(page));
            if (fromLs) { capturedToken = fromLs; console.log('[keyC] token desde storage'); break; }
            await page.waitForTimeout(500);
        }

        // 3b) getToken()/getTokenAuth() viven en el HOME del Marco (Default_iv.aspx), no en Seleccion.
        //     Navegamos ahí, esperamos a que el Marco las defina, y capturamos ambos tokens.
        try {
            const homeUrl = toDefaultUrl(loginUrl);
            console.log('[keyC] navegando al home del Marco:', homeUrl);
            await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e: any) => console.log('[keyC] goto Default:', e.message));
            await page.waitForTimeout(1500);

            let marco = await readMarcoTokens(page);
            const authDeadline = Date.now() + 15000;
            while (!marco.auth && Date.now() < authDeadline) {
                await page.waitForTimeout(600);
                marco = await readMarcoTokens(page);
            }
            console.log('[keyC] Marco funcs →', marco.diag ?? '(sin diag)');
            if (marco.access || marco.auth) {
                capturedToken = capturedToken ?? { token_type: 'Bearer' };
                if (marco.access) capturedToken.access_token = marco.access;      // getToken() es la fuente autoritativa
                if (marco.auth) capturedToken.authorization_token = marco.auth;
                capturedToken.token_type = capturedToken.token_type ?? 'Bearer';
            }
            console.log('[keyC] getToken/getTokenAuth →', marco.access ? 'access ✓' : 'access ✗', '·', marco.auth ? 'auth ✓' : 'auth ✗ (getTokenAuth vacío)');
        } catch (e: any) { console.warn('[keyC] getToken/getTokenAuth falló:', e?.message); }

        console.log('[keyC] URL final :', page.url());
        console.log('[keyC] title     :', await page.title().catch(() => ''));
        const stFinal = await readStorage(page);
        console.log('[keyC] storage   :', Object.keys(stFinal).join(',') || '(vacío)');
        Object.keys(stFinal)
            .filter(k => /_token(_auth)?$/i.test(k))
            .forEach(k => console.log('[keyC] token-key:', k, '=>', unwrap(stFinal[k]).slice(0, 45), '...'));
        console.log('[keyC] respuestas relevantes:');
        relevantResponses.slice(0, 30).forEach(r => console.log('   -', r));
    } finally {
        await browser.close();
        console.log('==============================================================');
    }

    if (!capturedToken) {
        throw new Error('No se capturó el token ADPRO vía keyC. Revisa el bloque [keyC] DIAGNÓSTICO en la consola.');
    }
    console.log('[keyC] Token capturado correctamente');
    return capturedToken;
}


// ===== Token admin (keyC) para llamar las APIs del ERP, cacheado por urlRaiz =====
const adproTokenCache = new Map<string, { token: any; expiresAt: number }>();
const ADPRO_TOKEN_TTL = 20 * 60 * 1000; // 20 min

/**
 * Obtiene el token ADPRO de `admin` vía login centralizado keyC (estilo Torre),
 * en un navegador headless, y lo cachea por urlRaiz. Con este token
 * (Authorization: Bearer + X-SincoERP-Authorization) se pueden llamar las APIs
 * del ERP SIN credenciales de usuario (sin desarrolladorcbr).
 */
export async function captureAdproToken(loginUrl: string): Promise<any> {
    const urlRaiz = loginUrl.replace(/\/Marco\/Login\.aspx.*$/i, '');
    const cached = adproTokenCache.get(urlRaiz);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    const key    = await torreService.getSsoKey();
    const fields = torreService.loginFields(key);

    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({ ignoreHTTPSErrors: true });
        const page    = await context.newPage();

        await page.goto('about:blank');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => undefined),
            page.evaluate((data: { action: string; fields: Record<string, string> }) => {
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = data.action;
                for (const [k, v] of Object.entries(data.fields)) {
                    const input = document.createElement('input');
                    input.type  = 'hidden';
                    input.name  = k;
                    input.value = String(v);
                    form.appendChild(input);
                }
                document.body.appendChild(form);
                form.submit();
            }, { action: loginUrl, fields }),
        ]);

        // Esperar a que el ERP deje el token (access + authorization) en storage
        let token: any = null;
        let lastStore: Record<string, string> = {};
        const deadline = Date.now() + 25000;
        while (Date.now() < deadline) {
            lastStore = await readStorage(page);
            token = extractTokenFromStorage(lastStore);
            if (token?.access_token && token.authorization_token) break;
            await page.waitForTimeout(400);
        }
        if (!token?.access_token) {
            throw new Error(`No se pudo capturar el token admin (keyC) en ${urlRaiz} — URL: ${page.url()}`);
        }
        // El authorization_token no está en storage: se obtiene llamando getTokenAuth() en el HOME del Marco.
        if (!token.authorization_token) {
            try {
                await page.goto(toDefaultUrl(loginUrl), { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => undefined);
                await page.waitForTimeout(1200);
                let marco = await readMarcoTokens(page);
                const authDeadline = Date.now() + 12000;
                while (!marco.auth && Date.now() < authDeadline) { await page.waitForTimeout(600); marco = await readMarcoTokens(page); }
                if (marco.access) token.access_token = marco.access;
                if (marco.auth) token.authorization_token = marco.auth;
                if (!marco.auth) console.warn('[captureAdproToken] ⚠ sin authorization_token.', marco.diag ?? '', '| storage:', Object.keys(lastStore));
                else console.log('[captureAdproToken] authorization_token vía getTokenAuth ✓');
            } catch (e: any) { console.warn('[captureAdproToken] getTokenAuth falló:', e?.message); }
        }
        adproTokenCache.set(urlRaiz, { token, expiresAt: Date.now() + ADPRO_TOKEN_TTL });
        console.log('[captureAdproToken] token admin obtenido para', urlRaiz, '| authorization_token:', token.authorization_token ? 'sí' : 'NO');
        return token;
    } finally {
        await browser.close();
    }
}