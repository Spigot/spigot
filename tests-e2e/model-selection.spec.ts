import { expect, test } from '@playwright/test';
import { connectProvider, launchApp, pickStyledOption } from './helpers';

const MODEL_SELECT = 'Select Orchestrator model';

test('selecting a model persists it across app restarts', async () => {
  const first = await launchApp();
  try {
    await connectProvider(first.window, 'OpenAI');

    // Connect populates the model list from the E2E fixture catalog.
    await pickStyledOption(first.window, MODEL_SELECT, 'e2e-typed-model');
    const modelTrigger = first.window.locator(`button[aria-label="${MODEL_SELECT}"]`);
    await expect(modelTrigger).toContainText('e2e-typed-model');
  } finally {
    await first.app.close();
  }

  // Relaunching the app must restore the connected provider AND the model.
  const second = await launchApp();
  try {
    const modelTrigger = second.window.locator(`button[aria-label="${MODEL_SELECT}"]`);
    await expect(modelTrigger).toContainText('e2e-typed-model', { timeout: 20000 });
  } finally {
    await second.app.close();
  }
});
