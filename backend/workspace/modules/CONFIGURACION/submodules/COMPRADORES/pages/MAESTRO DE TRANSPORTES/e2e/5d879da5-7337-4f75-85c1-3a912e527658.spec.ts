import { test, expect } from 'playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www4.sincoerp.com/SincoComercial_Nueva/v3/Marco/Default_iv.aspx');
  await page.locator('iframe[name="pagina1"]').contentFrame().locator('#mat-input-0').click();
  await page.locator('iframe[name="pagina1"]').contentFrame().locator('#mat-input-0').fill('CARRO');
  await page.locator('iframe[name="pagina1"]').contentFrame().getByRole('button', { name: 'Guardar' }).click();
  await page.locator('iframe[name="pagina1"]').contentFrame().locator('#mat-input-0').click();
  await page.locator('iframe[name="pagina1"]').contentFrame().locator('#mat-input-0').fill('MOTO');
  await page.locator('iframe[name="pagina1"]').contentFrame().getByRole('button', { name: 'Guardar' }).click();
  await page.locator('iframe[name="pagina1"]').contentFrame().getByRole('row', { name: 'CARRO' }).getByLabel('').uncheck();
  await page.locator('iframe[name="pagina1"]').contentFrame().getByRole('row', { name: 'CARRO' }).getByLabel('').check();
  await page.locator('iframe[name="pagina1"]').contentFrame().getByRole('row', { name: 'CARRO' }).getByRole('button').click();
  await page.locator('iframe[name="pagina1"]').contentFrame().locator('[id="5"]').click();
  await page.locator('iframe[name="pagina1"]').contentFrame().locator('[id="5"]').fill('MOTO 2');
  await page.locator('iframe[name="pagina1"]').contentFrame().getByRole('button', { name: 'Guardar' }).click();
  await page.locator('iframe[name="pagina1"]').contentFrame().locator('button[name="btnEliminarMedio"]').click();
});