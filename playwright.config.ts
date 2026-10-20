import { defineConfig, devices } from '@playwright/test';

/**
 * The port the browser profiles serve on.
 *
 * Not `vite preview`'s 4173: that number is common enough that an unrelated
 * local server can already be listening on it, and Playwright's
 * `reuseExistingServer` would then drive the wrong application while reporting
 * failures about this one (observed on the recorded environment, ticket #64).
 * The web server is never reused, so an occupied port fails loudly instead.
 * `SPQR_E2E_PORT` is the escape hatch for a machine where 4399 is taken too.
 */
const PORT = Number(process.env.SPQR_E2E_PORT ?? 4399);
const BASE_URL = `http://127.0.0.1:${PORT}/`;

/**
 * Software WebGL in headless Chromium needs `--enable-unsafe-swiftshader`.
 * Without it the GPU stack refuses to fall back to SwiftShader and any WebGL
 * context is null, which is exactly the CI failure this flag prevents (§8).
 */
const CHROMIUM_ARGS = ['--enable-unsafe-swiftshader'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  /**
   * Software WebGL already uses every core a page is given, so two workers are
   * the most this repository runs locally (ticket #64). An unbounded local run
   * on a six-core machine opened more SwiftShader canvases than the CPU could
   * serve, and tests that wait on the page's frame loop failed on contention
   * rather than on their subject. CI keeps one worker, as it always has.
   */
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    /**
     * A kept trace on any failure, not `on-first-retry`: E4's evidence rule is
     * that a failing browser test explains itself, and a first failure with no
     * trace would need a second run to produce one.
     */
    trace: 'retain-on-failure',
    /**
     * No screenshots. Everything a diagnosis needs is attached by the fixture in
     * `e2e/fixtures.ts` — the boot report, the snapshot, the state hash, the
     * console and the DOM — and a picture of a canvas says less than any of them.
     */
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: CHROMIUM_ARGS },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    /**
     * Always start our own server: a URL that answers is not proof that it is
     * this project (see `PORT`), and a silently reused stranger is a failure
     * that blames the wrong code.
     */
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
