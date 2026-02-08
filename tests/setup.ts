/**
 * Vitest setup file
 * Configure test environment before running tests
 */

import { vi } from 'vitest';
import '@testing-library/jest-dom';
import { Window } from 'happy-dom';

// Set environment variables for tests
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';

// Initialize happy-dom window if not already present
if (!global.window || typeof global.window.document === 'undefined') {
  const happyWindow = new Window();

  // Cast through unknown to bypass strict type checking for happy-dom globals
  // Note: happy-dom has different type signatures than native DOM types
  global.window = happyWindow as unknown as typeof global.window;
  global.document = happyWindow.document as unknown as typeof global.document;
  global.HTMLElement = happyWindow.HTMLElement as unknown as typeof global.HTMLElement;
  global.Element = happyWindow.Element as unknown as typeof global.Element;
  global.Node = happyWindow.Node as unknown as typeof global.Node;
}

// Mock window.electronAPI for renderer process tests
(global.window as any).electronAPI = {
  llm: {
    generate: vi.fn().mockResolvedValue({
      success: true,
      items: [],
      processed_emails: [],
      skipped_emails: 0,
      reprocessed_emails: 0,
    }),
  },
  db: {
    queryHistory: vi.fn().mockResolvedValue([]),
    export: vi.fn().mockResolvedValue({
      success: true,
      filePath: '/tmp/export.md',
      format: 'markdown',
      itemCount: 0,
    }),
  },
  config: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue({
      success: true,
      updated: [],
    }),
  },
  app: {
    checkUpdate: vi.fn().mockResolvedValue({
      hasUpdate: false,
    }),
  },
  email: {
    fetchMeta: vi.fn().mockResolvedValue({
      success: true,
      metadata: {},
    }),
  },
};

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
