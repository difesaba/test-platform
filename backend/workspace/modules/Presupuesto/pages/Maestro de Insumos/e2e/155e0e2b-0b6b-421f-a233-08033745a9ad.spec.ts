import { test, expect } from 'playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www4.sincoerp.com/SincoComercial_Nueva/v3/Marco/Login_iv.aspx');
  await page.getByRole('textbox', { name: 'Usuario' }).fill('desarrolladorcbr');
  await page.getByRole('textbox', { name: 'Contraseña' }).fill('Desarrolladorcbr2019');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByTitle('Administración de proyectos').locator('#recttextomodulo').click();
  await page.getByRole('button', { name: 'Presupuestos' }).click();
  await page.getByRole('button', { name: 'Maestro de insumos' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Consultar' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Nuevo insumo' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Cerrar' }).click();
});