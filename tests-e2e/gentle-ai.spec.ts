import { expect, test } from '@playwright/test';
import { launchApp } from './helpers';

test.describe('gentle ai', () => {
  test('the chat offers the four agent modes', async () => {
    const { app, window } = await launchApp();
    try {
      await window.locator('button[aria-label="Select chat agent"]').click();
      const listbox = window.getByRole('listbox', { name: 'Select chat agent' });
      await expect(listbox).toBeVisible();
      for (const mode of ['Orchestrator', 'Build', 'Plan', 'Review']) {
        await expect(listbox.getByRole('option', { name: mode, exact: true })).toBeVisible();
      }
      await window.keyboard.press('Escape');
    } finally {
      await app.close();
    }
  });

  test('the orchestrator settings expose the Gentle AI role groups', async () => {
    const { app, window } = await launchApp();
    try {
      await window.locator('button[title="Configuración (Ctrl+,)"]').first().click();

      // Pick the orchestrator category from the sidebar of the settings modal.
      await window
        .getByRole('button')
        .filter({ hasText: /^Orchestrator$/ })
        .last()
        .click();
      await expect(window.getByText('Orquestador de Gentle AI').first()).toBeVisible({ timeout: 10000 });

      // Expand the Judgment Day group and check a role row is rendered.
      await window.getByText(/Roles de Judgment Day/).click();
      await expect(window.getByText('Judgment Day: Juez A').first()).toBeVisible();
      await window.getByText(/Roles de SDD/).click();
      await expect(window.getByText('SDD: Aplicación').first()).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
