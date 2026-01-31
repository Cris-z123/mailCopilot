import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
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
        '**/*.config.ts',
        '**/types/**',
      ],
      // 60% coverage target, 100% for security modules
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
        perFile: true,
      },
      // Security modules require 100% coverage
      overrides: [
        {
          include: ['main/**/encryption.ts', 'main/**/ConfigManager.ts', 'main/rule-engine/**'],
          thresholds: {
            lines: 100,
            functions: 100,
            branches: 100,
            statements: 100,
          },
        },
      ],
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
