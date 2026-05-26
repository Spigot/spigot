const DISABLED_FEATURES = new Set<string>();

export function feature(_name: string): boolean {
  return false;
}

export function setEnabledFeatures(features: string[]): void {
  DISABLED_FEATURES.clear();
  for (const featureName of features) {
    DISABLED_FEATURES.add(featureName);
  }
}

export function getEnabledFeatures(): string[] {
  return Array.from(DISABLED_FEATURES);
}
