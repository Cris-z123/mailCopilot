import fs from 'fs';
import path from 'path';
import { app } from 'electron';

/**
 * Structured Logger
 *
 * Features:
 * - Structured logging format (error type, module, message, timestamp, context ID)
 * - Log levels: DEBUG, INFO, WARN, ERROR
 * - File and console output
 * - Context ID for request tracing
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  timestamp: number;
  contextId?: string;
  stackTrace?: string;
  metadata?: Record<string, any>;
}

/**
 * Structured logger for consistent logging across the application
 */
export class StructuredLogger {
  private static logLevel: LogLevel = this.getLogLevelFromEnv();
  private static logFilePath: string | null = null;
  private static contextId: string | null = null;

  /**
   * Initialize logger
   * - Creates logs directory
   * - Sets up log file
   */
  static initialize(): void {
    const userDataPath = app.getPath('userData');
    const logsDir = path.join(userDataPath, '.mailcopilot', 'logs');

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFileName = `app-${this.getDateString()}.log`;
    this.logFilePath = path.join(logsDir, logFileName);
  }

  /**
   * Log a message at specified level
   */
  static log(
    level: LogLevel,
    module: string,
    message: string,
    metadata?: Record<string, any>
  ): void {
    // Skip if log level is too low
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      module,
      message,
      timestamp: Date.now(),
      contextId: this.contextId || undefined,
      metadata,
    };

    // Format log entry
    const formatted = this.formatEntry(entry);

    // Output to console
    this.logToConsole(level, formatted);

    // Output to file
    this.logToFile(formatted);

    // Store in database (for ERROR level only)
    if (level === 'ERROR') {
      this.logToDatabase(entry);
    }
  }

  /**
   * Log debug message
   */
  static debug(module: string, message: string, metadata?: Record<string, any>): void {
    this.log('DEBUG', module, message, metadata);
  }

  /**
   * Log info message
   */
  static info(module: string, message: string, metadata?: Record<string, any>): void {
    this.log('INFO', module, message, metadata);
  }

  /**
   * Log warning message
   */
  static warn(module: string, message: string, metadata?: Record<string, any>): void {
    this.log('WARN', module, message, metadata);
  }

  /**
   * Log error message
   */
  static error(
    module: string,
    message: string,
    error?: Error | unknown,
    metadata?: Record<string, any>
  ): void {
    let stackTrace: string | undefined;

    if (error instanceof Error) {
      stackTrace = error.stack;
    } else if (typeof error === 'string') {
      metadata = { ...metadata, error };
    }

    this.log('ERROR', module, message, {
      ...metadata,
      error: error instanceof Error ? error.message : String(error),
      stackTrace,
    });
  }

  /**
   * Set context ID for request tracing
   */
  static setContextId(contextId: string): void {
    this.contextId = contextId;
  }

  /**
   * Clear context ID
   */
  static clearContextId(): void {
    this.contextId = null;
  }

  /**
   * Get context ID
   */
  static getContextId(): string | null {
    return this.contextId;
  }

  /**
   * Create a child logger with inherited context
   */
  static createChild(contextId: string): StructuredLoggerClass {
    return new StructuredLoggerClass(contextId);
  }

  /**
   * Format log entry as string
   */
  private static formatEntry(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString();
    const context = entry.contextId ? `[${entry.contextId}]` : '';
    const metadata = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';

    return `[${timestamp}] [${entry.level}] [${entry.module}]${context} ${entry.message}${metadata}`;
  }

  /**
   * Output to console with colors
   */
  private static logToConsole(level: LogLevel, message: string): void {
    const colors = {
      DEBUG: '\x1b[36m', // Cyan
      INFO: '\x1b[32m',  // Green
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m', // Red
    };
    const reset = '\x1b[0m';

    const color = colors[level];
    console.log(`${color}${message}${reset}`);
  }

  /**
   * Output to log file
   */
  private static logToFile(message: string): void {
    if (!this.logFilePath) {
      return;
    }

    try {
      fs.appendFileSync(this.logFilePath, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Store error in database
   */
  private static logToDatabase(entry: LogEntry): void {
    // Avoid circular dependency
    import('../database/Database.js').then(({ default: DatabaseManager }) => {
      try {
        const db = DatabaseManager.getDatabase();

        db.prepare(
          'INSERT INTO app_logs (level, module, message, timestamp, context_id, stack_trace) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(
          entry.level,
          entry.module,
          entry.message,
          entry.timestamp,
          entry.contextId || null,
          entry.metadata?.stackTrace || null
        );
      } catch (error) {
        // Can't log this error or we'll get infinite recursion
        console.error('Failed to store error log in database:', error);
      }
    });
  }

  /**
   * Check if message should be logged based on level
   */
  private static shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Get log level from environment
   */
  private static getLogLevelFromEnv(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();

    if (envLevel === 'DEBUG' || envLevel === 'INFO' || envLevel === 'WARN' || envLevel === 'ERROR') {
      return envLevel;
    }

    return 'INFO'; // Default
  }

  /**
   * Get current date string for log file name
   */
  private static getDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
  }
}

/**
 * Per-context logger class
 */
export class StructuredLoggerClass {
  private contextId: string;

  constructor(contextId: string) {
    this.contextId = contextId;
  }

  debug(module: string, message: string, metadata?: Record<string, any>): void {
    StructuredLogger.setContextId(this.contextId);
    StructuredLogger.debug(module, message, metadata);
    StructuredLogger.clearContextId();
  }

  info(module: string, message: string, metadata?: Record<string, any>): void {
    StructuredLogger.setContextId(this.contextId);
    StructuredLogger.info(module, message, metadata);
    StructuredLogger.clearContextId();
  }

  warn(module: string, message: string, metadata?: Record<string, any>): void {
    StructuredLogger.setContextId(this.contextId);
    StructuredLogger.warn(module, message, metadata);
    StructuredLogger.clearContextId();
  }

  error(module: string, message: string, error?: Error | unknown, metadata?: Record<string, any>): void {
    StructuredLogger.setContextId(this.contextId);
    StructuredLogger.error(module, message, error, metadata);
    StructuredLogger.clearContextId();
  }
}

export default StructuredLogger;
