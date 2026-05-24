export type EngineHistoryRecord = {
  messages: unknown[];
  fileHistory: Array<{ path: string; action: 'snapshot' | 'restore' }>;
};

const EMPTY_RECORD: EngineHistoryRecord = {
  messages: [],
  fileHistory: [],
};

export class EngineHistoryStore {
  private readonly store = new Map<string, EngineHistoryRecord>();

  async append(
    workspacePath: string,
    sessionId: string,
    entry: EngineHistoryRecord,
  ): Promise<void> {
    this.store.set(this.key(workspacePath, sessionId), {
      messages: [...entry.messages],
      fileHistory: [...entry.fileHistory],
    });
  }

  async load(workspacePath: string, sessionId: string): Promise<EngineHistoryRecord> {
    return this.store.get(this.key(workspacePath, sessionId)) ?? EMPTY_RECORD;
  }

  private key(workspacePath: string, sessionId: string): string {
    return `${workspacePath}::${sessionId}`;
  }
}
