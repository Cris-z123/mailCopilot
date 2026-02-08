/**
 * Global Error Handler for mailCopilot Application
 *
 * Per plan v2.7 Polish Phase:
 * - Catch unhandled errors (uncaughtException, unhandledRejection)
 * - Log with context (error type, module, message, timestamp, context ID)
 * - Show user-friendly error messages (non-technical, actionable)
 *
 * Per Constitution Principle VII (Observability & Performance):
 * - Structured logging format
 * - No sensitive data in error logs
 * - Memory cleanup after error handling
 *
 * @module main/error-handler
 */

import { app, BrowserWindow, dialog } from 'electron';
import { logger } from './config/logger.js';

/**
 * Error severity levels for user-facing messages
 */
export enum ErrorSeverity {
  /** Application can continue running */
  WARNING = 'warning',

  /** Feature unavailable but app stable */
  ERROR = 'error',

  /** Critical error, app may become unstable */
  CRITICAL = 'critical',
}

/**
 * Error categories for better error handling
 */
export enum ErrorCategory {
  /** Database/Storage errors */
  DATABASE = 'database',

  /** LLM service errors */
  LLM_SERVICE = 'llm_service',

  /** Email parsing errors */
  EMAIL_PARSING = 'email_parsing',

  /** Network/IPC errors */
  NETWORK = 'network',

  /** Configuration errors */
  CONFIGURATION = 'configuration',

  /** File system errors */
  FILESYSTEM = 'filesystem',

  /** Renderer process errors */
  RENDERER = 'renderer',

  /** Unknown/uncategorized errors */
  UNKNOWN = 'unknown',
}

/**
 * Structured error information for logging
 */
export interface ErrorInfo {
  /** Error category */
  category: ErrorCategory;

  /** Error severity */
  severity: ErrorSeverity;

  /** User-friendly error message (non-technical) */
  userMessage: string;

  /** Technical error message for logging */
  technicalMessage: string;

  /** Module where error occurred */
  module: string;

  /** Original error object */
  error: Error;

  /** Additional context */
  context?: Record<string, any>;

  /** Timestamp */
  timestamp: number;
}

/**
 * User-friendly error messages by error category
 */
const USER_FRIENDLY_MESSAGES: Record<ErrorCategory, string> = {
  [ErrorCategory.DATABASE]: '数据库错误，部分功能可能无法使用',
  [ErrorCategory.LLM_SERVICE]: 'AI服务连接失败，请检查网络或模式设置',
  [ErrorCategory.EMAIL_PARSING]: '邮件解析失败，请检查文件格式是否正确',
  [ErrorCategory.NETWORK]: '网络连接错误，请检查网络设置',
  [ErrorCategory.CONFIGURATION]: '配置错误，请重新设置应用配置',
  [ErrorCategory.FILESYSTEM]: '文件访问错误，请检查文件权限',
  [ErrorCategory.RENDERER]: '界面错误，请刷新页面或重启应用',
  [ErrorCategory.UNKNOWN]: '发生未知错误，请重启应用重试',
};

/**
 * Global error handler class
 *
 * Registers handlers for:
 * - uncaughtException: Synchronous errors in Node.js
 * - unhandledRejection: Unhandled Promise rejections
 * - render-process-gone: Renderer process crashes
 *
 * All errors are logged with structured context and
 * user-friendly error messages are shown when appropriate.
 */
class GlobalErrorHandler {
  private mainWindow: BrowserWindow | null = null;
  private errorCount = 0;
  private readonly MAX_ERRORS_BEFORE_EXIT = 10;
  private errorTimestamps: number[] = [];

  /**
   * Initialize global error handlers
   *
   * Should be called once during application startup.
   */
  initialize(): void {
    // Register uncaught exception handler
    process.on('uncaughtException', (error: Error) =>
      this.handleUncaughtException(error)
    );

    // Register unhandled rejection handler
    process.on('unhandledRejection', (reason: unknown) =>
      this.handleUnhandledRejection(reason)
    );

    logger.info('ErrorHandler', 'Global error handlers registered');
  }

