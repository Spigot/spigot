import { create } from 'zustand';

// The composer toolbar needs room for attachment, command, agent, model, and send controls.
export const AI_PANEL_MIN_WIDTH = 400;
export const AI_PANEL_MAX_WIDTH = 700;

export type SidebarTab = 'explorer' | 'search' | 'source-control' | 'pull-request';

interface LayoutState {
  activeSidebarTab: SidebarTab;
  isSidebarOpen: boolean;
  isConsoleOpen: boolean;
  isConsoleMaximized: boolean;
  sidebarWidth: number;
  consoleHeight: number;
  isAIPanelOpen: boolean;
  aiPanelWidth: number;
  isAgentModeOpen: boolean;
  isSettingsModalOpen: boolean;
  
  setSidebarTab: (tab: SidebarTab) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleConsole: () => void;
  setConsoleOpen: (open: boolean) => void;
  toggleConsoleMaximize: () => void;
  setSidebarWidth: (width: number) => void;
  setConsoleHeight: (height: number) => void;
  toggleAIPanel: () => void;
  setAIPanelOpen: (open: boolean) => void;
  setAIPanelWidth: (width: number) => void;
  toggleAgentMode: () => void;
  setAgentModeOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  activeSidebarTab: 'explorer',
  isSidebarOpen: true,
  isConsoleOpen: false,
  isConsoleMaximized: false,
  sidebarWidth: 280,
  consoleHeight: 250,
  isAIPanelOpen: true,
  aiPanelWidth: AI_PANEL_MIN_WIDTH,
  isAgentModeOpen: false,
  isSettingsModalOpen: false,

  setSidebarTab: (tab) => set((state) => ({
    activeSidebarTab: tab,
    // Open sidebar automatically when clicking a new tab unless it was clicked again to close
    isSidebarOpen: state.activeSidebarTab === tab ? !state.isSidebarOpen : true,
  })),

  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),

  toggleConsole: () => set((state) => ({ isConsoleOpen: !state.isConsoleOpen })),

  setConsoleOpen: (open) => set({ isConsoleOpen: open }),

  toggleConsoleMaximize: () => set((state) => ({ isConsoleMaximized: !state.isConsoleMaximized })),

  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  setConsoleHeight: (height) => set({ consoleHeight: height }),

  toggleAIPanel: () => set((state) => ({ isAIPanelOpen: !state.isAIPanelOpen })),

  setAIPanelOpen: (open) => set({ isAIPanelOpen: open }),

  setAIPanelWidth: (width) => set({
    aiPanelWidth: Math.max(AI_PANEL_MIN_WIDTH, Math.min(AI_PANEL_MAX_WIDTH, width)),
  }),

  toggleAgentMode: () => set((state) => ({ isAgentModeOpen: !state.isAgentModeOpen })),

  setAgentModeOpen: (open) => set({ isAgentModeOpen: open }),

  setSettingsModalOpen: (open) => set({ isSettingsModalOpen: open }),
}));

