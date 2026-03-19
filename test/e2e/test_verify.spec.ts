import { test, expect } from '@playwright/test';

test('capture 3D kanban screenshot', async ({ page }) => {
  await page.goto('/');

  // Wait for initial render
  await page.waitForTimeout(2000);

  // Create an agent to show the skin
  await page.click('#createAgentBtn');
  await page.fill('#agentRole', 'Novas Funcionalidades');
  await page.selectOption('#agentCategory', 'feature');
  await page.waitForTimeout(500);
  await page.selectOption('#agentTool', { label: 'Mock Tool' });
  await page.locator('#agentTool').dispatchEvent('change');
  // It should change to "Carregando modelos..." then to actual models.
  // Wait until it is NOT "Selecione a ferramenta primeiro"
  await expect(page.locator('#agentModel')).not.toHaveText('Selecione a ferramenta primeiro', { timeout: 10000 });
  await expect(page.locator('#agentModel')).not.toHaveText('Carregando modelos...', { timeout: 10000 });
  await page.selectOption('#agentModel', { index: 0 });
  await page.click('#agentSubmitBtn');

  // Wait for 3D scene to render the new agent
  await page.waitForTimeout(5000);

  // Take screenshot
  await page.screenshot({ path: '/home/jules/verification/verification.png', fullPage: true });
});
