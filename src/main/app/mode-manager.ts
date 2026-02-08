/**
 * Mode Manager
 *
 * Manages hot mode switching between local and remote LLM modes without application restart.
 * Per plan.md FR-033, FR-034, FR-035: Mode switches wait for batch completion, queue new tasks,
 * and notify user of pending switch.
 *
 * @module main/app/mode-manager
 */

import { EventEmitter } from 'events';
import { logger } from '../config/logger.js';

/**
 * Processing mode type
 */
export type ProcessingMode = 'local' | 'remote';

/**
 * Mode switch state
 */
interface ModeSwitchState {
  currentMode: ProcessingMode;
  pendingMode: ProcessingMode | null;
  isProcessing: boolean;
  switchRequestedAt: number | null;
}

/**
 * Mode switch event data
 */
export interface ModeSwitchEvent {
  from: ProcessingMode;
  to: ProcessingMode;
  requestedAt: number;
}

/**
 * Batch state event data
 */
export interface BatchStateEvent {
  isProcessing: boolean;
  mode: ProcessingMode;
  timestamp: number;
}

/**
 * Mode Manager
 *
 * Manages hot mode switching without application restart per plan.md FR-033.
 * Core responsibilities:
 * - Track current mode (local/remote)
 * - Queue mode switches during batch processing
 * - Notify on mode changes
 * - Track batch processing state
 *
 * Usage flow:
 * 1. User requests mode switch via UI
 * 2. ModeManager checks if batch is processing
 * 3. If processing: queue switch, set pendingMode, emit notification
 * 4. If not processing: switch immediately, emit change event
 * 5. Batch completion: check for pending switch, execute if queued
 *
 * Per FR-033: Wait for current batch completion before switching
 * Per FR-034: Queue new tasks during switch
 * Per FR-035: Notify user of pending switch
 */
export class ModeManager extends EventEmitter {
  private state: ModeSwitchState;

  /**
   * Create a new ModeManager
   *
   * @param initialMode - Starting mode (default: 'remote' per constitution Principle I)
   */
  constructor(initialMode: ProcessingMode = 'remote') {
    super();

    this.state = {
      currentMode: initialMode,
      pendingMode: null,
      isProcessing: false,
      switchRequestedAt: null,
    };

    logger.info('ModeManager', 'ModeManager initialized', {
      initialMode,
    });
  }

  /**
   * Get current processing mode
   *
   * @returns Current mode ('local' | 'remote')
   */
  getCurrentMode(): ProcessingMode {
    return this.state.currentMode;
  }

  /**
   * Check if a mode switch is pending
   *
   * @returns true if switch is queued waiting for batch completion
   */
  hasPendingSwitch(): boolean {
    return this.state.pendingMode !== null;
  }

  /**
   * Get pending mode if switch is queued
   *
   * @returns Pending mode or null if no pending switch
   */
  getPendingSwitch(): ProcessingMode | null {
    return this.state.pendingMode;
  }

  /**
   * Check if batch is currently processing
   *
   * @returns true if batch is being processed
   */
  isBatchProcessing(): boolean {
    return this.state.isProcessing;
  }

  /**
   * Request mode switch
   *
   * If batch is processing, switch is queued and will execute after batch completion.
   * If no batch processing, switch executes immediately.
   *
   * @param newMode - Target mode ('local' | 'remote')
   * @returns true if switched immediately, false if queued
   *
   * Per FR-033: Wait for batch completion before switching
   * Per FR-035: Notify user of pending switch
   */
  switchMode(newMode: ProcessingMode): boolean {
    if (this.state.currentMode === newMode && !this.state.pendingMode) {
      logger.debug('ModeManager', 'Mode switch requested but already in target mode', {
        mode: newMode,
      });
      return true;
    }

    const now = Date.now();

    if (this.state.isProcessing) {
      // Queue mode switch for after batch completion
      this.state.pendingMode = newMode;
      this.state.switchRequestedAt = now;

      logger.info('ModeManager', 'Mode switch queued (batch processing)', {
        currentMode: this.state.currentMode,
        pendingMode: newMode,
      });

      // Emit notification event for UI
      this.emit('mode-switch-queued', {
        from: this.state.currentMode,
        to: newMode,
        requestedAt: now,
      } as ModeSwitchEvent);

      return false; // Switch queued, not immediate
    }

    // Switch immediately (no batch processing)
    const previousMode = this.state.currentMode;
    this.state.currentMode = newMode;
    this.state.pendingMode = null;
    this.state.switchRequestedAt = null;

    logger.info('ModeManager', 'Mode switched immediately', {
      from: previousMode,
      to: newMode,
    });

    // Emit change event
    this.emit('mode-changed', {
      from: previousMode,
      to: newMode,
      requestedAt: now,
    } as ModeSwitchEvent);

    return true; // Switched immediately
  }

