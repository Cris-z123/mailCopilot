import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom', // Use happy-dom for React component testing
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/integration/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/', 'dist/', 'build/', 'tests/unit/'],
    testTimeout: 10000, // 10 second timeout for integration tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/main/**/*', 'src/shared/**/*', 'src/renderer/**/*'],
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
      '@': path.resolve(__dirname, './src/main'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@renderer/lib': path.resolve(__dirname, './src/renderer/lib'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  // Add tsconfig for type checking
  tsconfig: {
    configFile: path.resolve(__dirname, './tsconfig.renderer.json'),
  },
});
