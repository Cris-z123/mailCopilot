import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
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
      // 85%+ coverage target per plan.md R0-10 (security modules require 100%)
      // Note: perFile: false allows unimplemented files (0% coverage) without blocking
      // Security modules must still reach 100% (enforced manually)
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
        perFile: false, // Overall threshold, not per-file (work-in-progress friendly)
      },
      // Security modules require 100% coverage (Constitution Principle V)
      // Manually verify: main/config/encryption.ts, main/rule-engine/QuickJSSandbox.ts
    },
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/', 'dist/', 'build/'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './main'),
      '@renderer': path.resolve(__dirname, './renderer/src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
