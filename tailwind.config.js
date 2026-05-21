/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        editor: {
          bg: '#1e1e1e',          // VS Code editor background
          sidebar: '#252526',     // Sidebar background
          activity: '#333333',    // Leftmost activity bar
          statusBar: '#007acc',   // Status bar blue
          statusBarBg: '#1e1e1e', // Dark status bar option
          titleBar: '#3c3c3c',    // Top title bar
          panel: '#1e1e1e',       // Console panel bg
          border: '#3c3c3c',      // Editor boarder line
          accent: '#007acc',      // Accent color blue
          text: '#cccccc',        // Default text color
          textDark: '#858585',    // Dimmed text
          hover: '#2a2d2e',       // Hover row background
          active: '#37373d',      // Active row background
          tabActive: '#1e1e1e',   // Active editor tab background
          tabInactive: '#2d2d2d', // Inactive tab background
        }
      },
      fontFamily: {
        mono: ['Consolas', 'Courier New', 'monospace'],
        sans: ['Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
