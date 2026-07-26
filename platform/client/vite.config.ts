import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // The shared .env lives at the repo root (mil-fi/.env), same file server/src/config.ts
  // loads — Vite otherwise only looks in this package's own directory and would never
  // see VITE_WORLD_APP_ID.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      '@algos': fileURLToPath(new URL('../algos', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
