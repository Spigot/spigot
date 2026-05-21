import { create } from 'zustand';

export type SidebarTab = 'explorer' | 'search' | 'extensions' | 'settings';

interface LayoutState {
  activeSidebarTab: SidebarTab;
  isSidebarOpen: boolean;
  isConsoleOpen: boolean;
  isConsoleMaximized: boolean;
  sidebarWidth: number;
  consoleHeight: number;
  
  setSidebarTab: (tab: SidebarTab) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleConsole: () => void;
  setConsoleOpen: (open: boolean) => void;
  toggleConsoleMaximize: () => void;
  setSidebarWidth: (width: number) => void;
  setConsoleHeight: (height: number) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  activeSidebarTab: 'explorer',
  isSidebarOpen: true,
  isConsoleOpen: false,
  isConsoleMaximized: false,
  sidebarWidth: 240,
  consoleHeight: 250,

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
}));
