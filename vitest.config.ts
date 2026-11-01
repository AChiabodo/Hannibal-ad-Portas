import { defineConfig } from 'vitest/config';
import { availableParallelism } from 'node:os';

export default defineConfig({
  test: {
    // Unit tests run in Node. Anything that needs a browser belongs in `e2e/`,
    // which Playwright owns.
    environment: 'node',
    // Map invariants and multi-year Matches are CPU-heavy. Unbounded workers
    // can starve otherwise passing tests past their per-test timeouts. Three
    // workers also leave headroom for the hundred-Match wall-clock fence.
    maxWorkers: Math.min(3, availableParallelism()),
    include: ['tests/**/*.test.ts'],
  },
});
