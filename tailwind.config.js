/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        border: '#27272a',
        accent: '#27272a',
        'accent-foreground': '#ffffff',
        'muted-foreground': '#a1a1aa',
        editor: {
          bg: '#0a0a0a',          // Cursor deep pitch black
          sidebar: '#0e0e0f',     // Sleek sidebar dark gray
          activity: '#070708',    // Leftmost activity bar black
          statusBar: '#ffffff',   // White status bar text/accent
          statusBarBg: '#070708', // Black status bar background
          titleBar: '#070708',    // Sleek black top title bar
          panel: '#0a0a0a',       // Bottom terminal panel bg
          border: '#1c1c1e',      // Ultra-thin neutral border
          accent: '#ffffff',      // Accent color crisp white
          text: '#e4e4e7',        // Default light zinc text
          textDark: '#71717a',    // Dimmed zinc text
          hover: '#18181b',       // Neutral hover row background
          active: '#27272a',      // Active selected background
          tabActive: '#0e0e0f',   // Active editor tab background
          tabInactive: '#070708', // Inactive tab background
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
