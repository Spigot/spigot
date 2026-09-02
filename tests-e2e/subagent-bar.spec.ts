import { expect, test } from '@playwright/test';
import { latestResponse, launchApp, sendPrompt } from './helpers';

test.describe('subagents', () => {
  test('shows the live subagent bar below the chat header while a subagent works', async () => {
    const { app, window } = await launchApp();
    try {
      await sendPrompt(window, 'delegate to a subagent please');

      const bar = window.getByTestId('subagent-status-bar');
      await expect(bar).toBeVisible({ timeout: 10000 });
      await expect(bar).toContainText('Subagente:');
      await expect(bar).toContainText('SDD: Aplicación');
      await expect(bar).toContainText('sdd-apply');
      await expect(bar).toContainText('e2e-typed-model');
      await expect(bar).toContainText('Implement the requested feature');
      await expect(bar).toContainText('Trabajando');
      await expect(bar).toContainText(/\d+s/); // elapsed timer

      // The bar hides when the subagent finishes and the result is rendered.
      await expect(bar).toHaveCount(0, { timeout: 15000 });
      await expect(latestResponse(window)).toContainText('El subagente SDD Aplicación completó la tarea.');
    } finally {
      await app.close();
    }
  });
});
