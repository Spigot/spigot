import { expect, test, _electron as electron } from '@playwright/test';
import { join } from 'path';

test('renders a typed stream through Electron IPC and clears its terminal UI', async () => {
  const electronApp = await electron.launch({
    args: [join(__dirname, '../dist-electron/main/index.js')],
    env: { ...process.env, SPIGOT_E2E_TYPED_STREAM: '1' },
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    const composer = window.locator('textarea[placeholder="Describe lo que quieres crear"]');
    await expect(composer).toBeVisible();
    await composer.fill('Exercise the typed stream fixture');
    await composer.press('Enter');

    const assistantResponse = window.getByTestId('ai-panel-latest-assistant-response').last();
    await expect(assistantResponse).toHaveText('Typed stream fixture response.');
    await expect(window.getByText('Analizando contexto y generando...')).toHaveCount(0);
    await expect(window.getByTitle('Detener generación')).toHaveCount(0);
    await expect(window.getByText('0', { exact: true })).toHaveCount(0);
  } finally {
    await electronApp.close();
  }
});
