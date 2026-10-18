import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * `PAGES_BASE` is set by the Pages workflow, because the site is served from
 * `https://<owner>.github.io/<repo>/` rather than from the domain root.
 */
const base = process.env.PAGES_BASE ?? '/';

/** The page a player opens, and the page an agent inspects the art on (PLAN §3). */
const pages = {
  main: fileURLToPath(new URL('./index.html', import.meta.url)),
  atelier: fileURLToPath(new URL('./atelier.html', import.meta.url)),
};

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // Two pages, not one with a mode: the Atelier is a surface a test can point
    // at and a person can open, and both are deployed by the same build.
    rollupOptions: { input: pages },
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
