import { defineConfig } from 'vite';

/**
 * `PAGES_BASE` is set by the Pages workflow, because the site is served from
 * `https://<owner>.github.io/<repo>/` rather than from the domain root.
 */
const base = process.env.PAGES_BASE ?? '/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    // Pinned to IPv4 so the Playwright web server and the browser agree on
    // where the dev server lives; `localhost` resolves to ::1 on some hosts.
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 5174,
  },
});
