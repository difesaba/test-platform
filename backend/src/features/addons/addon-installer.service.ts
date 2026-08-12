import path from 'path';
import fs from 'fs';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { AdproAuthService } from '../auth/adpro-auth.service';
import { envs } from '../../shared/config/envs';

const SPEC_FILE = path.join(process.cwd(), envs.WORKSPACE_PATH, 'addon-installer.spec.ts');
const authSvc   = new AdproAuthService();

// ── Auth ADPRO para inyección de token (igual que E2E service) ────────────────

async function getAdproToken(urlRaiz: string): Promise<any | null> {
    // Try both API base patterns: cloud (/API/...) and local-legacy (/ADPRO/API/...)
    const candidates = [urlRaiz, `${urlRaiz}/ADPRO`];
    for (const base of candidates) {
        try {
            console.log(`[AddonInstaller] Intentando auth en ${base}/API/Auth/Usuario`);
            const empresas = await authSvc.getEmpresas(base);
            if (!empresas?.length) continue;
            const empresa   = empresas[0];
            const empresaId = empresa.Id ?? empresa.IdEmpresa;
            if (!empresaId) continue;
            const sucursales = await authSvc.getSucursales(base, 1, empresaId);
            if (!sucursales?.length) continue;
            return authSvc.login(base, 1, empresaId, sucursales[0].Id);
        } catch (e: any) {
            console.log(`[AddonInstaller] Auth en ${base} falló: ${e.message}`);
        }
    }
    return null;
}

// ── Inyección de token (mismo patrón que e2e.service.ts líneas 988-1062) ─────

async function injectToken(context: BrowserContext, token: any, urlRaiz: string): Promise<void> {
    const at  = token.access_token ?? '';
    const au  = (token as any).authorization_token ?? at;
    const bt  = `${token.token_type ?? 'Bearer'} ${at}`;
    const ser = JSON.stringify(token);

    await context.addInitScript(({ at: a, au: b, bt: c, ser: s, ur }: any) => {
        const w = (k: string, v: string) => {
            try { localStorage.setItem(k, v); } catch {}
            try { sessionStorage.setItem(k, v); } catch {}
        };
        w('access_token', a); w('accessToken', a);
        w('authorization_token', b);
        w('adpro_token', s); w('adproToken', s);
        w('token', JSON.stringify({ state: { finalToken: a, authorizationToken: b }, version: 0 }));
        if (ur) w('urlRaiz', ur);
        try { (window as any).getToken    = () => a; } catch {}
        try { (window as any).getTokenAuth = () => b; } catch {}
        try {
            if (!(window as any).opener && window === (window as any).parent) {
                Object.defineProperty(window, 'opener', {
                    value: { parent: { getToken: () => a, getTokenAuth: () => b } },
                    writable: true, configurable: true,
                });
            }
        } catch {}
    }, { at, au, bt, ser, ur: urlRaiz });

    await context.route('**/*', async (route) => {
        const headers = { ...route.request().headers() };
        if (!headers['authorization']?.toLowerCase().startsWith('bearer ')) headers['authorization'] = bt;
        if (!headers['x-sincoerp-authorization'] && au) headers['x-sincoerp-authorization'] = au;
        await route.continue({ headers });
    });
}

// ── Navegar al frame pagina1 ──────────────────────────────────────────────────

