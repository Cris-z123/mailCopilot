import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/', 'dist/', 'build/', 'tests/integration/'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['main/**/*', 'shared/**/*', 'renderer/src/**/*'],
      exclude: [
        'node_modules/',
        'dist/',
        'build/',
        'tests/',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/*.config.ts',
        '**/*.d.ts',
        '**/types/**',
      ],
      // 85%+ coverage target per plan.md R0-10 (unit tests)
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
        perFile: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './main'),
      '@renderer': path.resolve(__dirname, './renderer/src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
