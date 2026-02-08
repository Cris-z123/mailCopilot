/**
 * Mode Switching IPC Handler
 *
 * Handles IPC communication for hot mode switching between local and remote LLM modes.
 * Per plan.md FR-033, FR-034, FR-035: Mode switches wait for batch completion,
 * queue new tasks, and notify user of pending switch.
 *
 * @module main/ipc/handlers/mode.handler
 */

import { ipcMain, BrowserWindow } from 'electron';
import { logger } from '../../config/logger.js';
import { IPC_CHANNELS } from '../channels.js';
import { getModeManager, type ProcessingMode } from '../../app/mode-manager.js';

/**
 * Mode status response
 */
interface ModeStatusResponse {
  currentMode: ProcessingMode;
  pendingMode: ProcessingMode | null;
  isProcessing: boolean;
  switchQueued: boolean;
}

/**
 * Mode switch request
 */
interface ModeSwitchRequest {
  mode: ProcessingMode;
}

/**
 * Mode switch response
 */
interface ModeSwitchResponse {
  success: boolean;
  switchedImmediately: boolean;
  currentMode: ProcessingMode;
  pendingMode: ProcessingMode | null;
  message: string;
}

/**
 * Mode switch cancelled response
 */
interface ModeCancelResponse {
  success: boolean;
  message: string;
}

/**
 * Get ModeManager instance
 */
const modeManager = getModeManager();

/**
 * Register mode switching IPC handlers
 *
 * Sets up IPC channel listeners for mode switching operations.
 * Must be called during application initialization (main/index.ts).
 *
 * Per plan.md IPC channel definitions:
 * - mode:get - Get current mode status
 * - mode:switch - Request mode switch
 * - mode:cancel - Cancel pending mode switch
 *
 * Per FR-033: Wait for batch completion before switching
 * Per FR-034: Queue new tasks during switch
 * Per FR-035: Notify user of pending switch
 *
 * Usage:
 * ```typescript
 * import { registerModeHandlers } from './ipc/handlers/mode.handler.js';
 *
 * registerModeHandlers();
 * ```
 */
