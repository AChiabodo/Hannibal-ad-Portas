import { defineConfig } from 'vitest/config';
import { availableParallelism } from 'node:os';

export default defineConfig({
  test: {
    // Unit tests run in Node. Anything that needs a browser belongs in `e2e/`,
    // which Playwright owns.
    environment: 'node',
    // Map invariants and multi-year Matches are CPU-heavy. Unbounded workers
    // can starve otherwise passing tests past their per-test timeouts.
    maxWorkers: Math.min(4, availableParallelism()),
    include: ['tests/**/*.test.ts'],
  },
});
