import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/', 'dist/', 'build/', 'tests/integration/'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['main/**/*', 'shared/**/*'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.config.ts',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './main'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
