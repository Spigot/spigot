import { describe, expect, it } from 'vitest';

import { getEngineCapabilities } from './capabilities';

describe('getEngineCapabilities', () => {
  it('includes mcp/plugins/history/file-history capabilities as supported', () => {
    const capabilities = getEngineCapabilities();

    expect(capabilities.mcp.supported).toBe(true);
    expect(capabilities.plugins.supported).toBe(true);
    expect(capabilities.history.supported).toBe(true);
    expect(capabilities.fileHistory.supported).toBe(true);
  });
});
