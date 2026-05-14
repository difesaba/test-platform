import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://www.google.com/?zx=1778698184322');
  await page.locator('#LS8OJ').click();
  await page.locator('div').filter({ hasText: 'Subir imagenSubir archivo' }).nth(2).click();
});