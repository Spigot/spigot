export type EngineCapabilityStatus = {
  supported: boolean;
  notes?: string;
};

export type EngineCapabilities = {
  mcp: EngineCapabilityStatus;
  plugins: EngineCapabilityStatus;
  history: EngineCapabilityStatus;
  fileHistory: EngineCapabilityStatus;
};

export function getEngineCapabilities(): EngineCapabilities {
  return {
    mcp: { supported: true },
    plugins: { supported: true },
    history: { supported: true },
    fileHistory: { supported: true },
  };
}
