import { test, expect } from 'playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://kilauea-v03.sincoerp.com/SincoConaltura/V3/Marco/Default_iv.aspx');
  await page.locator('#pagina1').contentFrame().getByRole('textbox', { name: 'Buscar Addon' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('textbox', { name: 'Buscar Addon' }).fill('144');
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Activar', exact: true }).click();
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Seleccionar todas las empresas' }).getByRole('checkbox').check();
  await page.locator('#pagina1').contentFrame().getByRole('textbox', { name: 'Observaciones' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('textbox', { name: 'Observaciones' }).fill('1234');
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Instalar' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Cerrar' }).click();
});