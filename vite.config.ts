import { defineConfig } from 'vite';

/**
 * Base path:
 *  - GitHub Pages serves the site at https://<user>.github.io/<repo>/, so the
 *    deploy workflow sets BASE_PATH=/<repo>/ automatically.
 *  - Locally (and on Vercel) we serve from the root.
 */
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Keep the big libraries in their own cacheable chunks.
        manualChunks: (id: string) => (id.includes('node_modules/pixi.js') ? 'pixi' : undefined),
      },
    },
  },
  server: { host: true, port: 5173 },
});
