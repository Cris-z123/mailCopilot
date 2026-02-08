import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for security-focused tests only.
 * Runs unit security/encryption and integration security tests (Constitution Principle V).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/unit/security/**/*.{test,spec}.{ts,tsx}',
      'tests/unit/encryption/**/*.{test,spec}.{ts,tsx}',
      'tests/integration/security/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['node_modules/', 'dist/', 'build/'],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/main'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
});