export function registerModeHandlers(): void {
  logger.info('ModeHandler', 'Registering mode switching IPC handlers', {
    channels: [IPC_CHANNELS.MODE_GET, IPC_CHANNELS.MODE_SWITCH, IPC_CHANNELS.MODE_CANCEL],
  });

  // Register mode:get handler
  ipcMain.handle(IPC_CHANNELS.MODE_GET, async () => {
    logger.debug('ModeHandler', 'Received mode:get request');

    try {
      const currentMode = modeManager.getCurrentMode();
      const pendingMode = modeManager.getPendingSwitch();
      const isProcessing = modeManager.isBatchProcessing();
      const switchQueued = modeManager.hasPendingSwitch();

      const response: ModeStatusResponse = {
        currentMode,
        pendingMode,
        isProcessing,
        switchQueued,
      };

      logger.debug('ModeHandler', 'Mode status retrieved', response);

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('ModeHandler', 'Failed to get mode status', {
        error: errorMessage,
      });

      throw new Error(`Failed to get mode status: ${errorMessage}`);
    }
  });

  // Register mode:switch handler
  ipcMain.handle(IPC_CHANNELS.MODE_SWITCH, async (_event, request: unknown) => {
    const requestId = generateRequestId();

    logger.info('ModeHandler', 'Received mode:switch request', {
      requestId,
      request,
    });

    try {
      // Validate request
      if (!request || typeof request !== 'object' || !('mode' in request)) {
        throw new Error('Invalid request: missing "mode" field');
      }

      const { mode } = request as ModeSwitchRequest;

      // Validate mode value
      if (mode !== 'local' && mode !== 'remote') {
        throw new Error('Invalid mode: must be "local" or "remote"');
      }

      // Check if already in target mode
      const currentMode = modeManager.getCurrentMode();
      if (currentMode === mode && !modeManager.hasPendingSwitch()) {
        logger.info('ModeHandler', 'Already in target mode', {
          requestId,
          mode,
        });

        const response: ModeSwitchResponse = {
          success: true,
          switchedImmediately: true,
          currentMode: mode,
          pendingMode: null,
          message: `Already in ${mode} mode`,
        };

        return response;
      }

      // Attempt mode switch
      const switchedImmediately = modeManager.switchMode(mode);
      const pendingMode = modeManager.getPendingSwitch();

      logger.info('ModeHandler', 'Mode switch request processed', {
        requestId,
        from: currentMode,
        to: mode,
        switchedImmediately,
        pendingMode,
      });

      const response: ModeSwitchResponse = {
        success: true,
        switchedImmediately,
        currentMode: modeManager.getCurrentMode(),
        pendingMode,
        message: switchedImmediately
          ? `Switched to ${mode} mode immediately`
          : `Mode switch queued. Current task processing completes in ${mode} mode, then switching to ${mode} mode per FR-033.`,
      };

      // Send notification to renderer if queued
      if (!switchedImmediately) {
        sendModeSwitchNotification(currentMode, mode);
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('ModeHandler', 'Mode switch failed', {
        requestId,
        error: errorMessage,
      });

      throw new Error(`Mode switch failed: ${errorMessage}`);
    }
  });

  // Register mode:cancel handler
  ipcMain.handle(IPC_CHANNELS.MODE_CANCEL, async () => {
    const requestId = generateRequestId();

    logger.info('ModeHandler', 'Received mode:cancel request', {
      requestId,
    });

    try {
      // Check if there's a pending switch
      if (!modeManager.hasPendingSwitch()) {
        logger.info('ModeHandler', 'No pending switch to cancel', {
          requestId,
        });

        const response: ModeCancelResponse = {
          success: true,
          message: 'No pending mode switch to cancel',
        };

        return response;
      }

      // Cancel pending switch
      modeManager.cancelPendingSwitch();

      logger.info('ModeHandler', 'Pending mode switch cancelled', {
        requestId,
        currentMode: modeManager.getCurrentMode(),
      });

      const response: ModeCancelResponse = {
        success: true,
        message: 'Pending mode switch cancelled successfully',
      };

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('ModeHandler', 'Failed to cancel mode switch', {
        requestId,
        error: errorMessage,
      });

      throw new Error(`Failed to cancel mode switch: ${errorMessage}`);
    }
  });

  // Listen to ModeManager events for automatic notifications
  modeManager.on('mode-switch-queued', (event) => {
    logger.info('ModeHandler', 'Mode switch queued event received', event);

    // Send notification to all renderer windows
    sendModeSwitchNotification(event.from, event.to);
  });

  modeManager.on('mode-changed', (event) => {
    logger.info('ModeHandler', 'Mode changed event received', event);

    // Send notification to all renderer windows
    sendModeChangedNotification(event.from, event.to);
  });

  modeManager.on('mode-switch-cancelled', () => {
    logger.info('ModeHandler', 'Mode switch cancelled event received');

    // Send notification to all renderer windows
    sendModeSwitchCancelledNotification();
  });

  logger.info('ModeHandler', 'Mode switching IPC handlers registered successfully');
}

/**
 * Unregister mode switching IPC handlers
 *
 * Removes IPC channel listeners. Called during application shutdown.
 */
export function unregisterModeHandlers(): void {
  logger.info('ModeHandler', 'Unregistering mode switching IPC handlers');

  ipcMain.removeAllListeners(IPC_CHANNELS.MODE_GET);
  ipcMain.removeAllListeners(IPC_CHANNELS.MODE_SWITCH);
  ipcMain.removeAllListeners(IPC_CHANNELS.MODE_CANCEL);

  logger.info('ModeHandler', 'Mode switching IPC handlers unregistered');
}

/**
 * Send mode switch notification to renderer windows
 *
 * Per FR-035: Notify user of pending switch
 *
 * @param from - Current mode
 * @param to - Target mode
 */
function sendModeSwitchNotification(from: ProcessingMode, to: ProcessingMode): void {
  const windows = BrowserWindow.getAllWindows();

  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('mode-switch-queued', {
        from,
        to,
        message: `当前任务处理完成后将切换模式，新任务已进入队列等待`,
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Send mode changed notification to renderer windows
 *
 * @param from - Previous mode
 * @param to - New mode
 */
function sendModeChangedNotification(from: ProcessingMode, to: ProcessingMode): void {
  const windows = BrowserWindow.getAllWindows();

  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('mode-changed', {
        from,
        to,
        message: `模式已从 ${from} 切换到 ${to}`,
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Send mode switch cancelled notification to renderer windows
 */
function sendModeSwitchCancelledNotification(): void {
  const windows = BrowserWindow.getAllWindows();

  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('mode-switch-cancelled', {
        message: '待处理的模式切换已取消',
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Generate unique request ID for tracking
 *
 * @returns Request ID string
 */
function generateRequestId(): string {
  return `mode_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export default {
  registerModeHandlers,
  unregisterModeHandlers,
};
