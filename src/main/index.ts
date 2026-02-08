import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import DatabaseManager from './database/Database.js';
import { SchemaManager } from './database/schema.js';
import { ConfigManager } from './config/ConfigManager.js';
import { logger } from './config/logger.js';
import { IPC_CHANNELS } from './ipc/channels.js';
import { SingleInstanceManager, ApplicationManager } from './app.js';
import { registerOnboardingHandlers } from './ipc/handlers/onboardingHandler.js';
import { checkForUpdates, downloadAndInstallUpdate } from './app/lifecycle.js';

/**
 * Main Process Entry Point
 *
 * Responsibilities:
 * - Application initialization
 * - Window creation and management
 * - IPC handler registration
 * - Lifecycle management (ready, quit, window-all-closed)
 */

class Application {
  private mainWindow: BrowserWindow | null = null;
  private isQuitting = false;

  constructor() {
    // Initialize application manager and check for single-instance
    if (!ApplicationManager.initialize()) {
      // Second instance detected - quit immediately
      // (This will never return as app.quit() is called)
      throw new Error('Second instance detected - exiting');
    }

    this.setupEventHandlers();
  }

  /**
   * Setup application event handlers
   */
  private setupEventHandlers(): void {
    // App ready event
    app.whenReady().then(() => this.onReady());

    // Window all closed event
    app.on('window-all-closed', () => this.onWindowAllClosed());

    // App before quit event
    app.on('before-quit', () => this.onBeforeQuit());

    // App activation (macOS)
    app.on('activate', () => this.onActivate());
  }

  /**
   * Initialize application when ready
   */
  private async onReady(): Promise<void> {
    try {
      // Application is starting (logger auto-initializes via electron-log)
      logger.info('Application', 'Application starting up');

      // Initialize database
      DatabaseManager.initialize();
      logger.info('Database', 'Database initialized');

      // Initialize schema
      await SchemaManager.initialize();
      logger.info('Schema', 'Schema initialized');

      // Initialize config manager
      await ConfigManager.initialize();
      await ConfigManager.initializeDefaults();
      logger.info('Config', 'Configuration initialized');

      // Setup IPC handlers
      this.setupIPCHandlers();
      logger.info('IPC', 'IPC handlers registered');

      // Create main window
      this.createMainWindow();
      logger.info('Window', 'Main window created');

      // Check for updates (if in remote mode)
      const config = await ConfigManager.get(['llm.mode']);
      if (config['llm.mode'] === 'remote') {
        // TODO: Implement update check
        logger.info('Update', 'Auto-update check skipped (not implemented yet)');
      }

      // Mark application as ready
      ApplicationManager.setReady();
    } catch (error) {
      logger.error('Application', 'Failed to initialize application', error);
      throw error;
    }
  }

