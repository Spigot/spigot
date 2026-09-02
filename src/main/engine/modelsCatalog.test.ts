import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ModelsCatalogService } from './modelsCatalog';

describe('ModelsCatalogService', () => {
  it('loads models from catalog', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'models-catalog-test-'));
    const service = new ModelsCatalogService(tmpDir);

    const models = await service.getModelsForProvider('openai');
    expect(models).toContain('gpt-5.6-terra');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
