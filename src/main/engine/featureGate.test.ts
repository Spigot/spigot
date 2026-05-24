import { describe, expect, it } from 'vitest';

import { isSpigotChatsEngineEnabled } from './featureGate';

describe('isSpigotChatsEngineEnabled', () => {
  it('returns false when env flag is missing', () => {
    expect(isSpigotChatsEngineEnabled(undefined)).toBe(false);
  });

  it('returns true only for explicit truthy values', () => {
    expect(isSpigotChatsEngineEnabled('1')).toBe(true);
    expect(isSpigotChatsEngineEnabled('true')).toBe(true);
    expect(isSpigotChatsEngineEnabled('TRUE')).toBe(true);
    expect(isSpigotChatsEngineEnabled('0')).toBe(false);
  });
});
