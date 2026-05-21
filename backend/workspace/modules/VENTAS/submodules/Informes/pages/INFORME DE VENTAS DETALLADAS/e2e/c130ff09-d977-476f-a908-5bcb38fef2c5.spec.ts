import { test, expect } from 'playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www4.sincoerp.com/SincoComercial_Nueva/v3/Marco/Login_iv.aspx');
  await page.getByRole('textbox', { name: 'Usuario' }).fill('desarrolladorcbr');
  await page.getByRole('textbox', { name: 'Contraseña' }).fill('Desarrolladorcbr2019');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByText('ADPRO').click();
  await page.getByTitle('Comercialización de bienes ra').locator('#recttextomodulo').click();
  await page.locator('#verifica-CBR').click();
  await page.getByTitle('Ruta: CBR/Ventas').click();
  await page.getByTitle('Ruta: CBR/Ventas/INFORMES').click();
  await page.getByTitle('Ruta: CBR/Ventas/INFORMES/UNIDADES').click();
  await page.getByTitle('Ruta: CBR/Ventas/INFORMES/UNIDADES/Informe escrito de unidades').click();
  await page.locator('#pagina1').contentFrame().getByText('INFORME ESCRITO DE UNIDADES Servidor Servidor Seleccionar × Consulta sin').click();
  await page.locator('#pagina1').contentFrame().locator('#btnArreglo2').click();
  await page.locator('#pagina1').contentFrame().locator('#fgFiltros_grvArreglo_ctl02_cbRegistro2').check();
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Guardar' }).click();
  await page.locator('#pagina1').contentFrame().locator('.sinBorde > tbody > tr:nth-child(4) > td:nth-child(2)').click();
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Consultar' }).click();
  await page.locator('#pagina1').contentFrame().locator('#btnArreglo2').click();
  page.once('dialog', dialog => {
    console.log(`Dialog message: ${dialog.message()}`);
    dialog.dismiss().catch(() => {});
  });
  await page.locator('#pagina1').contentFrame().locator('#fgFiltros_grvArreglo_ctl07_cbRegistro2').check();
  await page.locator('#pagina1').contentFrame().locator('#fgFiltros_grvArreglo_ctl02_cbRegistro2').uncheck();
  await page.locator('#pagina1').contentFrame().locator('#fgFiltros_grvArreglo_ctl03_cbRegistro2').check();
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Guardar' }).click();
  await page.locator('#pagina1').contentFrame().getByRole('button', { name: 'Consultar' }).click();
});