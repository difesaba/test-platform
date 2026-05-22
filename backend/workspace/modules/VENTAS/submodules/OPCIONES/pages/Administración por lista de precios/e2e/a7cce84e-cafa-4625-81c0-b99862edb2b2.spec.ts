import { test, expect } from 'playwright/test';

test('Consultar en módulo de ventas', async ({ page }) => {
  const datos = {
    urlBase: 'https://www4.sincoerp.com/SincoComercial_Nueva/V3/Marco/Default_iv.aspx',
    botonConsultar: 'Consultar'
  };

  await page.goto(datos.urlBase);
  await page.waitForLoadState('networkidle').catch(() => {});

  const iframeElement = page.locator('iframe[name="pagina1"]');
  const iframeContentFrame = iframeElement.contentFrame();
  const botonConsultar = iframeContentFrame.getByRole('button', { name: datos.botonConsultar });

  await botonConsultar.click();
  await expect(botonConsultar).toBeVisible({ timeout: 6000 });
  await page.waitForLoadState('networkidle').catch(() => {});
});