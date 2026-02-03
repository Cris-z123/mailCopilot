import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/integration/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/', 'dist/', 'build/', 'tests/unit/'],
    testTimeout: 10000, // 10 second timeout for integration tests
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
      // Integration tests don't have strict coverage thresholds
      // They test real database operations, IPC communication, etc.
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
