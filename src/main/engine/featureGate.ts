const TRUE_VALUES = new Set(['1', 'true']);

export function isSpigotChatsEngineEnabled(
  rawValue: string | undefined,
): boolean {
  if (!rawValue) {
    return false;
  }

  return TRUE_VALUES.has(rawValue.trim().toLowerCase());
}
