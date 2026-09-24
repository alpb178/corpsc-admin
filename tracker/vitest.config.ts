import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { 'next/navigation': fileURLToPath(new URL('./test/next-navigation.ts', import.meta.url)) },
  },
  test: {
    globals: true,
    // Browser code by default; the route handler's tests switch to node.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.*', 'src/**/*.d.ts'],
      // The tracker runs on five sites: nothing in it ships untested.
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
  },
});
