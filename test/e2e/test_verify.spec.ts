import { test, expect } from '@playwright/test';

test('capture 3D kanban screenshot', async ({ page }) => {
  await page.goto('http://localhost:5174');

  // Wait for initial render
  await page.waitForTimeout(2000);

  // Create an agent to show the skin
  await page.click('#createAgentBtn');
  await page.fill('#agentRole', 'Novas Funcionalidades');
  await page.selectOption('#agentCategory', 'feature');
  await page.waitForTimeout(500);
  await page.selectOption('#agentTool', 'mock');
  await page.waitForTimeout(500);
  await page.selectOption('#agentModel', 'mock-model');
  await page.click('#agentSubmitBtn');

  // Wait for 3D scene to render the new agent
  await page.waitForTimeout(5000);

  // Take screenshot
  await page.screenshot({ path: '/home/jules/verification/verification.png', fullPage: true });
});
