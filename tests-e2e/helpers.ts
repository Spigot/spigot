import { expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { join } from 'path';

export interface LaunchedApp {
  app: ElectronApplication;
  window: Page;
}

export async function launchApp(env: Record<string, string | undefined> = {}): Promise<LaunchedApp> {
  const app = await electron.launch({
    args: [join(__dirname, '../dist-electron/main/index.js')],
    env: { ...process.env, SPIGOT_E2E_TYPED_STREAM: '1', ...env },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { app, window };
}

export const composer = (window: Page) =>
  window.locator('textarea[placeholder="Describe lo que quieres crear"]');

export async function sendPrompt(window: Page, text: string): Promise<void> {
  const box = composer(window);
  await expect(box).toBeEnabled({ timeout: 15000 });
  await box.fill(text);
  await box.press('Enter');
}

export const latestResponse = (window: Page) =>
  window.getByTestId('ai-panel-latest-assistant-response').last();

export async function connectProvider(window: Page, optionLabel: string, key = 'e2e-test-key'): Promise<void> {
  await window.locator('button[title="Configurar proveedores de IA"]').click();

  // The provider select is the first listbox trigger inside the modal form;
  // it may show the placeholder or an already-connected provider.
  const providerTrigger = window.locator('form button[aria-haspopup="listbox"]').first();
  await providerTrigger.click();
  await window.getByRole('option', { name: optionLabel, exact: true }).first().click();

  await window.locator('input[type="password"]').first().fill(key);
  await window.getByRole('button', { name: /Guardar y Conectar/ }).click();

  // The modal closes itself ~1.2s after a successful save.
  await expect(providerTrigger).toHaveCount(0, { timeout: 10000 });
}

/** Selects an option from a labelled StyledSelect. */
export async function pickStyledOption(window: Page, ariaLabel: string, optionLabel: string): Promise<void> {
  await window.locator(`button[aria-label="${ariaLabel}"]`).click();
  // Model options announce themselves as "<model> (<provider>)".
  await window.getByRole('option', { name: optionLabel }).first().click();
}
