import { app, BrowserWindow, Notification } from 'electron';
import { logger } from './config/logger.js';

/**
 * Single-Instance Lock Manager
 *
 * Enforces single-instance execution per Constitution Principle VI:
 * - Only one instance of the application can run at a time
 * - Second instance attempts focus the existing window
 * - User is notified with "应用已在运行中" message
 *
 * This prevents SQLite database corruption from concurrent access
 * and provides a better user experience.
 */
export class SingleInstanceManager {
  private static hasLock = false;
  private static mainWindow: BrowserWindow | null = null;

  /**
   * Request single-instance lock
   *
   * @returns true if lock was acquired (first instance), false if another instance is running
   */
  static acquireLock(): boolean {
    // Request single instance lock
    this.hasLock = app.requestSingleInstanceLock();

    if (!this.hasLock) {
      // Another instance is already running
      logger.warn('SingleInstance', 'Second instance detected - quitting');
      return false;
    }

    // Register handler for second-instance events
    app.on('second-instance', (_event, commandLine, workingDirectory) => {
      this.onSecondInstance(_event, commandLine, workingDirectory);
    });

    logger.info('SingleInstance', 'Single-instance lock acquired');
    return true;
  }

  /**
   * Set the main window for focus handling
   *
   * @param window - The main application window
   */
  static setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    logger.debug('SingleInstance', 'Main window registered');
  }

  /**
   * Handle second-instance launch attempt
   *
   * @param _event - Second instance event (unused)
   * @param commandLine - Command line arguments from second instance
   * @param workingDirectory - Working directory from second instance
   */
  private static onSecondInstance(_event: Electron.Event, commandLine: string[], workingDirectory: string): void {
    logger.info('SingleInstance', 'Second instance launch detected', {
      commandLine,
      workingDirectory,
    });

    if (this.mainWindow) {
      // Restore window if minimized
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
        logger.debug('SingleInstance', 'Window restored from minimized state');
      }

      // Focus the window
      this.mainWindow.focus();
      logger.debug('SingleInstance', 'Window focused');

      // Show notification to user
      this.showNotification();
    } else {
      logger.warn('SingleInstance', 'Second instance detected but no main window available');
    }
  }

  /**
   * Show notification to user about existing instance
   */
  private static showNotification(): void {
    try {
      const notification = new Notification({
        title: 'mailCopilot',
        body: '应用已在运行中', // Application is already running
        silent: false,
      });

      notification.on('click', () => {
        if (this.mainWindow) {
          this.mainWindow.focus();
        }
      });

      notification.show();
      logger.debug('SingleInstance', 'User notification displayed');
    } catch (error) {
      logger.error('SingleInstance', 'Failed to show notification', error);
    }
  }

  /**
   * Release the single-instance lock (called on quit)
   */
  static releaseLock(): void {
    if (this.hasLock) {
      app.releaseSingleInstanceLock();
      this.hasLock = false;
      logger.info('SingleInstance', 'Single-instance lock released');
    }
  }

  /**
   * Check if we hold the single-instance lock
   */
  static isMainInstance(): boolean {
    return this.hasLock;
  }
}

/**
 * Application Lifecycle Manager
 *
 * Handles high-level application lifecycle:
 * - Single-instance enforcement
 * - Ready state management
 * - Quit handling
 */
export class ApplicationManager {
  private static isReady = false;

  /**
   * Initialize application
   *
   * @returns true if initialization succeeded, false if second instance
   */
  static initialize(): boolean {
    // Acquire single-instance lock first
    if (!SingleInstanceManager.acquireLock()) {
      // Another instance is running - quit immediately
      app.quit();
      return false;
    }

    // Register quit handler
    app.on('before-quit', () => {
      this.onBeforeQuit();
    });

    // Register will-quit handler
    app.on('will-quit', (event) => {
      this.onWillQuit(event);
    });

    logger.info('Application', 'Application manager initialized');
    return true;
  }

  /**
   * Mark application as ready
   */
  static setReady(): void {
    this.isReady = true;
    logger.info('Application', 'Application is ready');
  }

  /**
   * Check if application is ready
   */
  static isAppReady(): boolean {
    return this.isReady;
  }

  /**
   * Handle before-quit event
   */
  private static onBeforeQuit(): void {
    logger.info('Application', 'Application is about to quit');
  }

  /**
   * Handle will-quit event
   */
  private static onWillQuit(_event: Electron.Event): void {
    // Prevent default quit behavior to clean up
    // event.preventDefault(); // Don't prevent - let quit happen

    // Release single-instance lock
    SingleInstanceManager.releaseLock();
  }

  /**
   * Quit the application
   */
  static quit(): void {
    logger.info('Application', 'Application quit requested');
    app.quit();
  }
}

export default { SingleInstanceManager, ApplicationManager };
