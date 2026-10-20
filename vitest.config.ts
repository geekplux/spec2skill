import { defineConfig } from 'vitest/config';

// Single process, no watch: the build machine is shared and RAM-tight.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    watch: false,
  },
});
