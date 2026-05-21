import fs from 'fs';
import path from 'path';
import { envs } from '../config/envs';
import { randomUUID } from 'crypto';
import { chromium, type Browser, type BrowserContext, type Frame, type Locator, type Page } from 'playwright';

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

export interface UiTest {
    id: string;
    name: string;
    url: string;
    createdAt: string;
    components?: UiTestComponent[];
    lastResult?: UiTestResult;
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

export interface UiTestResult {
    screenshot: string;
    title: string;
    loadTime: number;
    ok: boolean;
    error?: string;
    runAt: string;
    componentResults?: UiTestComponentResult[];
}

interface ComponentPickerSession {
    id: string;
    browser: Browser;
    context: BrowserContext;
    page: Page;
    lastSelection?: UiTestComponentCandidate;
}

interface AdproSessionContext {
    urlRaiz?: string;
    clienteId?: number;
    empresaId?: number;
    sucursalId?: number;
    empresaNombre?: string;
    sucursalNombre?: string;
    entornoName?: string;
    empNombre?: string;
}

const pickerSessions = new Map<string, ComponentPickerSession>();
const loginAttemptState = new WeakMap<Page, { url: string; attemptedAt: number; count: number }>();

function testsPath(mod: string, sub?: string, page?: string): string {
    const base = path.join(process.cwd(), envs.WORKSPACE_PATH, 'modules', mod);
    let dir: string;
    if (sub && page)    dir = path.join(base, 'submodules', sub, 'pages', page, 'ui');
    else if (page)      dir = path.join(base, 'pages', page, 'ui');
    else if (sub)       dir = path.join(base, 'submodules', sub, 'ui');
    else                dir = path.join(base, 'ui');
    return path.join(dir, 'tests.json');
}

function read(file: string): UiTest[] {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function write(file: string, tests: UiTest[]): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(tests, null, 2), 'utf-8');
}

async function createContext(adproToken?: any, sessionContext?: AdproSessionContext, headless = true, navigationUrl?: string) {
    const useLocalhostMode = isLocalhostUrl(navigationUrl ?? '');
    console.log('[UI Playwright] Launching Chromium', {
        headless,
        useLocalhostMode,
        navigationUrl: navigationUrl ?? '',
        sessionUrlRaiz: sessionContext?.urlRaiz ?? '',
        empresaId: sessionContext?.empresaId ?? null,
        sucursalId: sessionContext?.sucursalId ?? null,
    });

    let context: BrowserContext | null = null;
    let browser: Browser | null = null;

    browser = await chromium.launch({
        headless,
        args: [
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
        ],
    });
    context = await browser.newContext({ ignoreHTTPSErrors: true });
    console.log('[UI Playwright] Using isolated browser context');

    if (!context || !browser) {
        throw new Error('No fue posible iniciar un navegador aislado para Playwright.');
    }

    if (adproToken?.access_token || sessionContext) {
        await context.addInitScript(({ token, session }: { token?: any; session?: AdproSessionContext }) => {
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
                // Doble Token: inyectar authorization_token para que la SPA lo encuentre al inicializar
                if ((token as any).authorization_token) {
                    writeValue('authorization_token', (token as any).authorization_token);
                }
                // SPAs con Marco llaman window.parent.getToken() / getTokenAuth() para autenticarse.
                // En el top frame window.parent === window, así que esto las cubre.
                // getToken() retorna el JWT string; getTokenAuth() retorna el objeto completo
                // (algunas SPAs actualizadas leen ambos — _sesion = getTokenAuth()).
                try {
                    (window as any).getToken = () => {
                        console.log('[TP] getToken called ->', (token?.access_token ?? '').slice(0, 80) + '...');
                        return token.access_token;
                    };
                } catch {}
                try {
                    (window as any).getTokenAuth = () => {
                        const authToken = (token as any).authorization_token ?? '';
                        console.log('[TP] getTokenAuth called -> authorization_token:', authToken.slice(0, 60) + '...');
                        return authToken;
                    };
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
                        console.log('[TP] window.opener mock OK (top frame)');
                    }
                } catch (e: any) {
                    console.log('[TP] window.opener mock FAILED:', e?.message);
                }
            }

            if (session) {
                const persistedUserSession = {
                    state: {
                        sesion: {
                            access_token: token?.access_token ?? '',
                            expires_in: token?.expires_in ?? 0,
                            token_type: token?.token_type ?? 'Bearer',
                            data: {
                                IdObra: 0,
                                IdSucursal: String(session.sucursalId ?? ''),
                                NitEmpresa: '',
                                NomObra: '',
                                NomUsuario: session.empNombre ?? '',
                                NombreEmpresa: session.empresaNombre ?? '',
                                NombreSucursal: session.sucursalNombre ?? '',
                                UsuDominio: '',
                                idEmpresa: session.empresaId ?? 0,
                                IdUsuario: 0,
                                EsReplica: session.entornoName === 'replica',
                                tipoBaseDatos: session.entornoName === 'replica' ? 2 : 1,
                            },
                        },
                        sesionExpirada: false,
                    },
                    version: 0,
                };
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
                writeValue('user-session', JSON.stringify(persistedUserSession));
                writeValue('token', JSON.stringify(persistedFinalToken));
            }
        }, { token: adproToken, session: sessionContext });
    }

    // Modelo Doble Token: inyectar Authorization y X-SincoERP-Authorization en todos los requests.
    // El interceptor de la SPA puede fallar al llamar getTokenAuth() (problema con window.opener),
    // lo que causa que ninguno de los dos headers llegue al servidor. Los añadimos aquí si faltan.
    if (adproToken?.access_token) {
        const bearerValue = `${adproToken.token_type ?? 'Bearer'} ${adproToken.access_token}`;
        const authorizationToken = adproToken.authorization_token ?? adproToken.access_token;
        console.log('[UI Route] tokens listos para inyección:', {
            hasAccessToken: Boolean(adproToken.access_token),
            hasAuthorizationToken: Boolean(adproToken.authorization_token),
            authorizationTokenPreview: adproToken.authorization_token
                ? adproToken.authorization_token.slice(0, 40) + '...'
                : '(sin authorization_token — usando access_token como fallback)',
        });
        await context.route('**/*', async (route) => {
            const headers = { ...route.request().headers() };
            const url = route.request().url();
            // Asegura que Authorization tenga el prefijo "Bearer " — la SPA puede enviarlo sin él
            if (!headers['authorization'] || !headers['authorization'].toLowerCase().startsWith('bearer ')) {
                headers['authorization'] = bearerValue;
            }
            if (!headers['x-sincoerp-authorization'] && authorizationToken) {
                headers['x-sincoerp-authorization'] = authorizationToken;
                if (/\/API\//i.test(url)) {
                    console.log('[UI Route] X-SincoERP-Authorization añadido →', url.slice(0, 100));
                }
            }
            await route.continue({ headers });
        });
    }

    return { browser, context };
}

