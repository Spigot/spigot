import { expect, test } from '@playwright/test';
import { launchApp } from './helpers';

test.describe('themes', () => {
  test('switching the theme updates the whole UI and persists', async () => {
    const { app, window } = await launchApp();
    try {
      await window.locator('button[title="Configuración (Ctrl+,)"]').first().click();
      const themeSelect = window.locator('select');
      await expect(themeSelect.first()).toBeVisible({ timeout: 10000 });
      await themeSelect.first().selectOption({ label: 'Solarized Dark' });

      const applied = await window.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(applied).toBe('solarized-dark');

      // The choice persists in localStorage.
      const stored = await window.evaluate(() => window.localStorage.getItem('spigot-theme'));
      expect(stored).toBe('solarized-dark');

      // Switching back works too.
      await themeSelect.first().selectOption({ label: 'Spigot Dark (Por Defecto)' });
      expect(await window.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('spigot-dark');
    } finally {
      await app.close();
    }
  });
});
