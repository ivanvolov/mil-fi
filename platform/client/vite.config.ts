import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // The shared .env lives at the repo root (mil-fi/.env), same file server/src/config.ts
  // loads — Vite otherwise only looks in this package's own directory and would never
  // see VITE_WORLD_APP_ID.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [react()],
  // IDKit loads idkit_wasm_bg.wasm relative to its own module URL. Vite's dep
  // pre-bundling moves the JS into .vite/deps/ WITHOUT the wasm, so the fetch
  // 404s, the SPA fallback answers with index.html, and WASM init dies with
  // "expected magic word 00 61 73 6d, found 3c 21 44 4f" (that's "<!DO").
  // Excluding the packages serves them from node_modules, where the wasm
  // really sits next to the JS.
  optimizeDeps: {
    exclude: ['@worldcoin/idkit', '@worldcoin/idkit-core'],
    // Excluding idkit stops Vite from converting its CJS deps too; qrcode is
    // CJS-only and must still be pre-bundled or the browser chokes on it.
    include: ['@worldcoin/idkit > qrcode/lib/core/qrcode.js'],
  },
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
