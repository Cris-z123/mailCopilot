/**
 * electron-log v5 Configuration
 *
 * Structured logging for mailCopilot application
 * Features:
 * - Structured JSON output (error type, module, message, timestamp, context)
 * - Log levels: DEBUG, INFO, WARN, ERROR
 * - File and console output with automatic log rotation
 * - Cross-platform path handling
 */

import log from 'electron-log';
import { app } from 'electron';
import path from 'path';

/**
 * Check if running in test environment
 */
function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

/**
 * Initialize electron-log transports
 */
function initializeLogger(): void {
  // Skip file transport initialization in test environment
  if (isTestEnvironment()) {
    // Configure console transport only for tests
    (log.transports.console as any).level = 'debug';
    return;
  }

  // Ensure logs directory exists
  const logsDir = path.join(app.getPath('userData'), '.mailcopilot', 'logs');

  // Configure file transport
  (log.transports.file as any).level = 'debug';
  (log.transports.file as any).format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{processType}] {text}';
  (log.transports.file as any).maxSize = 10 * 1024 * 1024; // 10MB per file
  (log.transports.file as any).file = path.join(logsDir, 'main.log');

  // Configure console transport for development
  if (process.env.NODE_ENV === 'development') {
    (log.transports.console as any).level = 'debug';
  } else {
    (log.transports.console as any).level = 'info';
  }
}

// Initialize logger on module load
initializeLogger();

/**
 * Structured logging helper
 * Provides consistent logging interface across the application
 */
export const logger = {
  /**
   * Log debug message
   * @param module - Module name (e.g., 'LLMAdapter', 'Database')
   * @param message - Log message
   * @param context - Additional context metadata
   */
  debug: (module: string, message: string, context?: Record<string, any>) => {
    log.debug({
      level: 'DEBUG',
      module,
      message,
      timestamp: Date.now(),
      ...context,
    });
  },

  /**
   * Log info message
   * @param module - Module name
   * @param message - Log message
   * @param context - Additional context metadata
   */
  info: (module: string, message: string, context?: Record<string, any>) => {
    log.info({
      level: 'INFO',
      module,
      message,
      timestamp: Date.now(),
      ...context,
    });
  },

  /**
   * Log warning message
   * @param module - Module name
   * @param message - Log message
   * @param context - Additional context metadata
   */
  warn: (module: string, message: string, context?: Record<string, any>) => {
    log.warn({
      level: 'WARN',
      module,
      message,
      timestamp: Date.now(),
      ...context,
    });
  },

  /**
   * Log error message
   * @param module - Module name
   * @param message - Log message
   * @param error - Error object (optional)
   * @param context - Additional context metadata
   */
  error: (
    module: string,
    message: string,
    error?: Error | unknown,
    context?: Record<string, any>
  ) => {
    const errorData: Record<string, any> = {};

    if (error instanceof Error) {
      errorData.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    } else if (error) {
      errorData.error = String(error);
    }

    log.error({
      level: 'ERROR',
      module,
      message,
      timestamp: Date.now(),
      ...errorData,
      ...context,
    });
  },
};

/**
 * Set context ID for request tracing (optional enhancement)
 * @param contextId - Unique identifier for request/context
 */
export function setContextId(contextId: string): void {
  (log.transports.file as any).format = `[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [${contextId}] [{processType}] {text}`;
}

/**
 * Clear context ID
 */
export function clearContextId(): void {
  (log.transports.file as any).format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{processType}] {text}';
}

export default log;
