import { test, expect } from 'playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www4.sincoerp.com/SincoComercial_Nueva/v3/Marco/Default_iv.aspx');
  
  const fecha = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const datosPrueba = {
    descripcion: `Prueba QA ${fecha}`,
  };

  const frame = page.locator('iframe[name="pagina1"]').contentFrame();
  
  await frame.locator('#mat-input-0').click();
  await frame.locator('#mat-input-0').fill(datosPrueba.descripcion);
  await frame.getByRole('button', { name: 'Guardar' }).click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await frame.locator('[class*="success"], [class*="toast"], .alert-success').first().waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  
  await frame.getByLabel('').uncheck();
  await frame.getByLabel('').check();
  await frame.locator('button[name="btnEliminarMedio"]').click();
  await frame.getByRole('button', { name: 'Guardar' }).click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await frame.locator('[class*="success"], [class*="toast"], .alert-success').first().waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
});