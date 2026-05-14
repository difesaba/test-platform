import { test, expect } from 'playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://desarrollo.sincoerp.com/SincoOk/V3/Marco/Login_iv.aspx');
  await page.getByRole('textbox', { name: 'Usuario' }).fill('admin');
  await page.getByRole('textbox', { name: 'Contraseña' }).fill('Admin123');
  await page.getByRole('textbox', { name: 'Contraseña' }).press('Enter');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByTitle('Administración de proyectos').locator('#textomodulo').click();
  await page.getByRole('button', { name: 'Presupuestos' }).click();
  await page.getByRole('button', { name: 'Maestro de insumos', exact: true }).click();
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Consultar' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Nuevo insumo' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('combobox', { name: 'Unidad de medida' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('option', { name: '% - Porcentaje' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Cerrar' }).click();
});