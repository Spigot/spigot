import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src/renderer'),
    },
  },
  plugins: [
    react(),
    electron([
      {
        // Main process entry
        entry: 'src/main/index.ts',
        onstart(options) {
          options.startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['node-pty'],
            },
          },
        },
      },
      {
        // Preload process entry
        entry: 'src/preload/index.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
          },
        },
      },
    ]),
    renderer({
      nodeIntegration: false,
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
