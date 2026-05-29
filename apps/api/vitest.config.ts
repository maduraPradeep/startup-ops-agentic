import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // The registry-parity suite may apply migrations + seed against a real DB.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
