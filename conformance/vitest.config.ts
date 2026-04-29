import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/scenarios/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globals: true,
    reporters: ['default'],
    bail: 0,
  },
});