  /**
   * Set main window reference for error dialogs
   *
   * @param window - Main application window
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * Handle uncaught exceptions
   *
   * These are synchronous errors that were not caught by try-catch.
   * They indicate a serious bug and may leave the application in an
   * unstable state. Log the error and show user-friendly dialog.
   *
   * @param error - Uncaught error object
   */
  private handleUncaughtException(error: Error): void {
    const category = this.categorizeError(error);
    const errorInfo: ErrorInfo = {
      category,
      severity: ErrorSeverity.CRITICAL,
      userMessage: USER_FRIENDLY_MESSAGES[category],
      technicalMessage: error.message || 'Unknown error',
      module: 'MainProcess',
      error,
      timestamp: Date.now(),
    };

    // Log with structured context
    logger.error('ErrorHandler', 'Uncaught exception', error, {
      category: errorInfo.category,
      severity: errorInfo.severity,
      module: errorInfo.module,
    });

    // Track error rate
    this.trackError();

    // Show user-friendly dialog
    this.showErrorDialog(errorInfo);

    // Don't exit immediately - give user time to save work
    // But exit if too many errors occur (prevent error loops)
    if (this.errorCount >= this.MAX_ERRORS_BEFORE_EXIT) {
      logger.error('ErrorHandler', 'Too many errors, exiting application');
      app.quit();
    }
  }

  /**
   * Handle unhandled promise rejections
   *
   * These are Promise rejections that were not caught by .catch()
   * handler. They may not be fatal but indicate missing error handling.
   *
   * @param reason - Rejection reason (error or other value)
   */
  private handleUnhandledRejection(reason: unknown): void {
    const error =
      reason instanceof Error ? reason : new Error(String(reason));

    const errorInfo: ErrorInfo = {
      category: this.categorizeError(error),
      severity: ErrorSeverity.ERROR,
      userMessage: USER_FRIENDLY_MESSAGES[this.categorizeError(error)],
      technicalMessage: error.message || 'Unhandled promise rejection',
      module: 'MainProcess',
      error,
      timestamp: Date.now(),
    };

    // Log with structured context
    logger.error('ErrorHandler', 'Unhandled promise rejection', error, {
      category: errorInfo.category,
      severity: errorInfo.severity,
      module: errorInfo.module,
    });

    // Track error rate (but less critical than uncaught exceptions)
    this.trackError();

    // Show notification for serious errors
    if (errorInfo.severity === ErrorSeverity.CRITICAL) {
      this.showErrorDialog(errorInfo);
    }
  }

  /**
   * Handle renderer process crashes
   *
   * Called when renderer process terminates unexpectedly.
   *
   * @param details - Render process gone details
   */
  handleRendererProcessGone(details: Electron.RenderProcessGoneDetails): void {
    const errorInfo: ErrorInfo = {
      category: ErrorCategory.RENDERER,
      severity: ErrorSeverity.CRITICAL,
      userMessage: USER_FRIENDLY_MESSAGES[ErrorCategory.RENDERER],
      technicalMessage: `Renderer process gone: ${details.reason}`,
      module: 'RendererProcess',
      error: new Error(details.reason),
      context: {
        reason: details.reason,
        exitCode: details.exitCode,
      },
      timestamp: Date.now(),
    };

    // Log with structured context
    logger.error('ErrorHandler', 'Renderer process gone', errorInfo.error, {
      category: errorInfo.category,
      severity: errorInfo.severity,
      reason: details.reason,
      exitCode: details.exitCode,
    });

    // Track error rate
    this.trackError();

    // Show user-friendly dialog
    this.showErrorDialog(errorInfo);
  }

  /**
   * Show error dialog to user
   *
   * Displays a user-friendly error message using Electron's dialog API.
   * Non-technical, actionable message for end users.
   *
   * @param errorInfo - Structured error information
   */
  private showErrorDialog(errorInfo: ErrorInfo): void {
    // Don't show dialogs in test environment
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return;
    }

    // Don't show dialog if no window (e.g., during startup)
    if (!this.mainWindow && !app.isReady()) {
      return;
    }

    // User-friendly message with actionable guidance
    const message = `${errorInfo.userMessage}\n\n如果问题持续存在，请重启应用。`;

