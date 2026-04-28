import { test, expect } from '@playwright/test';

test('take screenshot of 3d board', async ({ page }) => {
  await page.goto('http://localhost:5174');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'current_board.png' });
});
