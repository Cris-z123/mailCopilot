/**
 * Unit tests for GlobalErrorHandler
 *
 * Per T104 requirements:
 * - Catch unhandled errors (uncaughtException, unhandledRejection)
 * - Log with context (error type, module, message, timestamp, context ID)
 * - Show user-friendly error messages (non-technical, actionable)
 *
 * Per Constitution Principle VII:
 * - Structured logging format
 * - No sensitive data in error logs
 * - Error rate tracking
 *
 * @test: unit/error-handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { errorHandler, ErrorSeverity, ErrorCategory } from '../../src/main/error-handler';
import { logger } from '../../src/main/config/logger';

// Mock logger
vi.mock('../../src/main/config/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Electron app and dialog
vi.mock('electron', () => ({
  app: {
    isReady: vi.fn(() => true),
    quit: vi.fn(),
  },
  dialog: {
    showErrorBox: vi.fn(),
  },
}));

describe('GlobalErrorHandler', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Reset error handler state
    (errorHandler as any).errorCount = 0;
    (errorHandler as any).errorTimestamps = [];
    (errorHandler as any).mainWindow = null;
  });

  describe('initialize', () => {
    it('should register global error handlers', () => {
      const processOnSpy = vi.spyOn(process, 'on');

      errorHandler.initialize();

      // Verify handlers were registered
      expect(processOnSpy).toHaveBeenCalledWith(
        'uncaughtException',
        expect.any(Function)
      );
      expect(processOnSpy).toHaveBeenCalledWith(
        'unhandledRejection',
        expect.any(Function)
      );

      processOnSpy.mockRestore();
    });

    it('should log initialization', () => {
      errorHandler.initialize();

      expect(logger.info).toHaveBeenCalledWith(
        'ErrorHandler',
        'Global error handlers registered'
      );
    });
  });

  describe('setMainWindow', () => {
    it('should set main window reference', () => {
      const mockWindow = {
        isDestroyed: () => false,
      } as any;

      errorHandler.setMainWindow(mockWindow);

      expect((errorHandler as any).mainWindow).toBe(mockWindow);
    });

    it('should accept null for window reference', () => {
      errorHandler.setMainWindow(null);

      expect((errorHandler as any).mainWindow).toBeNull();
    });
  });

  describe('reportError', () => {
    it('should log error with structured context', () => {
      const error = new Error('Test error');
      const category = ErrorCategory.DATABASE;
      const module = 'TestModule';
      const context = { userId: '123' };

      errorHandler.reportError(error, category, module, context);

      expect(logger.error).toHaveBeenCalledWith(
        module,
        'Test error',
        error,
        expect.objectContaining({
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.CRITICAL,
          userId: '123',
        })
      );
    });

    it('should track error occurrences', () => {
      const error = new Error('Test error');

      errorHandler.reportError(error, ErrorCategory.UNKNOWN, 'TestModule');

      expect((errorHandler as any).errorCount).toBe(1);
      expect((errorHandler as any).errorTimestamps).toHaveLength(1);
    });

    it('should determine severity based on category', () => {
      const dbError = new Error('Database error');
      const networkError = new Error('Network error');

      // Database errors are critical
      errorHandler.reportError(dbError, ErrorCategory.DATABASE, 'TestModule');
      expect(logger.error).toHaveBeenCalledWith(
        'TestModule',
        'Database error',
        dbError,
        expect.objectContaining({
          severity: ErrorSeverity.CRITICAL,
        })
      );

      // Network errors are warnings
      errorHandler.reportError(
        networkError,
        ErrorCategory.NETWORK,
        'TestModule'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'TestModule',
        'Network error',
        networkError,
        expect.objectContaining({
          severity: ErrorSeverity.WARNING,
        })
      );
    });
  });

  describe('handleRendererProcessGone', () => {
    it('should log renderer process crash', () => {
      const details = {
        reason: 'crashed',
        exitCode: 1,
      };

      errorHandler.handleRendererProcessGone(details);

      expect(logger.error).toHaveBeenCalledWith(
        'ErrorHandler',
        'Renderer process gone',
        expect.any(Error),
        expect.objectContaining({
          category: ErrorCategory.RENDERER,
          severity: ErrorSeverity.CRITICAL,
          reason: 'crashed',
          exitCode: 1,
        })
      );
    });

    it('should track renderer errors', () => {
      const details = {
        reason: 'oom',
        exitCode: -1,
      };

      errorHandler.handleRendererProcessGone(details);

      expect((errorHandler as any).errorCount).toBe(1);
    });
  });

  describe('getErrorStats', () => {
    it('should return error statistics', () => {
      const error = new Error('Test error');

      errorHandler.reportError(error, ErrorCategory.UNKNOWN, 'TestModule');
      errorHandler.reportError(error, ErrorCategory.UNKNOWN, 'TestModule');

      const stats = errorHandler.getErrorStats();

      expect(stats.totalErrors).toBe(2);
      expect(stats.recentErrors).toBe(2);
    });
  });

  describe('resetErrorTracking', () => {
    it('should reset error count and timestamps', () => {
      const error = new Error('Test error');

      errorHandler.reportError(error, ErrorCategory.UNKNOWN, 'TestModule');
      expect((errorHandler as any).errorCount).toBe(1);

      errorHandler.resetErrorTracking();

      expect((errorHandler as any).errorCount).toBe(0);
      expect((errorHandler as any).errorTimestamps).toHaveLength(0);
    });

    it('should log reset', () => {
      errorHandler.resetErrorTracking();

      expect(logger.info).toHaveBeenCalledWith(
        'ErrorHandler',
        'Error tracking reset'
      );
    });
  });

  describe('error categorization', () => {
    it('should categorize database errors correctly', () => {
      const error = new Error('SQLite database connection failed');

      errorHandler.reportError(error, ErrorCategory.DATABASE, 'TestModule');

      expect(logger.error).toHaveBeenCalledWith(
        'TestModule',
        expect.any(String),
        error,
        expect.objectContaining({
          category: ErrorCategory.DATABASE,
        })
      );
    });

    it('should categorize network errors correctly', () => {
      const error = new Error('ECONNREFUSED: Connection refused');

      errorHandler.reportError(error, ErrorCategory.NETWORK, 'TestModule');

      expect(logger.error).toHaveBeenCalledWith(
        'TestModule',
        expect.any(String),
        error,
        expect.objectContaining({
          category: ErrorCategory.NETWORK,
        })
      );
    });

    it('should categorize LLM service errors correctly', () => {
      const error = new Error('Ollama service unavailable');

      errorHandler.reportError(error, ErrorCategory.LLM_SERVICE, 'TestModule');

      expect(logger.error).toHaveBeenCalledWith(
        'TestModule',
        expect.any(String),
        error,
        expect.objectContaining({
          category: ErrorCategory.LLM_SERVICE,
        })
      );
    });

    it('should categorize email parsing errors correctly', () => {
      const error = new Error('Failed to parse .eml file');

      errorHandler.reportError(
        error,
        ErrorCategory.EMAIL_PARSING,
        'TestModule'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'TestModule',
        expect.any(String),
        error,
        expect.objectContaining({
          category: ErrorCategory.EMAIL_PARSING,
        })
      );
    });
  });

  describe('error rate tracking', () => {
    it('should track multiple errors', () => {
      const error = new Error('Test error');

      for (let i = 0; i < 5; i++) {
        errorHandler.reportError(error, ErrorCategory.UNKNOWN, 'TestModule');
      }

      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(5);
      expect(stats.recentErrors).toBe(5);
    });

    it('should clean up old error timestamps', () => {
      const error = new Error('Test error');

      // Simulate errors with old timestamps
      const oldTimestamp = Date.now() - 120000; // 2 minutes ago
      for (let i = 0; i < 3; i++) {
        (errorHandler as any).errorTimestamps.push(oldTimestamp);
      }

      // Add recent error
      errorHandler.reportError(error, ErrorCategory.UNKNOWN, 'TestModule');

      const stats = errorHandler.getErrorStats();
      // Old timestamps should be cleaned up, only recent one remains
      expect(stats.recentErrors).toBe(1);
    });
  });
});
