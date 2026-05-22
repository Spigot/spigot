import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'path';

test('launch app and check title', async () => {
  const electronApp = await electron.launch({
    args: [join(__dirname, '../dist-electron/main/index.js')],
  });

  const window = await electronApp.firstWindow();
  
  // Wait for the window to be ready and check for the workspace name (default 'spigot')
  const title = await window.locator('header').textContent();
  expect(title).toContain('spigot');

  await electronApp.close();
});