async function navigateToAddons(context: BrowserContext, urlRaiz: string): Promise<void> {
    const addonsUrl = `${urlRaiz}/ADPRO/Views/reactapp/#/mantenimiento/addons`;
    const pages     = context.pages();
    const page      = pages[pages.length - 1];

    // Esperar el frame pagina1 (Marco de ADPRO) y navegar el iframe a addons
    await page.waitForTimeout(2000);
    let pagina1 = page.frame({ name: 'pagina1' });
    if (!pagina1) { await page.waitForTimeout(3000); pagina1 = page.frame({ name: 'pagina1' }); }

    if (pagina1) {
        console.log('[AddonInstaller] Navegando pagina1 a addons');
        await pagina1.goto(addonsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(4000);
    } else {
        console.log('[AddonInstaller] pagina1 no encontrado. Frames:', page.frames().map(f => `"${f.name()}" ${f.url()}`));
    }
}

// ── API pública ───────────────────────────────────────────────────────────────

export function hasRecording(): boolean {
    return fs.existsSync(SPEC_FILE);
}

/**
 * Abre un browser con el recorder activo.
 * Si se puede obtener token ADPRO → navega directo al Marco con token inyectado.
 * Si no → muestra Login_iv.aspx para que el usuario haga login manual y grabe el flujo.
 */
export async function recordFlow(loginUrl: string, urlRaiz: string): Promise<void> {
    console.log('[AddonInstaller] Iniciando grabación para:', urlRaiz);
    fs.mkdirSync(path.dirname(SPEC_FILE), { recursive: true });

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });

    await (context as any)._enableRecorder({
        language: 'playwright-test',
        mode: 'recording',
        outputFile: path.resolve(SPEC_FILE),
        handleSIGINT: false,
    });

    const page = await context.newPage();

    // Intentar auth ADPRO para navegar directo (sin pasar por Login/Seleccion)
    console.log('[AddonInstaller] Obteniendo token ADPRO para', urlRaiz);
    const token = await getAdproToken(urlRaiz);

    if (token) {
        console.log('[AddonInstaller] Token obtenido — inyectando y navegando al Marco');
        await injectToken(context, token, urlRaiz);
        // Para React SPA routes: ir directamente al Marco real (via Login_iv, que redirige al Marco)
        await page.goto(`${urlRaiz}/Marco/Login_iv.aspx`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await page.waitForLoadState('networkidle').catch(() => {});
        console.log('[AddonInstaller] URL post-token:', page.url());
        await navigateToAddons(context, urlRaiz);
    } else {
        // Sin token → mostrar login para grabación manual
        console.log('[AddonInstaller] Sin token — abriendo Login para grabación manual');
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    }

    console.log('[AddonInstaller] Browser listo. Realiza la instalación y cierra el browser.');
    await new Promise<void>(resolve => { browser.on('disconnected', () => resolve()); });
    console.log('[AddonInstaller] Grabación finalizada →', SPEC_FILE);
}

/**
 * Instala un addon en modo headless usando token ADPRO inyectado.
 */
export async function installAddon(
    loginUrl: string,
    urlRaiz: string,
    addonNumber: number,
): Promise<{ ok: boolean; message: string }> {
    if (!hasRecording()) {
        return { ok: false, message: 'No hay flujo grabado. Usa "Grabar flujo" primero.' };
    }

    console.log(`[AddonInstaller] Instalando addon #${addonNumber} en ${urlRaiz}`);

    const token = await getAdproToken(urlRaiz);
    if (!token) {
        return { ok: false, message: `No se pudo autenticar en ${urlRaiz} con las credenciales ADPRO del .env.` };
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page    = await context.newPage();

    try {
        await injectToken(context, token, urlRaiz);
        await page.goto(`${urlRaiz}/Marco/Login_iv.aspx`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await page.waitForLoadState('networkidle').catch(() => {});

        await navigateToAddons(context, urlRaiz);

        const addonsFrame = page.frame({ name: 'pagina1' });
        if (!addonsFrame) return { ok: false, message: 'Marco de ADPRO no cargado (pagina1 no encontrado).' };

        await addonsFrame.locator('body').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        const addonStr     = String(addonNumber);
        const addonLocator = addonsFrame.locator(`text="${addonStr}"`).first();
        if (!await addonLocator.count().then(n => n > 0).catch(() => false)) {
            return { ok: false, message: `Addon #${addonNumber} no encontrado en la página.` };
        }

        await addonLocator.scrollIntoViewIfNeeded().catch(() => {});
        const installBtn = addonsFrame.locator(`text="${addonStr}"`).locator('..').locator('button, [role="button"]').filter({ hasText: /instal/i }).first();
        if (!await installBtn.count().then(n => n > 0).catch(() => false)) {
            return { ok: false, message: `Addon #${addonNumber} encontrado pero sin botón Instalar visible.` };
        }

        await installBtn.click({ timeout: 5000 });
        await page.waitForTimeout(2000);
        return { ok: true, message: `Addon #${addonNumber} instalado correctamente.` };
    } catch (e: any) {
        return { ok: false, message: e.message };
    } finally {
        await browser.close();
    }
}
