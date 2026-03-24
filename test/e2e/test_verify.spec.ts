import { test, expect } from "@playwright/test";

test("capture 3D kanban screenshot", async ({ page }) => {
  await page.goto("/");

  // Wait for initial render
  await page.waitForTimeout(2000);

  // Create an agent to show the skin
  await page.click("#createAgentBtn");
  await page.fill("#agentRole", "Novas Funcionalidades");
  await page.selectOption("#agentCategory", "feature");
  await page.waitForTimeout(500);

  await page.locator("#agentTool").selectOption("mock");
  await page.locator("#agentTool").dispatchEvent("change");

  const modelSelect = page.locator("#agentModel");
  await expect(modelSelect).not.toHaveText("Selecione a ferramenta primeiro", {
    timeout: 10000,
  });
  await expect(modelSelect).not.toHaveText("Carregando modelos...", {
    timeout: 10000,
  });

  const modelOptions = await modelSelect.locator("option").all();
  if (modelOptions.length > 0) {
    const value = await modelOptions[0].getAttribute("value");
    if (value) {
      await modelSelect.selectOption(value);
    }
  }

  await page.click("#agentSubmitBtn");

  // Wait for 3D scene to render the new agent
  await page.waitForTimeout(5000);

  // Take screenshot
  await page.screenshot({
    path: "/home/jules/verification/verification.png",
    fullPage: true,
  });
});
