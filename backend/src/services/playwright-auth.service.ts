import { chromium } from 'playwright';

function toSeleccionUrl(loginUrl: string): string {
    return loginUrl.replace(/Login\.aspx$/i, 'Seleccion_iv.aspx');
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
