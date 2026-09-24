import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// NestJS 12 ships as pure ESM. Jest needs Node ≥24.9 to be able to
// require() it, so the tests run on Vitest, which is native ESM.
// The SWC plugin is what keeps the decorators and the type metadata that
// Nest's dependency injection needs.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
    root: './',
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/**/*.module.ts'],
      // The floor, not the goal: raised with every test PR until 95 %. CI
      // fails if coverage drops below it.
      thresholds: { lines: 79, statements: 78, branches: 78, functions: 68 },
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
