import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// NestJS 12 se publica como ESM puro. Jest necesita Node ≥24.9 para poder
// require()arlo, así que los tests corren con Vitest, que es ESM nativo.
// El plugin de SWC es lo que conserva los decoradores y los metadatos de tipo
// que necesita la inyección de dependencias de Nest.
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
