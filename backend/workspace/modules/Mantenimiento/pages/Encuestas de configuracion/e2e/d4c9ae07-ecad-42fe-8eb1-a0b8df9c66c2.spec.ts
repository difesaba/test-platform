import { test, expect } from 'playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://desarrollo.sincoerp.com/SincoOk/v3/Marco/Login_iv.aspx');
  await page.getByRole('textbox', { name: 'Usuario' }).fill('admin');
  await page.getByRole('textbox', { name: 'Contraseña' }).fill('Admin123');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByTitle('Administración de proyectos').locator('#textomodulo').click();
  await page.getByRole('button', { name: 'Mantenimiento' }).click();
  await page.getByRole('button', { name: 'CONFIGURACION' }).click();
  await page.getByRole('button', { name: 'Encuestas de configuración' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('tab', { name: 'Contratos' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('tab', { name: 'Contabilidad' }).click();
});