import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://pruebas.sincoerp.com:7342/SincoConsAsociados_PRBINT/V3/Marco/Login_iv.aspx');
});