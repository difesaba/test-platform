import { test, expect } from 'playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www4.sincoerp.com/SincoComercial_Nueva/V3/Marco/Default_iv.aspx');
  await page.locator('iframe[name="pagina1"]').contentFrame().getByRole('button', { name: 'Consultar' }).click();
});