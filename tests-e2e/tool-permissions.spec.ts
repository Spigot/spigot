import { expect, test } from '@playwright/test';
import { latestResponse, launchApp, sendPrompt } from './helpers';

test.describe('in-chat tool permissions', () => {
  test('rejecting a gated tool reports the denial to the agent', async () => {
    const { app, window } = await launchApp();
    try {
      await sendPrompt(window, 'please request permission for a command');

      const card = window.getByTestId('tool-permission-card');
      await expect(card).toBeVisible({ timeout: 15000 });
      await expect(card).toContainText('Ejecutar comando en la terminal');
      await expect(card).toContainText('$ npm test');

      await card.getByRole('button', { name: 'Rechazar' }).click();
      await expect(latestResponse(window)).toContainText('Permiso: denied', { timeout: 15000 });
      await expect(card).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('allowing once executes the tool without granting future permissions', async () => {
    const { app, window } = await launchApp();
    try {
      await sendPrompt(window, 'please request permission for a command');

      const card = window.getByTestId('tool-permission-card');
      await expect(card).toBeVisible({ timeout: 15000 });
      await card.getByRole('button', { name: 'Permitir una vez' }).click();

      await expect(latestResponse(window)).toContainText('Permiso: granted', { timeout: 15000 });
      await expect(card).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('deny keeps prompting for the next call; a grant does too until remembered', async () => {
    const { app, window } = await launchApp();
    try {
      await sendPrompt(window, 'please request permission for a command');
      const card = window.getByTestId('tool-permission-card');
      await expect(card).toBeVisible({ timeout: 15000 });

      // Every button resolves; verify the full-permission button is offered too.
      await expect(card.getByRole('button', { name: 'Permitir siempre' })).toBeVisible();
      await expect(card.getByRole('button', { name: 'Permiso total' })).toBeVisible();
      await card.getByRole('button', { name: 'Permitir siempre' }).click();
      await expect(latestResponse(window)).toContainText('Permiso: granted', { timeout: 15000 });
    } finally {
      await app.close();
    }
  });
});