    dialog.showErrorBox('应用程序错误', message);
  }

  /**
   * Categorize error by error type and message
   *
   * Analyzes error to determine which category it belongs to.
   * This helps provide more specific user-friendly messages.
   *
   * @param error - Error object to categorize
   * @returns Error category
   */
  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // Database errors
    if (
      message.includes('database') ||
      message.includes('sqlite') ||
      message.includes('db') ||
      stack.includes('database')
    ) {
      return ErrorCategory.DATABASE;
    }

    // LLM service errors
    if (
      message.includes('llm') ||
      message.includes('ollama') ||
      message.includes('openai') ||
      message.includes('ai service')
    ) {
      return ErrorCategory.LLM_SERVICE;
    }

    // Email parsing errors
    if (
      message.includes('email') ||
      message.includes('parse') ||
      message.includes('eml') ||
      message.includes('msg')
    ) {
      return ErrorCategory.EMAIL_PARSING;
    }

    // Network errors
    if (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('timeout')
    ) {
      return ErrorCategory.NETWORK;
    }

    // File system errors
    if (
      message.includes('enoent') ||
      message.includes('eacces') ||
      message.includes('file') ||
      message.includes('directory')
    ) {
      return ErrorCategory.FILESYSTEM;
    }

    // Configuration errors
    if (
      message.includes('config') ||
      message.includes('setting') ||
      message.includes('preference')
    ) {
      return ErrorCategory.CONFIGURATION;
    }

    // Default to unknown
    return ErrorCategory.UNKNOWN;
  }

  /**
   * Track error occurrences to detect error loops
   *
   * If too many errors occur in a short time, it indicates
   * an error loop that requires application restart.
   */
  private trackError(): void {
    this.errorCount++;
    const now = Date.now();
    this.errorTimestamps.push(now);

    // Remove timestamps older than 1 minute
    this.errorTimestamps = this.errorTimestamps.filter(
      (timestamp) => now - timestamp < 60000
    );

    // Log if error rate is high
    if (this.errorTimestamps.length > 5) {
      logger.warn('ErrorHandler', 'High error rate detected', {
        errorCount: this.errorCount,
        recentErrors: this.errorTimestamps.length,
      });
    }
  }

  /**
   * Manually report an error with context
   *
   * Allows any part of the application to report errors
   * with proper logging and user notification.
   *
   * @param error - Error object
   * @param category - Error category
   * @param module - Module where error occurred
   * @param context - Additional context
   */
  reportError(
    error: Error,
    category: ErrorCategory,
    module: string,
    context?: Record<string, any>
  ): void {
    const errorInfo: ErrorInfo = {
      category,
      severity: this.determineSeverity(error, category),
      userMessage: USER_FRIENDLY_MESSAGES[category],
      technicalMessage: error.message,
      module,
      error,
      context,
      timestamp: Date.now(),
    };

    // Log with structured context
    logger.error(module, errorInfo.technicalMessage, error, {
      category: errorInfo.category,
      severity: errorInfo.severity,
      ...context,
    });

    // Track error
    this.trackError();

    // Show dialog for critical errors
    if (errorInfo.severity === ErrorSeverity.CRITICAL) {
      this.showErrorDialog(errorInfo);
    }
  }

  /**
   * Determine error severity based on category and error
   *
   * @param error - Error object
   * @param category - Error category
   * @returns Error severity
   */
  private determineSeverity(
    _error: Error,
    category: ErrorCategory
  ): ErrorSeverity {
    // Renderer and database errors are critical
    if (
      category === ErrorCategory.RENDERER ||
      category === ErrorCategory.DATABASE
    ) {
      return ErrorSeverity.CRITICAL;
    }

    // Network and LLM service errors are warnings (can retry)
    if (
      category === ErrorCategory.NETWORK ||
      category === ErrorCategory.LLM_SERVICE
    ) {
      return ErrorSeverity.WARNING;
    }

    // Default to error
    return ErrorSeverity.ERROR;
  }

  /**
   * Get error statistics
   *
   * @returns Error count and recent error timestamps
   */
  getErrorStats(): { totalErrors: number; recentErrors: number } {
    return {
      totalErrors: this.errorCount,
      recentErrors: this.errorTimestamps.length,
    };
  }

  /**
   * Reset error tracking
   *
   * Called after application stabilizes or on user action.
   */
  resetErrorTracking(): void {
    this.errorCount = 0;
    this.errorTimestamps = [];
    logger.info('ErrorHandler', 'Error tracking reset');
  }
}

// Export singleton instance
export const errorHandler = new GlobalErrorHandler();

export default errorHandler;
