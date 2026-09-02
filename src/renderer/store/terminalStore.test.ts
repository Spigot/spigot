import { describe, expect, it } from 'vitest';
import { useTerminalStore } from './terminalStore';

describe('terminalStore.ensureAgentSession', () => {
  it('adds the agent session once, activates it, and keeps it read-only flagged', () => {
    useTerminalStore.setState({ sessions: [], activeSessionId: null });

    const store = useTerminalStore.getState();
    store.ensureAgentSession({ id: 'agent-conv-1', name: 'Agente', cwd: '/tmp' });
    // A second turn in the same conversation must not duplicate the session.
    store.ensureAgentSession({ id: 'agent-conv-1', name: 'Agente', cwd: '/tmp' });

    const { sessions, activeSessionId } = useTerminalStore.getState();
    expect(sessions.filter(session => session.id === 'agent-conv-1')).toHaveLength(1);
    expect(sessions.find(session => session.id === 'agent-conv-1')?.kind).toBe('agent');
    expect(activeSessionId).toBe('agent-conv-1');
  });
});
