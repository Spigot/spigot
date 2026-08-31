import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConsolePanel from './ConsolePanel';
import { useDiagnosticsStore } from '../../store/diagnosticsStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useTerminalStore } from '../../store/terminalStore';
import { useWorkspaceStore } from '../../store/workspaceStore';

const mocks = vi.hoisted(() => ({
  terminals: [] as any[],
  fitAddons: [] as any[],
  resizeObservers: [] as any[],
  closeCallbacks: new Map<string, () => void>(),
  incomingRemovers: new Map<string, ReturnType<typeof vi.fn>>(),
  closeRemovers: new Map<string, ReturnType<typeof vi.fn>>(),
  create: vi.fn(),
  close: vi.fn(),
  getHistory: vi.fn(),
  onClose: vi.fn(),
  onData: vi.fn(),
  resize: vi.fn(),
  write: vi.fn(),
}));

vi.mock('xterm', () => ({
  Terminal: class MockTerminal {
    cols = 80;
    rows = 24;
    element: HTMLElement | undefined;
    options: Record<string, unknown>;
    dataDisposable = { dispose: vi.fn() };
    open = vi.fn((host: HTMLElement) => {
      this.element = document.createElement('div');
      this.element.dataset.xtermViewport = 'true';
      host.appendChild(this.element);
    });
    loadAddon = vi.fn();
    attachCustomKeyEventHandler = vi.fn();
    hasSelection = vi.fn(() => false);
    getSelection = vi.fn(() => '');
    clearSelection = vi.fn();
    onData = vi.fn(() => this.dataDisposable);
    write = vi.fn();
    refresh = vi.fn();
    focus = vi.fn();
    dispose = vi.fn(() => this.element?.remove());

    constructor(options: Record<string, unknown>) {
      this.options = options;
      mocks.terminals.push(this);
    }
  },
}));

vi.mock('xterm-addon-fit', () => ({
  FitAddon: class MockFitAddon {
    fit = vi.fn();

    constructor() {
      mocks.fitAddons.push(this);
    }
  },
}));

class ResizeObserverMock {
  target: Element | null = null;
  callback: ResizeObserverCallback;
  observe = vi.fn((target: Element) => {
    this.target = target;
  });
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    mocks.resizeObservers.push(this);
  }
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const setSessions = (ids: string[]) => {
  useTerminalStore.setState({
    sessions: ids.map((id, index) => ({ id, name: `Terminal ${index + 1}` })),
    activeSessionId: ids[0] || null,
    isCreating: false,
  });
};

const createRect = (width: number, height: number): DOMRect => ({
  x: 0,
  y: 0,
  top: 0,
  right: width,
  bottom: height,
  left: 0,
  width,
  height,
  toJSON: () => ({}),
});

const setHostSize = (host: Element, width: number, height: number) => {
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(createRect(width, height));
};

const triggerResize = (width: number, height: number) => {
  const observer = mocks.resizeObservers[mocks.resizeObservers.length - 1];
  const entry = {
    target: observer.target,
    contentRect: createRect(width, height),
  } as ResizeObserverEntry;
  observer.callback([entry], observer);
};

const renderPanel = () => render(
  <StrictMode>
    <ConsolePanel />
  </StrictMode>,
);

