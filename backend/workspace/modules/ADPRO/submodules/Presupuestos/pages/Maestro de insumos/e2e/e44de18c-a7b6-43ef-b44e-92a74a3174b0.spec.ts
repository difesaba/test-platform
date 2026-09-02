import { test, expect } from 'playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://kilauea-v03.sincoerp.com/SincoByBCons/V3/Marco/Default_iv.aspx');
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Consultar' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Nuevo insumo' }).click();
});