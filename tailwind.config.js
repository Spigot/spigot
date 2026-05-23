/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        border: 'var(--border)',
        accent: 'var(--accent)',
        'accent-foreground': 'var(--accent-foreground)',
        'muted-foreground': 'var(--muted-foreground)',
        editor: {
          bg: 'var(--editor-bg)',
          sidebar: 'var(--editor-sidebar)',
          activity: 'var(--editor-activity)',
          statusBar: 'var(--editor-statusBar)',
          statusBarBg: 'var(--editor-statusBarBg)',
          titleBar: 'var(--editor-titleBar)',
          panel: 'var(--editor-panel)',
          border: 'var(--editor-border)',
          accent: 'var(--editor-accent)',
          text: 'var(--editor-text)',
          textDark: 'var(--editor-textDark)',
          hover: 'var(--editor-hover)',
          active: 'var(--editor-active)',
          tabActive: 'var(--editor-tabActive)',
          tabInactive: 'var(--editor-tabInactive)',
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