  /**
   * Mark batch processing start
   *
   * Called when batch processing begins. Prevents mode switches until batch completes.
   */
  markBatchStart(): void {
    if (this.state.isProcessing) {
      logger.warn('ModeManager', 'Batch start called but already processing', {
        currentMode: this.state.currentMode,
        pendingMode: this.state.pendingMode,
      });
      return;
    }

    this.state.isProcessing = true;

    logger.debug('ModeManager', 'Batch processing started', {
      mode: this.state.currentMode,
      pendingMode: this.state.pendingMode,
    });

    // Emit batch state event
    this.emit('batch-start', {
      isProcessing: true,
      mode: this.state.currentMode,
      timestamp: Date.now(),
    } as BatchStateEvent);
  }

  /**
   * Mark batch processing completion
   *
   * Called when batch processing completes. Executes pending mode switch if queued.
   *
   * Per FR-033: Switch after batch completion
   */
  markBatchComplete(): void {
    if (!this.state.isProcessing) {
      logger.warn('ModeManager', 'Batch complete called but not processing', {
        currentMode: this.state.currentMode,
        pendingMode: this.state.pendingMode,
      });
      return;
    }

    const modeBeforeComplete = this.state.currentMode;
    this.state.isProcessing = false;

    logger.debug('ModeManager', 'Batch processing completed', {
      mode: modeBeforeComplete,
      pendingMode: this.state.pendingMode,
    });

    // Emit batch state event
    this.emit('batch-complete', {
      isProcessing: false,
      mode: modeBeforeComplete,
      timestamp: Date.now(),
    } as BatchStateEvent);

    // Check for pending mode switch
    if (this.state.pendingMode) {
      const pendingMode = this.state.pendingMode;
      const requestedAt = this.state.switchRequestedAt || Date.now();

      logger.info('ModeManager', 'Executing queued mode switch after batch completion', {
        from: modeBeforeComplete,
        to: pendingMode,
        queuedDuration: Date.now() - requestedAt,
      });

      // Execute pending switch
      this.state.currentMode = pendingMode;
      this.state.pendingMode = null;
      this.state.switchRequestedAt = null;

      // Emit change event
      this.emit('mode-changed', {
        from: modeBeforeComplete,
        to: pendingMode,
        requestedAt,
      } as ModeSwitchEvent);
    }
  }

  /**
   * Cancel pending mode switch
   *
   * Cancels any queued mode switch. Useful if user changes their mind.
   */
  cancelPendingSwitch(): void {
    if (!this.state.pendingMode) {
      logger.debug('ModeManager', 'Cancel pending switch called but no pending switch');
      return;
    }

    logger.info('ModeManager', 'Pending mode switch cancelled', {
      currentMode: this.state.currentMode,
      cancelledPendingMode: this.state.pendingMode,
    });

    this.state.pendingMode = null;
    this.state.switchRequestedAt = null;

    // Emit cancellation event
    this.emit('mode-switch-cancelled', {
      currentMode: this.state.currentMode,
      timestamp: Date.now(),
    });
  }

  /**
   * Get current state (for testing/debugging)
   *
   * @returns Current state snapshot
   */
  getState(): Readonly<ModeSwitchState> {
    return { ...this.state };
  }

  /**
   * Reset state (for testing)
   *
   * @param initialMode - Mode to reset to
   */
  reset(initialMode: ProcessingMode = 'remote'): void {
    const previousMode = this.state.currentMode;

    this.state = {
      currentMode: initialMode,
      pendingMode: null,
      isProcessing: false,
      switchRequestedAt: null,
    };

    logger.info('ModeManager', 'ModeManager state reset', {
      previousMode,
      newMode: initialMode,
    });

    // Remove all listeners to prevent memory leaks in tests
    this.removeAllListeners();
  }
}

/**
 * Singleton instance for application-wide mode management
 */
let modeManagerInstance: ModeManager | null = null;

/**
 * Get or create ModeManager singleton instance
 *
 * @param initialMode - Initial mode if creating new instance
 * @returns ModeManager singleton instance
 */
export function getModeManager(initialMode?: ProcessingMode): ModeManager {
  if (!modeManagerInstance) {
    modeManagerInstance = new ModeManager(initialMode);
  }
  return modeManagerInstance;
}

/**
 * Reset ModeManager singleton (for testing)
 */
export function resetModeManager(): void {
  if (modeManagerInstance) {
    modeManagerInstance.removeAllListeners();
    modeManagerInstance = null;
  }
}

export default ModeManager;