function isReactAppRoute(url: string): boolean {
    return /\/ADPRO\/Views\/reactapp\/#/i.test(url);
}

function isLocalhostUrl(url: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url);
}

// Detecta cualquier SPA con Marco+iframe por su patrón de hash routing (#/).
// Devuelve la URL del Marco derivada, o null si no aplica.
// Usa sessionUrlRaiz (mismo origen) para manejar correctamente cualquier profundidad de path.
// ADPRO React routes excluidas: el fake Marco crashea React 18 (useSyncExternalStore sin globals de sesión).
// Para esas rutas se usa el flujo real Seleccion_iv.aspx + inyección directa de iframe.
function tryDeriveMarcoUrl(targetUrl: string, sessionUrlRaiz: string): string | null {
    if (!targetUrl.includes('#/')) return null;
    if (isReactAppRoute(targetUrl)) return null;
    try {
        const pathWithoutHash = targetUrl.split('#')[0];
        const parsedTarget = new URL(pathWithoutHash);
        // Same origin: use sessionUrlRaiz — reliable for any path depth (CBRVentas, ADPRO/Views/reactapp, etc.)
        if (sessionUrlRaiz) {
            try {
                if (new URL(sessionUrlRaiz).origin === parsedTarget.origin) {
                    return buildMarcoUrl(sessionUrlRaiz) || null;
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

function buildMarcoUrl(sessionUrlRaiz?: string): string {
    const base = sessionUrlRaiz?.trim();
    if (!base) return '';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return new URL('Marco/Default_iv.aspx', normalizedBase).toString();
}

function buildSeleccionUrl(sessionUrlRaiz?: string): string {
    const base = sessionUrlRaiz?.trim();
    if (!base) return '';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return new URL('Marco/Seleccion_iv.aspx', normalizedBase).toString();
}

async function tryWebLogin(page: Page): Promise<void> {
    if (!/Login_iv\.aspx/i.test(page.url())) return;

    const currentUrl = page.url();
    const previousAttempt = loginAttemptState.get(page);
    if (previousAttempt?.url === currentUrl && (Date.now() - previousAttempt.attemptedAt) < 10000) {
        console.log('[UI Playwright] Skipping duplicate login attempt', {
            currentUrl,
            count: previousAttempt.count,
        });
        return;
    }

    loginAttemptState.set(page, {
        url: currentUrl,
        attemptedAt: Date.now(),
        count: (previousAttempt?.url === currentUrl ? previousAttempt.count : 0) + 1,
    });

    console.log('[UI Playwright] Attempting web login');

    const roots = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
    for (const [rootIndex, root] of roots.entries()) {
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
            await passwordField.waitFor({ state: 'visible', timeout: 8000 });

            console.log('[UI Playwright] Login controls found, filling credentials', {
                rootIndex,
                frameUrl: root.url(),
            });

            await usernameField.click();
            await usernameField.fill(envs.NOM_USUARIO);
            await usernameField.press('Tab');

            await passwordField.click();
            await passwordField.fill(envs.CLAVE_USUARIO);
            await passwordField.press('Tab');

            await loginButton.click();

            await page.waitForURL(
                (url) => !/Login_iv\.aspx/i.test(url.toString()),
                { timeout: 15000 },
            );
            await page.waitForLoadState('networkidle').catch(() => undefined);

            console.log('[UI Playwright] Login navigation succeeded', { newUrl: page.url() });
            return;
        } catch (error) {
            console.log('[UI Playwright] Login attempt failed', {
                rootIndex,
                frameUrl: root.url(),
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    console.log('[UI Playwright] Could not complete web login — no suitable form found');
}

async function applyMarcoSelection(page: Page, sessionContext?: AdproSessionContext): Promise<void> {
    if (!sessionContext) return;

    const selectionSnapshot = await page.evaluate(() => ({
        url: window.location.href,
        title: document.title,
        selects: Array.from(document.querySelectorAll('select')).map((item, index) => ({
            index,
            id: item.id || '',
            name: item.getAttribute('name') || '',
            optionCount: item.querySelectorAll('option').length,
        })),
        buttons: Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]')).map((item, index) => ({
            index,
            text: (item.textContent || item.getAttribute('value') || '').trim(),
        })),
    }));
    console.log('[UI Playwright] Selection page snapshot', selectionSnapshot);

    const applySelectValue = async (selector: string, idValue?: number, labelValue?: string) => {
        const field = page.locator(selector).first();
        if (!await field.count()) return false;

        try {
            if (typeof idValue === 'number') {
                await field.selectOption({ value: String(idValue) });
                return true;
            }
        } catch {}

        try {
            if (labelValue) {
                await field.selectOption({ label: labelValue });
                return true;
            }
        } catch {}

        return false;
    };

    const fillInputValue = async (selector: string, value?: string) => {
        if (!value) return false;
        const field = page.locator(selector).first();
        if (!await field.count()) return false;
        try {
            await field.fill(value);
            return true;
        } catch {
            return false;
        }
    };

    const empresaMatched = await applySelectValue('select[id*="empresa" i], select[name*="empresa" i]', sessionContext.empresaId, sessionContext.empresaNombre);
    // Sucursal se carga en cascada tras seleccionar empresa — esperar hasta 5 s
    await page.waitForSelector('select[id*="sucursal" i], select[name*="sucursal" i]', { timeout: 5000 }).catch(() => undefined);
    const sucursalMatched = await applySelectValue('select[id*="sucursal" i], select[name*="sucursal" i]', sessionContext.sucursalId, sessionContext.sucursalNombre);
    await fillInputValue('input[id*="empresa" i], input[name*="empresa" i]', sessionContext.empresaNombre);
    await fillInputValue('input[id*="sucursal" i], input[name*="sucursal" i]', sessionContext.sucursalNombre);

    const genericSelects = page.locator('select');
    const genericSelectCount = await genericSelects.count();
    if (!empresaMatched && genericSelectCount >= 1) {
        try {
            await genericSelects.nth(0).selectOption({ value: String(sessionContext.empresaId ?? '') });
        } catch {
            try {
                if (sessionContext.empresaNombre) {
                    await genericSelects.nth(0).selectOption({ label: sessionContext.empresaNombre });
                }
            } catch {}
        }
    }
    if (!sucursalMatched && genericSelectCount >= 2) {
        try {
            await genericSelects.nth(1).selectOption({ value: String(sessionContext.sucursalId ?? '') });
        } catch {
            try {
                if (sessionContext.sucursalNombre) {
                    await genericSelects.nth(1).selectOption({ label: sessionContext.sucursalNombre });
                }
            } catch {}
        }
    }

    const confirmButton = page.locator('button:has-text("Ingresar"), button:has-text("Continuar"), button:has-text("Aceptar"), input[value="Ingresar"], input[value="Continuar"], input[type="submit"]').first();
    if (await confirmButton.count()) {
        try {
            await confirmButton.click();
            await page.waitForLoadState('networkidle').catch(() => undefined);
        } catch {}
    }
}

async function ensureMarcoSession(page: Page, sessionContext?: AdproSessionContext): Promise<void> {
    if (!sessionContext?.urlRaiz) return;

    const iframeCount = await page.locator('iframe').count();
    if (iframeCount > 0) return;

    const currentUrl = page.url();
    const needsSelection = /Login_iv\.aspx|Seleccion_iv\.aspx/i.test(currentUrl) || iframeCount === 0;
    if (!needsSelection) return;

    await tryWebLogin(page);
    if (/Default_iv\.aspx/i.test(page.url()) || await page.locator('iframe').count() > 0) {
        console.log('[UI Playwright] Web login produced a valid Marco session', { currentUrl: page.url() });
        return;
    }

    const seleccionUrl = buildSeleccionUrl(sessionContext.urlRaiz);
    console.log('[UI Playwright] Marco has no iframe, opening selection flow', {
        currentUrl,
        seleccionUrl,
        empresaId: sessionContext.empresaId ?? null,
        sucursalId: sessionContext.sucursalId ?? null,
    });

    await page.goto(seleccionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await applyMarcoSelection(page, sessionContext);

    // Esperar navegación fuera de la página de selección (cualquier URL diferente a Seleccion_iv.aspx)
    await page.waitForURL((url) => !/Seleccion_iv\.aspx/i.test(url.toString()), { timeout: 15000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle').catch(() => undefined);

    if (!/Default_iv\.aspx/i.test(page.url())) {
        const marcoUrl = buildMarcoUrl(sessionContext.urlRaiz);
        console.log('[UI Playwright] Selection did not redirect to Default_iv.aspx, forcing Marco', { marcoUrl });
        await page.goto(marcoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle').catch(() => undefined);
    }
}

async function ensureNotOnLoginPage(page: Page, sessionContext?: AdproSessionContext, targetUrl?: string): Promise<void> {
    if (!sessionContext?.urlRaiz) return;
    if (!/Login_iv\.aspx/i.test(page.url())) return;

    await tryWebLogin(page);
    if (!/Login_iv\.aspx/i.test(page.url())) {
        if (targetUrl && !isReactAppRoute(targetUrl)) {
            console.log('[UI Playwright] Login succeeded, retrying target URL', { targetUrl });
            await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        } else if (targetUrl) {
            console.log('[UI Playwright] Login succeeded, keeping Marco flow without forcing react route', { targetUrl });
        }
        return;
    }

    const seleccionUrl = buildSeleccionUrl(sessionContext.urlRaiz);
    console.log('[UI Playwright] Redirected to Login_iv.aspx, forcing selection flow', {
        currentUrl: page.url(),
        seleccionUrl,
        targetUrl: targetUrl ?? '',
    });

    await page.goto(seleccionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await applyMarcoSelection(page, sessionContext);

    if (targetUrl && !isReactAppRoute(targetUrl)) {
        console.log('[UI Playwright] Retrying target URL after selection flow', { targetUrl });
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    } else if (targetUrl) {
        console.log('[UI Playwright] Selection flow recovered session without forcing react route', { targetUrl });
    }
}

async function openTargetPage(page: Page, targetUrl: string, sessionContext?: AdproSessionContext): Promise<void> {
    const sessionUrlRaiz = sessionContext?.urlRaiz;
    if (!sessionUrlRaiz || isLocalhostUrl(targetUrl)) {
        console.log('[UI Playwright] Direct navigation without sessionUrlRaiz', { targetUrl });
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        return;
    }

    // SPA externa con Marco+iframe (ej. SincoERP CBRVentas): la URL es del iframe pagina1.
    // Detectamos el patrón pero NO salteamos el flujo ADPRO — necesitamos establecer las
    // cookies de sesión ADPRO primero. El flujo continúa y al final navega a la URL de la SPA.
    // SPA con Marco+iframe (cualquier módulo con hash routing):
    // Navegamos directamente al URL del Marco, interceptamos la respuesta y
    // servimos un fake Marco mínimo que carga la SPA en el iframe pagina1.
    // Así no hay redirect ni login — los tokens están inyectados por createContext.
    const externalMarcoUrl = tryDeriveMarcoUrl(targetUrl, sessionUrlRaiz);
    if (externalMarcoUrl) {
        await page.route('**/Marco/Default_iv.aspx*', async (route) => {
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
        });
        console.log('[UI Playwright] Marco SPA: navigating directly to Marco URL', { externalMarcoUrl, targetUrl });
        await page.goto(externalMarcoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
        await page.waitForSelector('#pagina1, iframe[name="pagina1"], iframe', { timeout: 20000 }).catch(() => undefined);
        await page.waitForLoadState('networkidle').catch(() => undefined);
        return;
    }

    // Ir directo a Seleccion_iv.aspx — accesible sin login previo (no redirige a Login_iv.aspx)
    // Igual que playwrightLogin en playwright-auth.service.ts. Evita rellenar credenciales.
    const seleccionUrl = buildSeleccionUrl(sessionUrlRaiz);
    console.log('[UI Playwright] Navegando directo a Seleccion_iv.aspx', { seleccionUrl, targetUrl });
    await page.goto(seleccionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    // Fallback: si por alguna razón redirigió a Login, intentar login web
    if (/Login_iv\.aspx/i.test(page.url())) {
        console.log('[UI Playwright] Redirigido a Login inesperadamente, fallback tryWebLogin');
        await tryWebLogin(page);
        await page.waitForLoadState('networkidle').catch(() => undefined);
    }

    // createContext ya inyectó empresaId/sucursalId en localStorage.
    // Seleccion_iv.aspx puede leerlos y pre-seleccionar los dropdowns.
    // Intentar click directo en Ingresar — si ya está todo seleccionado, redirige de inmediato.
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
        console.log('[UI Playwright] Click directo en Ingresar', { sessionEstablished });
    }

    // Fallback: si el click directo no funcionó, usar applyMarcoSelection completo
    if (!sessionEstablished) {
        console.log('[UI Playwright] Seleccion no redirigió, usando applyMarcoSelection completo');
        await applyMarcoSelection(page, sessionContext);
        await page.waitForURL(
            (url) => !/Seleccion_iv\.aspx/i.test(url.toString()),
            { timeout: 15000 }
        ).catch(() => undefined);
    }

    await page.waitForLoadState('networkidle').catch(() => undefined);
    console.log('[UI Playwright] Sesion establecida', { currentUrl: page.url() });

    if (!isReactAppRoute(targetUrl)) {
        console.log('[UI Playwright] Navigating to target URL after Marco auth', { targetUrl });
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await ensureNotOnLoginPage(page, sessionContext, targetUrl);
        return;
    }

    // REACT ROUTE: inyectar targetUrl directamente en el iframe pagina1.
    // El Marco real (cargado arriba via Seleccion) provee los globals de sesión que
    // React 18 + Zustand necesitan para inicializar correctamente.
    console.log('[UI Playwright] React route: injecting iframe URL', { targetUrl });
    const iframeEl = await page.waitForSelector(
        '#pagina1, iframe[name="pagina1"], iframe',
        { timeout: 20000 }
    ).catch(() => null);
    if (iframeEl) {
        await page.evaluate((url) => {
            const f = (document.getElementById('pagina1') as HTMLIFrameElement)
                ?? (document.querySelector('iframe[name="pagina1"]') as HTMLIFrameElement)
                ?? (document.querySelector('iframe') as HTMLIFrameElement);
            if (f) f.src = url;
        }, targetUrl);
        const iframeHandle = await page.locator('#pagina1, iframe[name="pagina1"], iframe')
            .first().elementHandle({ timeout: 5000 }).catch(() => null);
        const iframeFrame = await iframeHandle?.contentFrame();
        if (iframeFrame) {
            await iframeFrame.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined);
            console.log('[UI Playwright] React iframe loaded', { frameUrl: iframeFrame.url() });
        }
    }
}

function getRoots(page: Page): Frame[] {
    const mainFrame = page.mainFrame();
    return [mainFrame, ...page.frames().filter((frame) => frame !== mainFrame)];
}

async function collectComponents(root: Frame): Promise<UiTestComponentCandidate[]> {
    try {
        return await root.locator('input, textarea, select').evaluateAll((nodes: any[]) => {
            const sanitize = (value: string) => value.replace(/"/g, '\\"');
            const buildSelector = (node: any) => {
                const tagName = String(node.tagName ?? '').toLowerCase();
                if (node.id) return `#${CSS.escape(node.id)}`;
                if (node.getAttribute('data-testid')) return `[data-testid="${sanitize(node.getAttribute('data-testid'))}"]`;
                if (node.getAttribute('name')) return `${tagName}[name="${sanitize(node.getAttribute('name'))}"]`;
                if (node.getAttribute('aria-label')) return `${tagName}[aria-label="${sanitize(node.getAttribute('aria-label'))}"]`;
                if (node.getAttribute('placeholder')) return `${tagName}[placeholder="${sanitize(node.getAttribute('placeholder'))}"]`;

                const siblings = Array.from(node.parentElement?.children ?? []).filter((child: any) => child.tagName === node.tagName);
                const index = Math.max(1, siblings.indexOf(node) + 1);
                return `${tagName}:nth-of-type(${index})`;
            };

            const labelFromDom = (node: any) => {
                const labelByFor = node.id ? document.querySelector(`label[for="${CSS.escape(node.id)}"]`) : null;
                const parentLabel = node.closest('label');
                return String(
                    labelByFor?.textContent
                    || parentLabel?.textContent
                    || node.getAttribute('aria-label')
                    || node.getAttribute('placeholder')
                    || node.getAttribute('name')
                    || node.id
                    || node.tagName
                ).trim();
            };

            return nodes.map((node: any) => ({
                selector: buildSelector(node),
                label: labelFromDom(node),
                tagName: String(node.tagName ?? '').toLowerCase(),
                inputType: String(node.getAttribute?.('type') ?? ''),
                required: Boolean(node.hasAttribute?.('required') || node.getAttribute?.('aria-required') === 'true'),
                placeholder: String(node.getAttribute?.('placeholder') ?? ''),
            }));
        });
    } catch {
        return [];
    }
}

async function installPicker(root: Frame): Promise<void> {
    await root.evaluate(() => {
        const w = window as typeof window & {
            __tpPickerInstalled?: boolean;
            __tpPickerSelection?: Record<string, unknown> | null;
            __tpPickerOverlay?: HTMLDivElement;
            __tpPickerCleanup?: () => void;
        };

        if (w.__tpPickerInstalled) return;

        w.__tpPickerInstalled = true;
        w.__tpPickerSelection = null;

        const sanitize = (value: string) => value.replace(/"/g, '\\"');
        const buildSelector = (node: Element) => {
            const tagName = node.tagName.toLowerCase();
            if ((node as HTMLElement).id) return `#${CSS.escape((node as HTMLElement).id)}`;
            if (node.getAttribute('data-testid')) return `[data-testid="${sanitize(node.getAttribute('data-testid') ?? '')}"]`;
            if (node.getAttribute('name')) return `${tagName}[name="${sanitize(node.getAttribute('name') ?? '')}"]`;
            if (node.getAttribute('aria-label')) return `${tagName}[aria-label="${sanitize(node.getAttribute('aria-label') ?? '')}"]`;
            if (node.getAttribute('placeholder')) return `${tagName}[placeholder="${sanitize(node.getAttribute('placeholder') ?? '')}"]`;

            const parent = node.parentElement;
            if (!parent) return tagName;
            const siblings = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
            const index = Math.max(1, siblings.indexOf(node) + 1);
            return `${tagName}:nth-of-type(${index})`;
        };

        const labelFromDom = (node: Element) => {
            const htmlNode = node as HTMLElement;
            const labelByFor = htmlNode.id ? document.querySelector(`label[for="${CSS.escape(htmlNode.id)}"]`) : null;
            const parentLabel = node.closest('label');
            return String(
                labelByFor?.textContent
                || parentLabel?.textContent
                || node.getAttribute('aria-label')
                || node.getAttribute('placeholder')
                || node.getAttribute('name')
                || htmlNode.id
                || node.tagName
            ).trim();
        };

        const overlay = document.createElement('div');
        overlay.textContent = 'Selector activo: haz clic en un input, textarea o select. Presiona Esc para cancelar.';
        overlay.style.position = 'fixed';
        overlay.style.top = '12px';
        overlay.style.right = '12px';
        overlay.style.zIndex = '2147483647';
        overlay.style.padding = '10px 14px';
        overlay.style.background = '#008dcf';
        overlay.style.color = '#ffffff';
        overlay.style.borderRadius = '8px';
        overlay.style.fontFamily = 'Arial, sans-serif';
        overlay.style.fontSize = '13px';
        overlay.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
        document.body.appendChild(overlay);
        w.__tpPickerOverlay = overlay;

        const clickHandler = (event: MouseEvent) => {
            const target = event.target instanceof Element ? event.target.closest('input, textarea, select') : null;
            if (!target) return;
            event.preventDefault();
            event.stopPropagation();

            const htmlTarget = target as HTMLElement;
            htmlTarget.style.outline = '2px solid #008dcf';
            htmlTarget.style.outlineOffset = '2px';

            const selection = {
                selector: buildSelector(target),
                label: labelFromDom(target),
                tagName: target.tagName.toLowerCase(),
                inputType: target.getAttribute('type') ?? '',
                required: Boolean(target.hasAttribute('required') || target.getAttribute('aria-required') === 'true'),
                placeholder: target.getAttribute('placeholder') ?? '',
            };

            w.__tpPickerSelection = selection;
            (window as any).__tpSubmitSelection?.(selection);
            if (w.__tpPickerOverlay) {
                w.__tpPickerOverlay.textContent = `Seleccionado: ${selection.label || selection.selector}. Vuelve a testPlatform para asignar reglas.`;
            }
        };

        const keydownHandler = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            w.__tpPickerSelection = null;
            if (w.__tpPickerOverlay) {
                w.__tpPickerOverlay.textContent = 'Selector cancelado. Puedes cerrar esta ventana.';
            }
            w.__tpPickerCleanup?.();
        };

        document.addEventListener('click', clickHandler, true);
        document.addEventListener('keydown', keydownHandler, true);
        document.body.style.cursor = 'crosshair';

        w.__tpPickerCleanup = () => {
            document.removeEventListener('click', clickHandler, true);
            document.removeEventListener('keydown', keydownHandler, true);
            document.body.style.cursor = '';
            if (w.__tpPickerOverlay?.parentElement) {
                w.__tpPickerOverlay.parentElement.removeChild(w.__tpPickerOverlay);
            }
        };
    });
}

async function installPickerEverywhere(page: Page): Promise<void> {
    for (const root of getRoots(page)) {
        try {
            await installPicker(root);
        } catch {}
    }
}

async function cleanupPickerEverywhere(page: Page): Promise<void> {
    for (const root of getRoots(page)) {
        try {
            await root.evaluate(() => {
                const w = window as typeof window & { __tpPickerCleanup?: () => void };
                w.__tpPickerCleanup?.();
            });
        } catch {}
    }
}

async function readPickerSelection(page: Page): Promise<UiTestComponentCandidate | null> {
    for (const root of getRoots(page)) {
        try {
            const selection = await root.evaluate(() => {
                const w = window as typeof window & { __tpPickerSelection?: Record<string, unknown> | null };
                return w.__tpPickerSelection ?? null;
            });

            if (selection) {
                return normalizeCandidate(selection);
            }
        } catch {}
    }

    return null;
}

function normalizeTests(tests: UiTest[]): UiTest[] {
    return tests.map((test) => ({
        ...test,
        components: Array.isArray(test.components) ? test.components : [],
    }));
}

function normalizeCandidate(value: Record<string, unknown>): UiTestComponentCandidate {
    return {
        selector: typeof value.selector === 'string' ? value.selector : '',
        label: typeof value.label === 'string' ? value.label : '',
        tagName: typeof value.tagName === 'string' ? value.tagName : '',
        inputType: typeof value.inputType === 'string' ? value.inputType : undefined,
        required: typeof value.required === 'boolean' ? value.required : undefined,
        placeholder: typeof value.placeholder === 'string' ? value.placeholder : undefined,
    };
}

async function readFieldValue(locator: any): Promise<string> {
    return await locator.evaluate((node: any) => {
        if (node == null) return '';
        if ('value' in node && typeof node.value !== 'undefined') return String(node.value ?? '');
        return String(node.textContent ?? '').trim();
    });
}

async function blurField(locator: any): Promise<void> {
    await locator.evaluate((node: any) => {
        if (node && typeof node.blur === 'function') node.blur();
    });
}

async function resolveLocator(page: Page, selector: string): Promise<Locator | null> {
    for (const root of getRoots(page)) {
        try {
            const locator = root.locator(selector).first();
            if (await locator.count()) {
                return locator;
            }
        } catch {}
    }

    return null;
}

async function runComponentChecks(page: Page, component: UiTestComponent): Promise<UiTestComponentResult> {
    const locator = await resolveLocator(page, component.selector);
    const checks: UiTestRuleResult[] = [];

    if (!locator) {
        return {
            componentId: component.id,
            name: component.name,
            selector: component.selector,
            ok: false,
            checks: component.rules.map((rule) => ({
                rule,
                ok: false,
                message: 'No se encontro el componente en la pagina ni en sus iframes.',
            })),
        };
    }

    try {
        await locator.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
        return {
            componentId: component.id,
            name: component.name,
            selector: component.selector,
            ok: false,
            checks: component.rules.map((rule) => ({
                rule,
                ok: false,
                message: 'No se encontro el componente visible en la pagina ni en sus iframes.',
            })),
        };
    }

    // Hacer foco en el componente y capturar screenshot en ese momento
    let screenshot: string | undefined;
    try {
        await locator.click();
        screenshot = (await locator.screenshot()).toString('base64');
    } catch {}

    for (const rule of component.rules) {
        if (rule === 'required') {
            const required = await locator.evaluate((node: any) => Boolean(
                node?.hasAttribute?.('required')
                || node?.getAttribute?.('aria-required') === 'true'
            ));
            checks.push({
                rule,
                ok: required,
                message: required ? 'El componente expone restriccion de requerido.' : 'El componente no marca requerido en el DOM.',
            });
            continue;
        }

        const tagName = component.tagName.toLowerCase();
        if (!['input', 'textarea'].includes(tagName)) {
            checks.push({
                rule,
                ok: false,
                message: 'La validacion automatica solo aplica a inputs y textareas.',
            });
            continue;
        }

        if (rule === 'numbers-only') {
            await locator.fill('abc123');
            await blurField(locator);
            const actualValue = await readFieldValue(locator);
            checks.push({
                rule,
                ok: !/[A-Za-z]/.test(actualValue),
                message: !/[A-Za-z]/.test(actualValue)
                    ? 'El campo rechaza letras o las normaliza correctamente.'
                    : 'El campo sigue aceptando letras.',
                actualValue,
            });
            continue;
        }

        if (rule === 'non-negative') {
            await locator.fill('-5');
            await blurField(locator);
            const actualValue = await readFieldValue(locator);
            checks.push({
                rule,
                ok: !actualValue.trim().startsWith('-'),
                message: !actualValue.trim().startsWith('-')
                    ? 'El campo evita numeros negativos.'
                    : 'El campo sigue aceptando valores negativos.',
                actualValue,
            });
        }
    }

    return {
        componentId: component.id,
        name: component.name,
        selector: component.selector,
        ok: checks.every((check) => check.ok),
        checks,
        screenshot,
    };
}

export class UiTestService {
    list(mod: string, sub?: string, page?: string) {
        return normalizeTests(read(testsPath(mod, sub, page)));
    }

    async inspectComponents(url: string, adproToken?: any, sessionContext?: AdproSessionContext): Promise<UiTestComponentCandidate[]> {
        console.log('[UI Playwright] inspectComponents requested', { url, sessionUrlRaiz: sessionContext?.urlRaiz ?? '' });
        const { browser, context } = await createContext(adproToken, sessionContext, true, url);
        try {
            const page = await context.newPage();
            await openTargetPage(page, url, sessionContext);
            const unique = new Set<string>();
            const components: UiTestComponentCandidate[] = [];

            // Para rutas React (dentro de un iframe en Marco), solo inspeccionar el iframe
            // Para rutas directas, inspeccionar todos los frames
            const framesToInspect = isReactAppRoute(url)
                ? page.frames().filter((f) => f !== page.mainFrame() && !/^(about:blank)?$/.test(f.url()))
                : getRoots(page);
            const effectiveFrames = framesToInspect.length > 0 ? framesToInspect : [page.mainFrame()];

            for (const root of effectiveFrames) {
                for (const component of await collectComponents(root)) {
                    if (!component.selector || unique.has(component.selector)) continue;
                    unique.add(component.selector);
                    components.push(component);
                }
            }

            return components;
        } finally {
            await browser.close();
        }
    }

    async startComponentPicker(url: string, adproToken?: any, sessionContext?: AdproSessionContext): Promise<{ sessionId: string }> {
        console.log('[UI Playwright] startComponentPicker requested', { url, sessionUrlRaiz: sessionContext?.urlRaiz ?? '' });
        const { browser, context } = await createContext(adproToken, sessionContext, false, url);
        const page = await context.newPage();
        const sessionId = randomUUID();

        const session: ComponentPickerSession = { id: sessionId, browser, context, page };
        pickerSessions.set(sessionId, session);

        // Fallback: si la SPA abre una nueva tab (window.open / target="_blank"),
        // instalar el picker ahí también. Handlers antes del primer await para no perder el load.
        context.on('page', async (newPage) => {
            session.page = newPage;
            newPage.on('load', async () => { try { await installPickerEverywhere(newPage); } catch {} });
            newPage.on('framenavigated', async () => { try { await installPickerEverywhere(newPage); } catch {} });
            await newPage.waitForLoadState('domcontentloaded').catch(() => undefined);
            try { await installPickerEverywhere(newPage); } catch {}
        });

        await context.exposeFunction('__tpSubmitSelection', (raw: Record<string, unknown>) => {
            session.lastSelection = normalizeCandidate(raw);
            console.log('[UI Playwright] Component selection captured via exposeFunction', { selector: session.lastSelection.selector });
        });

        page.on('load', async () => {
            try {
                await installPickerEverywhere(page);
            } catch {}
        });

        page.on('framenavigated', async () => {
            try {
                await installPickerEverywhere(page);
            } catch {}
        });

        await openTargetPage(page, url, sessionContext);
        await installPickerEverywhere(page);

        return { sessionId };
    }

    async getComponentPickerStatus(sessionId: string): Promise<{ status: 'pending' | 'selected' | 'closed'; component?: UiTestComponentCandidate }> {
        const session = pickerSessions.get(sessionId);
        if (!session) {
            return { status: 'closed' };
        }

        if (session.page.isClosed()) {
            const lastSelection = session.lastSelection;
            pickerSessions.delete(sessionId);
            try { await session.browser.close(); } catch {}
            if (lastSelection) {
                console.log('[UI Playwright] Page closed after selection — returning captured component', { selector: lastSelection.selector });
                return { status: 'selected', component: lastSelection };
            }
            return { status: 'closed' };
        }

        const selection = await readPickerSelection(session.page);

        if (!selection) {
            return { status: 'pending' };
        }

        try { await cleanupPickerEverywhere(session.page); } catch {}
        try { await session.browser.close(); } catch {}
        pickerSessions.delete(sessionId);

        return {
            status: 'selected',
            component: selection,
        };
    }

    async cancelComponentPicker(sessionId: string): Promise<void> {
        const session = pickerSessions.get(sessionId);
        if (!session) return;
        pickerSessions.delete(sessionId);
        await session.browser.close();
    }

    create(mod: string, data: Pick<UiTest, 'name' | 'url'> & Partial<Pick<UiTest, 'components'>>, sub?: string, page?: string): UiTest {
        const file = testsPath(mod, sub, page);
        const tests = normalizeTests(read(file));
        const t: UiTest = {
            name: data.name,
            url: data.url,
            id: randomUUID(),
            createdAt: new Date().toISOString(),
            components: Array.isArray(data.components) ? data.components : [],
        };
        tests.push(t);
        write(file, tests);
        return t;
    }

    delete(mod: string, id: string, sub?: string, page?: string) {
        const file = testsPath(mod, sub, page);
        write(file, read(file).filter(t => t.id !== id));
    }

    async run(mod: string, id: string, sub?: string, page?: string, adproToken?: any, overrideUrl?: string, sessionContext?: AdproSessionContext): Promise<UiTestResult> {
        const file = testsPath(mod, sub, page);
        const tests = normalizeTests(read(file));
        const test = tests.find(t => t.id === id);
        if (!test) throw new Error(`Test ${id} no encontrado`);

        const start = Date.now();
        let result: UiTestResult;

        try {
            const targetUrl = overrideUrl?.trim() || test.url;
            console.log('[UI Playwright] run requested', {
                mod,
                id,
                sub,
                page,
                overrideUrl: overrideUrl ?? '',
                sessionUrlRaiz: sessionContext?.urlRaiz ?? '',
            });
            const { browser, context } = await createContext(adproToken, sessionContext, false, targetUrl);
            const pg = await context.newPage();
            let title = '';
            let error: string | undefined;
            let componentResults: UiTestComponentResult[] = [];

            try {
                await openTargetPage(pg, targetUrl, sessionContext);
                title = await pg.title();
                componentResults = [];
                for (const component of test.components ?? []) {
                    componentResults.push(await runComponentChecks(pg, component));
                }
            } catch (e: any) {
                error = e.message;
                try { title = await pg.title(); } catch {}
            }

            // Screenshot de contexto: primer componente con captura, o pantalla completa como fallback
            const firstComponentScreenshot = componentResults.find((r) => r.screenshot)?.screenshot;
            const buf = firstComponentScreenshot
                ? Buffer.from(firstComponentScreenshot, 'base64')
                : await pg.screenshot({ fullPage: false }).catch(() => Buffer.from(''));
            await browser.close();

            result = {
                screenshot: buf.toString('base64'),
                title,
                loadTime: Date.now() - start,
                ok: !error && componentResults.every((item) => item.ok),
                error,
                runAt: new Date().toISOString(),
                componentResults,
            };
        } catch (e: any) {
            result = {
                screenshot: '',
                title: '',
                loadTime: Date.now() - start,
                ok: false,
                error: e.message,
                runAt: new Date().toISOString(),
            };
        }

        test.lastResult = result;
        write(file, tests);
        return result;
    }
}