describe('ConsolePanel terminal lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.terminals.length = 0;
    mocks.fitAddons.length = 0;
    mocks.resizeObservers.length = 0;
    mocks.closeCallbacks.clear();
    mocks.incomingRemovers.clear();
    mocks.closeRemovers.clear();

    mocks.getHistory.mockResolvedValue([]);
    mocks.onData.mockImplementation((sessionId: string) => {
      const remove = vi.fn();
      mocks.incomingRemovers.set(sessionId, remove);
      return remove;
    });
    mocks.onClose.mockImplementation((sessionId: string, callback: () => void) => {
      const remove = vi.fn();
      mocks.closeCallbacks.set(sessionId, callback);
      mocks.closeRemovers.set(sessionId, remove);
      return remove;
    });

    (window as any).api = {
      terminal: {
        create: mocks.create,
        close: mocks.close,
        getHistory: mocks.getHistory,
        onClose: mocks.onClose,
        onData: mocks.onData,
        resize: mocks.resize,
        write: mocks.write,
      },
    };

    useLayoutStore.setState({
      isConsoleOpen: true,
      isConsoleMaximized: false,
      consoleHeight: 250,
    });
    useWorkspaceStore.setState({ workspacePath: 'C:\\workspace', theme: 'spigot-dark' });
    useDiagnosticsStore.setState({ fileDiagnostics: {} });
    setSessions(['terminal-1']);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps the same host and opens xterm only once across panel hide and reopen', () => {
    const { container } = renderPanel();
    const host = container.querySelector('[data-session-id="terminal-1"]');
    const viewport = mocks.terminals[0].element;

    expect(mocks.terminals).toHaveLength(1);
    expect(host).not.toBeNull();
    expect(host?.contains(viewport)).toBe(true);
    expect(mocks.terminals[0].open).toHaveBeenCalledTimes(1);
    expect(mocks.terminals.reduce((count, terminal) => count + terminal.open.mock.calls.length, 0)).toBe(1);
    expect(mocks.onData).toHaveBeenCalledTimes(1);
    expect(mocks.onClose).toHaveBeenCalledTimes(1);

    act(() => useLayoutStore.setState({ isConsoleOpen: false }));
    expect(host?.isConnected).toBe(true);
    expect(container.querySelector('[data-session-id="terminal-1"]')).toBe(host);

    act(() => useLayoutStore.setState({ isConsoleOpen: true }));
    expect(container.querySelector('[data-session-id="terminal-1"]')).toBe(host);
    expect(host?.contains(viewport)).toBe(true);
    expect(mocks.terminals[0].open).toHaveBeenCalledTimes(1);
  });

  it('keeps the same host and xterm across panel tab switches', () => {
    const { container } = renderPanel();
    const host = container.querySelector('[data-session-id="terminal-1"]');
    const viewport = mocks.terminals[0].element;

    for (const tab of ['Problems', 'Output', 'Debug Console', 'Ports']) {
      fireEvent.click(screen.getByRole('button', { name: tab }));
      expect(host?.isConnected).toBe(true);
      expect(container.querySelector('[data-session-id="terminal-1"]')).toBe(host);

      fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
      expect(container.querySelector('[data-session-id="terminal-1"]')).toBe(host);
      expect(host?.contains(viewport)).toBe(true);
    }
    expect(mocks.terminals[0].open).toHaveBeenCalledTimes(1);
  });

  it('fits only the visible, positive-size active host', () => {
    setSessions(['terminal-1', 'terminal-2']);
    const { container } = renderPanel();
    const activeHost = container.querySelector('[data-session-id="terminal-1"]')!;
    const inactiveHost = container.querySelector('[data-session-id="terminal-2"]')!;
    setHostSize(activeHost, 640, 240);
    setHostSize(inactiveHost, 640, 240);

    act(() => triggerResize(640, 240));
    expect(mocks.fitAddons[0].fit).toHaveBeenCalledTimes(1);
    expect(mocks.resize).toHaveBeenCalledWith('terminal-1', 80, 24);
    expect(mocks.fitAddons[1].fit).not.toHaveBeenCalled();

    vi.clearAllMocks();
    act(() => useLayoutStore.setState({ isConsoleOpen: false }));
    act(() => triggerResize(640, 240));
    expect(mocks.fitAddons[0].fit).not.toHaveBeenCalled();
    expect(mocks.resize).not.toHaveBeenCalled();

    act(() => useLayoutStore.setState({ isConsoleOpen: true }));
    vi.clearAllMocks();
    setHostSize(activeHost, 0, 0);
    act(() => triggerResize(640, 240));
    expect(mocks.fitAddons[0].fit).not.toHaveBeenCalled();
    expect(mocks.resize).not.toHaveBeenCalled();

    setHostSize(activeHost, 640, 240);
    fireEvent.click(screen.getByRole('button', { name: 'Problems' }));
    vi.clearAllMocks();
    act(() => triggerResize(640, 240));
    expect(mocks.fitAddons[0].fit).not.toHaveBeenCalled();
    expect(mocks.fitAddons[1].fit).not.toHaveBeenCalled();
    expect(mocks.resize).not.toHaveBeenCalled();
  });

  it('does not send synthetic Enter after the former fallback delay', async () => {
    vi.useFakeTimers();
    renderPanel();

    expect(mocks.getHistory).toHaveBeenCalledWith('terminal-1');
    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(200);
    });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('disposes every xterm and listener on component unmount without closing PTYs', () => {
    setSessions(['terminal-1', 'terminal-2']);
    const { unmount } = renderPanel();
    const terminals = [...mocks.terminals];

    unmount();

    expect(terminals).toHaveLength(2);
    for (const terminal of terminals) {
      expect(terminal.dataDisposable.dispose).toHaveBeenCalledTimes(1);
      expect(terminal.dispose).toHaveBeenCalledTimes(1);
    }
    expect(mocks.incomingRemovers.get('terminal-1')).toHaveBeenCalledTimes(1);
    expect(mocks.incomingRemovers.get('terminal-2')).toHaveBeenCalledTimes(1);
    expect(mocks.closeRemovers.get('terminal-1')).toHaveBeenCalledTimes(1);
    expect(mocks.closeRemovers.get('terminal-2')).toHaveBeenCalledTimes(1);
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it('opens added sessions once and disposes only removed session ownership', () => {
    const { unmount } = renderPanel();
    const firstTerminal = mocks.terminals[0];

    act(() => {
      useTerminalStore.setState({
        sessions: [
          { id: 'terminal-1', name: 'Terminal 1' },
          { id: 'terminal-2', name: 'Terminal 2' },
        ],
      });
    });

    expect(mocks.terminals).toHaveLength(2);
    expect(mocks.terminals.reduce((count, terminal) => count + terminal.open.mock.calls.length, 0)).toBe(2);
    const secondTerminal = mocks.terminals[1];

    act(() => {
      useTerminalStore.setState({
        sessions: [{ id: 'terminal-2', name: 'Terminal 2' }],
        activeSessionId: 'terminal-2',
      });
    });

    expect(firstTerminal.dispose).toHaveBeenCalledTimes(1);
    expect(firstTerminal.dataDisposable.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.incomingRemovers.get('terminal-1')).toHaveBeenCalledTimes(1);
    expect(mocks.closeRemovers.get('terminal-1')).toHaveBeenCalledTimes(1);
    expect(secondTerminal.dispose).not.toHaveBeenCalled();

    unmount();
    expect(firstTerminal.dispose).toHaveBeenCalledTimes(1);
    expect(secondTerminal.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.incomingRemovers.get('terminal-2')).toHaveBeenCalledTimes(1);
    expect(mocks.closeRemovers.get('terminal-2')).toHaveBeenCalledTimes(1);
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it('keeps the panel open when one of two terminals exits naturally', () => {
    setSessions(['terminal-1', 'terminal-2']);
    renderPanel();

    act(() => mocks.closeCallbacks.get('terminal-1')?.());

    expect(useTerminalStore.getState().sessions.map((session) => session.id)).toEqual(['terminal-2']);
    expect(useLayoutStore.getState().isConsoleOpen).toBe(true);
  });
});
