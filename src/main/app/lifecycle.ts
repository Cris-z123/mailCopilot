/**
 * Application Lifecycle Management
 *
 * Handles application lifecycle events including auto-update checks.
 * Per plan.md FR-038, FR-039: Remote mode checks on startup, local mode requires manual trigger.
 *
 * @module main/app/lifecycle
 */

import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { logger } from '../config/logger.js';
import { getModeManager, ProcessingMode } from './mode-manager.js';

/**
 * Update check result
 */
export interface UpdateCheckResult {
  success: boolean;
  hasUpdate: boolean;
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  error?: string;
}

/**
 * Auto-updater configuration
 */
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'your-username', // TODO: Replace with actual GitHub username
  repo: 'mailCopilot',
});

autoUpdater.autoDownload = false; // Ask user before downloading
autoUpdater.autoInstallOnAppQuit = false; // Ask user before installing

/**
 * Check for updates
 *
 * @param manual - Whether this is a manual check (shows notification even if no update)
 * @returns Promise with update check result
 *
 * Per FR-038: Remote mode checks on startup
 * Per FR-039: Local mode requires manual trigger
 */
export async function checkForUpdates(manual: boolean = false): Promise<UpdateCheckResult> {
  try {
    logger.info('Lifecycle', 'Checking for updates', { manual });

    // Check if update is available
    const updateInfo = await autoUpdater.checkForUpdates();

    if (!updateInfo) {
      logger.info('Lifecycle', 'No updates available');

      return {
        success: true,
        hasUpdate: false,
      };
    }

    const { version, releaseDate, releaseNotes } = updateInfo.updateInfo;

    logger.info('Lifecycle', 'Update available', {
      version,
      releaseDate,
    });

    return {
      success: true,
      hasUpdate: true,
      version,
      releaseDate,
      releaseNotes: Array.isArray(releaseNotes) ? releaseNotes.join('\n') : releaseNotes,
    };
  } catch (error) {
    logger.error('Lifecycle', 'Update check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      hasUpdate: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Download and install update
 *
 * Downloads the update and prompts user to install on quit.
 */
export async function downloadAndInstallUpdate(): Promise<void> {
  try {
    logger.info('Lifecycle', 'Downloading update');

    // Download update
    await autoUpdater.downloadUpdate();

    logger.info('Lifecycle', 'Update downloaded, ready to install');

    // Set auto-install on quit
    autoUpdater.autoInstallOnAppQuit = true;

    // Notify user that update is ready to install
    // TODO: Send IPC event to renderer to show update ready notification
  } catch (error) {
    logger.error('Lifecycle', 'Failed to download update', {
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Initialize application lifecycle handlers
 *
 * Sets up auto-update checks based on current mode.
 * Remote mode: checks on startup per FR-038.
 * Local mode: disables auto-check per FR-039.
 *
 * @param mainWindow - Main BrowserWindow instance
 */
export function initializeLifecycle(mainWindow: BrowserWindow): void {
  const modeManager = getModeManager();
  const currentMode = modeManager.getCurrentMode();

  logger.info('Lifecycle', 'Initializing lifecycle handlers', {
    mode: currentMode,
  });

  /**
   * App ready event
   */
  app.whenReady().then(() => {
    logger.info('Lifecycle', 'Application ready');

    // Check for updates on startup in remote mode only
    if (currentMode === 'remote') {
      logger.info('Lifecycle', 'Remote mode: scheduling startup update check');

      // Delay update check by 5 seconds to not block app startup
      setTimeout(() => {
        checkStartupUpdates(mainWindow);
      }, 5000);
    } else {
      logger.info('Lifecycle', 'Local mode: auto-update check disabled (manual trigger required)');
    }
  });

  /**
   * Auto-updater events
   */

  // Update available
  autoUpdater.on('update-available', (info) => {
    logger.info('Lifecycle', 'Update available event', {
      version: info.version,
      releaseDate: info.releaseDate,
    });

    // Send notification to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      });
    }
  });

  // Update not available
  autoUpdater.on('update-not-available', (info) => {
    logger.info('Lifecycle', 'No updates available');

    // Send notification to renderer (for manual checks)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available', {
        version: app.getVersion(),
      });
    }
  });

  // Update downloaded
  autoUpdater.on('update-downloaded', (info) => {
    logger.info('Lifecycle', 'Update downloaded', {
      version: info.version,
    });

    // Send notification to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
      });
    }
  });

  // Update error
  autoUpdater.on('error', (error) => {
    logger.error('Lifecycle', 'Auto-updater error', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Send error notification to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * Mode change event
   * Re-evaluate auto-update policy when mode changes
   */
  modeManager.on('mode-changed', (event: any) => {
    const newMode = event.to as ProcessingMode;

    logger.info('Lifecycle', 'Mode changed', {
      from: event.from,
      to: newMode,
    });

    // Note: We don't automatically trigger update checks on mode switch
    // Users can manually check in Settings if needed
  });
}

/**
 * Check for updates on application startup (remote mode only)
 *
 * Silently checks for updates without blocking app startup.
 * Shows notification only if update is available.
 *
 * Per FR-038: Remote mode checks on startup
 *
 * @param mainWindow - Main BrowserWindow instance
 */
async function checkStartupUpdates(mainWindow: BrowserWindow): Promise<void> {
  try {
    logger.info('Lifecycle', 'Performing startup update check');

    const result = await checkForUpdates(false); // Not manual, silent check

    if (result.success && result.hasUpdate) {
      logger.info('Lifecycle', 'Update available on startup', {
        version: result.version,
      });

      // Send notification to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', {
          version: result.version,
          releaseDate: result.releaseDate,
          releaseNotes: result.releaseNotes,
        });
      }
    } else if (result.success) {
      logger.info('Lifecycle', 'No updates available on startup');
    } else {
      logger.warn('Lifecycle', 'Startup update check failed', {
        error: result.error,
      });
    }
  } catch (error) {
    logger.error('Lifecycle', 'Startup update check error', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Enable auto-update checks (for mode switches to remote)
 *
 * Called when user switches from local to remote mode.
 * Does not immediately check for updates, but allows subsequent startup checks.
 */
export function enableAutoUpdateChecks(): void {
  logger.info('Lifecycle', 'Auto-update checks enabled (remote mode)');
}

/**
 * Disable auto-update checks (for mode switches to local)
 *
 * Called when user switches from remote to local mode.
 * Disables automatic update checks per FR-039.
 */
export function disableAutoUpdateChecks(): void {
  logger.info('Lifecycle', 'Auto-update checks disabled (local mode per FR-039)');
}

/**
 * Get current application version
 *
 * @returns Application version string
 */
export function getAppVersion(): string {
  return app.getVersion();
}

/**
 * Get current platform information
 *
 * @returns Platform info for update compatibility
 */
export function getPlatformInfo(): {
  platform: NodeJS.Platform;
  arch: string;
  version: string;
} {
  return {
    platform: process.platform,
    arch: process.arch,
    version: process.version,
  };
}

export default {
  initializeLifecycle,
  checkForUpdates,
  downloadAndInstallUpdate,
  enableAutoUpdateChecks,
  disableAutoUpdateChecks,
  getAppVersion,
  getPlatformInfo,
};
