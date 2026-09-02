import { expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { connectProvider, launchApp, sendPrompt } from './helpers';

test('creates hello WordPress through review, writes on accept, and edits in the editor', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'spigot-e2e-wp-'));
  const { app, window } = await launchApp({ SPIGOT_E2E_WORKSPACE: workspace });
  try {
    // A connected provider enables the composer (fixture model catalog).
    await connectProvider(window, 'OpenAI');

    // The agent stages a WordPress skeleton through the ChangeSet.
    await sendPrompt(window, 'create hello wordpress site');
    await expect(window.getByTestId('changeset-diff-preview')).toBeVisible({ timeout: 20000 });
    await expect(window.getByText('2 staged files')).toBeVisible();

    // Accepting writes the files to disk and opens them in the editor.
    await window.getByRole('button', { name: 'Accept all' }).click();
    await expect
      .poll(() => existsSync(join(workspace, 'index.php')) && existsSync(join(workspace, 'style.css')), {
        timeout: 15000,
      })
      .toBe(true);
    expect(readFileSync(join(workspace, 'index.php'), 'utf8')).toContain('Hello WordPress');

    // An editor tab opens for the accepted file.
    const editor = window.locator('.monaco-editor').first();
    await expect(editor).toBeVisible({ timeout: 20000 });
    await expect(editor).toContainText('Hello WordPress');

    // Edit the active file in Monaco and save with Ctrl+S.
    await editor.click();
    await window.keyboard.press('Control+a');
    await window.keyboard.type('HOLA WORDPRESS EDITADO POR E2E');
    await window.keyboard.press('Control+s');

    await expect
      .poll(() => {
        for (const file of ['index.php', 'style.css']) {
          const path = join(workspace, file);
          if (existsSync(path) && readFileSync(path, 'utf8').includes('HOLA WORDPRESS EDITADO POR E2E')) {
            return true;
          }
        }
        return false;
      }, { timeout: 15000 })
      .toBe(true);
  } finally {
    await app.close();
  }
});
