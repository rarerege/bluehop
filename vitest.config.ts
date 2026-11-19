import { defineConfig } from 'vitest/config';

// The simulation engine is pure TypeScript, so tests run in plain Node (no DOM).
export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'node',
  },
});
