import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('about:blank');
  await page.locator('body').click();
  await page.locator('body').click();
  await page.locator('body').click();
  await page.locator('body').click();
});