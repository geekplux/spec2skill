import { defineConfig } from 'vitest/config';

// Single process, no watch: the build machine is shared and RAM-tight.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts', 'src/**/*.test.mjs', 'scripts/**/*.test.mjs'],
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    watch: false,
    // Let `tokens.css?raw` and `app.css?raw` reach the token and contrast tests (Vitest stubs CSS out by default).
    css: { include: [/tokens\.css/, /app\.css/] },
  },
});
