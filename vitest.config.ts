import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests run in Node. Anything that needs a browser belongs in `e2e/`,
    // which Playwright owns.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
