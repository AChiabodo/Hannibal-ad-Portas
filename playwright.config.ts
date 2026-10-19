import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
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
  workers: process.env.CI ? 1 : undefined,
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
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
