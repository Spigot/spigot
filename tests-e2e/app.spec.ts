import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'path';

test('launch app and check title', async () => {
  console.log('Launching Electron app...');
  const electronApp = await electron.launch({
    args: [join(__dirname, '../dist-electron/main/index.js')],
  });

  console.log('Waiting for first window...');
  const window = await electronApp.firstWindow();
  
  console.log('Waiting for app to load...');
  await window.waitForLoadState('domcontentloaded');

  // Wait for the window to be ready and check for the workspace name (default 'spigot')
  console.log('Checking header content...');
  const title = await window.locator('header').textContent();
  console.log('Title found:', title);
  
  expect(title?.toLowerCase()).toContain('spigot');

  console.log('Closing app...');
  await electronApp.close();
});