  /**
   * Create main application window
   */
  private createMainWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(__dirname, '../../electron/preload.js'),
      },
      show: false, // Don't show until ready
    });

    // Load renderer
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.loadURL('http://localhost:3000');
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(
        path.join(__dirname, '../renderer/index.html')
      );
    }

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      logger.info('Window', 'Main window shown');
    });

    // Register window with single-instance manager
    SingleInstanceManager.setMainWindow(this.mainWindow);

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      logger.info('Window', 'Main window closed');
    });

    // Log renderer errors
    this.mainWindow.webContents.on('render-process-gone', (_event, details) => {
      logger.error('Renderer', `Render process gone: ${details.reason}`, details);
    });
  }

  /**
   * Setup IPC handlers
   */
  private setupIPCHandlers(): void {
    // Register onboarding handlers (T018b - Constitution Principle I)
    const db = DatabaseManager.getDatabase();
    registerOnboardingHandlers(db);
    logger.info('IPC', 'Onboarding handlers registered');

    // Placeholder handlers for remaining IPC channels
    // Full implementation will be in user stories

    // LLM generate
    ipcMain.handle(IPC_CHANNELS.LLM_GENERATE, async (_event, _request) => {
      logger.debug('IPC', 'LLM generate request received');
      // TODO: Implement in US1
      return { success: false, error: 'NOT_IMPLEMENTED' };
    });

    // Database query history
    ipcMain.handle(IPC_CHANNELS.DB_QUERY_HISTORY, async (_event, _request) => {
      logger.debug('IPC', 'Database query history request received');
      // TODO: Implement in US1 - query daily_reports / todo_items by reportDate
      return [];
    });

    // Database export
    ipcMain.handle(IPC_CHANNELS.DB_EXPORT, async (_event, _request) => {
      logger.debug('IPC', 'Database export request received');
      // TODO: Implement in Polish phase
      return { success: false, error: 'NOT_IMPLEMENTED' };
    });

    // Config get
    ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async (_event, request) => {
      logger.debug('IPC', 'Config get request received');
      const keys = request?.keys;
      return { config: await ConfigManager.get(keys) };
    });

    // Config set
    ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_event, request) => {
      logger.debug('IPC', 'Config set request received');
      const updated = await ConfigManager.set(request.updates);
      return { success: true, updated };
    });

    // App check update
    ipcMain.handle(IPC_CHANNELS.APP_CHECK_UPDATE, async (_event, request?: { manual?: boolean }) => {
      logger.debug('IPC', 'Update check request received');
      const manual = request?.manual ?? false;
      const result = await checkForUpdates(manual);
      return {
        success: result.success,
        hasUpdate: result.hasUpdate,
        version: result.version,
        releaseDate: result.releaseDate,
        releaseNotes: result.releaseNotes,
        error: result.error,
      };
    });

    // App download and install update
    ipcMain.handle(IPC_CHANNELS.APP_DOWNLOAD_UPDATE, async () => {
      logger.debug('IPC', 'Download update request received');
      await downloadAndInstallUpdate();
      return { success: true };
    });

    // Email fetch metadata
    ipcMain.handle(IPC_CHANNELS.EMAIL_FETCH_META, async (_event, _request) => {
      logger.debug('IPC', 'Email metadata fetch request received');
      // TODO: Implement in US4
      return { success: false, error: 'NOT_IMPLEMENTED' };
    });

    // Feedback submit
    ipcMain.handle(IPC_CHANNELS.FEEDBACK_SUBMIT, async (_event, _request) => {
      logger.debug('IPC', 'Feedback submit request received');
      // TODO: Implement in US3
      return { success: false, error: 'NOT_IMPLEMENTED' };
    });

    // Feedback stats
    ipcMain.handle(IPC_CHANNELS.FEEDBACK_STATS, async (_event) => {
      logger.debug('IPC', 'Feedback stats request received');
      // TODO: Implement in US3
      return { total: 0, byType: {} };
    });

    // Feedback destroy
    ipcMain.handle(IPC_CHANNELS.FEEDBACK_DESTROY, async (_event) => {
      logger.debug('IPC', 'Feedback destroy request received');
      // TODO: Implement in US3
      return { success: false, error: 'NOT_IMPLEMENTED' };
    });

    // Onboarding get status / acknowledge are registered by registerOnboardingHandlers() above

    logger.info('IPC', 'All IPC handlers registered');
  }

  /**
   * Handle window-all-closed event
   */
  private onWindowAllClosed(): void {
    // On macOS, keep app running even when all windows are closed
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }

  /**
   * Handle before-quit event
   */
  private onBeforeQuit(): void {
    this.isQuitting = true;
    logger.info('Application', 'Application quitting');

    // Close database connection
    DatabaseManager.close();
    logger.info('Database', 'Database connection closed');
  }

  /**
   * Handle activate event (macOS dock click)
   */
  private onActivate(): void {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      this.createMainWindow();
    }
  }

  /**
   * Check if application is quitting
   */
  public isAppQuitting(): boolean {
    return this.isQuitting;
  }
}

// Initialize application
new Application();

export default Application;
