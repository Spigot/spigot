import { expect, test } from '@playwright/test';
import { composer, latestResponse, launchApp, sendPrompt } from './helpers';

test.describe('chat', () => {
  test('streams the fixture response and clears the terminal UI', async () => {
    const { app, window } = await launchApp();
    try {
      await sendPrompt(window, 'Exercise the typed stream fixture');
      await expect(latestResponse(window)).toHaveText('Typed stream fixture response.');
      await expect(window.getByText('Analizando contexto y generando...')).toHaveCount(0);
      await expect(window.getByTitle('Detener generación')).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('queues a follow-up while generating and sends it when the turn finishes', async () => {
    const { app, window } = await launchApp();
    try {
      await sendPrompt(window, 'slow fixture please');

      // Wait for the LIVE streaming text (the fixture streams it before its pause).
      await window.getByText(/Turno lento en curso/).first().waitFor({ timeout: 15000 });
      await expect(window.getByTitle('Detener generación')).toBeVisible();

      // The composer stays usable while generating: Enter queues the message.
      const queue = window.locator('[aria-label="Mensajes en cola"]');
      await composer(window).fill('segundo mensaje');
      await composer(window).press('Enter');
      await expect(queue).toBeVisible();
      await expect(queue).toContainText('segundo mensaje');

      // The queued message is dequeued automatically and answered.
      await expect(window.getByText('Turno lento en curso... Listo.').first()).toBeVisible({ timeout: 20000 });
      await expect(latestResponse(window)).toHaveText('Typed stream fixture response.');
      await expect(queue).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('a queued message can be removed before it is sent', async () => {
    const { app, window } = await launchApp();
    try {
      await sendPrompt(window, 'slow fixture please');
      await window.getByText(/Turno lento en curso/).first().waitFor({ timeout: 15000 });

      const marker = `mensaje descartable ${Date.now()}`;
      const queue = window.locator('[aria-label="Mensajes en cola"]');
      await composer(window).fill(marker);
      await composer(window).press('Enter');
      await expect(queue).toContainText(marker);

      await queue.getByTitle('Quitar de la cola').click();
      await expect(queue).toHaveCount(0);

      // The discarded prompt is never sent to the model: no user bubble with
      // that text may exist after the first turn finishes.
      await expect(window.getByText('Turno lento en curso... Listo.').first()).toBeVisible({ timeout: 20000 });
      await expect(window.getByText(marker)).toHaveCount(0);
      await expect(composer(window)).toHaveValue('');
    } finally {
      await app.close();
    }
  });
});
