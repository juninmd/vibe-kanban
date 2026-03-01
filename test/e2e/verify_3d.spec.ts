import { test, expect } from '@playwright/test';

test('create agent and verify 3d label', async ({ page }) => {
  test.setTimeout(60000);
  // Go to app
  await page.goto('/');

  // Wait for load
  const title = page.locator('h1');
  await expect(title).toHaveText('Vibe Kanban • Time de Agentes', { timeout: 10000 });

  // Click Novo Agente
  await page.click('#createAgentBtn');

  // Wait for modal
  const modal = page.locator('#agentModal');
  await expect(modal).toBeVisible();

  // Fill Name
  await page.fill('#agentRole', 'Test Agent');

  // Select Category
  await page.selectOption('#agentCategory', 'misc');

  // Wait for tools to load
  const toolSelect = page.locator('#agentTool');
  await expect(toolSelect).not.toHaveText(/Carregando/, { timeout: 10000 });

  // Log options
  const options = await toolSelect.locator('option').all();
  const optionTexts = await Promise.all(options.map(o => o.innerText()));
  const optionValues = await Promise.all(options.map(o => o.getAttribute('value')));
  console.log('Tool Options:', optionTexts, optionValues);

  // Select a valid tool. Prefer 'mock' or any that is not empty.
  let toolToSelect = '';
  for (let i = 0; i < optionValues.length; i++) {
      if (optionValues[i] && optionValues[i] !== '') {
          toolToSelect = optionValues[i];
          break;
      }
  }

  if (!toolToSelect) {
      throw new Error('No valid tool found to select');
  }

  console.log('Selecting tool:', toolToSelect);
  await toolSelect.selectOption(toolToSelect);
  // Force dispatch change event if needed, but selectOption should handle it.
  // Sometimes needed if the event listener is attached in a specific way.
  await toolSelect.dispatchEvent('change');

  // Wait for models to load
  const modelSelect = page.locator('#agentModel');
  // It should change to "Carregando modelos..." then to actual models.
  // Wait until it is NOT "Selecione a ferramenta primeiro"
  await expect(modelSelect).not.toHaveText('Selecione a ferramenta primeiro', { timeout: 10000 });
  await expect(modelSelect).not.toHaveText('Carregando modelos...', { timeout: 10000 });

  const modelOptions = await modelSelect.locator('option').all();
  console.log('Model Options count:', modelOptions.length);

   if (modelOptions.length > 0) {
     const value = await modelOptions[0].getAttribute('value'); // Pick first one
     if (value) {
        await modelSelect.selectOption(value);
     }
  }

  // Submit
  await page.click('#agentForm button[type="submit"]');

  // Wait for modal close
  await expect(modal).toBeHidden();

  // Wait for agent in list
  const agentList = page.locator('#agentsList');
  await expect(agentList).toContainText('Test Agent');

  // Wait for 3D view to update
  await page.waitForTimeout(3000);

  // Take screenshot
  const view3d = page.locator('#view3d');
  await view3d.screenshot({ path: 'screenshot_3d_agent.png' });
});
