/**
 * Vitest setup file
 * Configure test environment before running tests
 */

import { vi } from 'vitest';

// Set environment variables for tests
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';

// Mock electron app.getPath for logger tests
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') {
        return '/tmp/test-mailcopilot';
      }
      return '/tmp/test';
    },
  },
}));

// Mock electron-log to avoid file I/O in tests
vi.mock('electron-log', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    transports: {
      file: {
        level: 'debug',
        format: '',
        maxSize: 0,
        file: '',
      },
      console: {
        level: 'debug',
      },
    },
  },
}));
