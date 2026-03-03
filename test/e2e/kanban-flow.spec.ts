import { test, expect } from '@playwright/test';

test.describe('Kanban fluxo principal', () => {
  test('cria card, alterna para visão 2D e exibe no board', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Título').fill('E2E - hardening produção');
    await page.getByRole('button', { name: 'Adicionar card' }).click();
    await page.getByRole('button', { name: 'Alternar 2D / 3D' }).click();

    await expect(page.locator('#view2d')).toHaveClass(/active/);
    await expect(page.locator('#kanbanBoard')).toContainText('E2E - hardening produção');
  });

  test('dashboard reflete criação de tarefas', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Título').fill('E2E - Métricas');
    await page.getByRole('button', { name: 'Adicionar card' }).click();

    await expect(page.locator('#statPending')).not.toHaveText('0');
  });
});
