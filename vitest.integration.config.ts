import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/', 'dist/', 'build/', 'tests/unit/'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['main/**/*', 'shared/**/*'],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './main'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
