import { test, expect } from '@playwright/test';

test('capture 3D kanban screenshot', async ({ page }) => {
  await page.goto('http://localhost:5174');

  // Wait for 3D scene to render
  await page.waitForTimeout(5000);

  // Take screenshot
  await page.screenshot({ path: 'frontend_verification.png', fullPage: true });
});
