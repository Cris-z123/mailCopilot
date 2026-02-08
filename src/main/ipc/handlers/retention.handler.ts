/**
 * Retention Cleanup IPC Handler
 *
 * Handles IPC communication for data retention configuration and cleanup.
 * Per plan v2.7 US6: Configurable data retention with immediate cleanup.
 *
 * @module main/ipc/handlers/retention.handler
 */

import { ipcMain } from 'electron';
import { logger } from '../../config/logger.js';
import { IPC_CHANNELS } from '../channels.js';
import {
  DataRetentionConfigRepository,
  type RetentionPeriod,
  type CleanupOptions,
} from '../../database/entities/DataRetentionConfig.js';
import {
  performManual30DayCleanup,
  getStorageUsage,
} from '../../database/cleanup.js';
import {
  RetentionSetPeriodsRequestSchema,
  RetentionGetPreviewRequestSchema,
  RetentionManualCleanupRequestSchema,
} from '../../../shared/schemas/validation.js';
import type {
  RetentionGetConfigResponse,
  RetentionSetPeriodsResponse,
  RetentionGetPreviewResponse,
  RetentionManualCleanupResponse,
  RetentionGetStorageResponse,
} from '../../../shared/schemas/validation.js';

/**
 * Generate unique request ID for tracking
 *
 * @returns Request ID string
 */
function generateRequestId(): string {
  return `retention_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Register Retention Cleanup IPC handlers
 *
 * Sets up IPC channel listeners for retention configuration and cleanup.
 * Must be called during application initialization (main/index.ts).
 *
 * Per plan.md US6:
 * - retention:get-config: Get current retention configuration
 * - retention:set-periods: Set retention periods with optional immediate cleanup
 * - retention:get-preview: Get cleanup preview before changing retention
 * - retention:manual-cleanup: Perform 30-day manual cleanup (FR-048)
 * - retention:get-storage: Get current storage usage
 *
 * Usage:
 * ```typescript
 * import { registerRetentionHandlers } from './ipc/handlers/retention.handler.js';
 * registerRetentionHandlers();
 * ```
 */
export function registerRetentionHandlers(): void {
  logger.info('RetentionHandler', 'Registering retention cleanup IPC handlers', {
    channels: [
      IPC_CHANNELS.RETENTION_GET_CONFIG,
      IPC_CHANNELS.RETENTION_SET_PERIODS,
      IPC_CHANNELS.RETENTION_GET_PREVIEW,
      IPC_CHANNELS.RETENTION_MANUAL_CLEANUP,
      IPC_CHANNELS.RETENTION_GET_STORAGE,
    ],
  });

  // Register retention:get-config handler
  ipcMain.handle(IPC_CHANNELS.RETENTION_GET_CONFIG, async () => {
    const requestId = generateRequestId();

    logger.info('RetentionHandler', 'Received retention:get-config request', {
      requestId,
    });

    try {
      const config = await DataRetentionConfigRepository.get();

      logger.info('RetentionHandler', 'Retrieved retention configuration', {
        requestId,
        email_retention_days: config.email_metadata_retention_days,
        feedback_retention_days: config.feedback_retention_days,
      });

      const response: RetentionGetConfigResponse = {
        email_metadata_retention_days: config.email_metadata_retention_days,
        feedback_retention_days: config.feedback_retention_days,
        last_cleanup_at: config.last_cleanup_at,
        estimated_storage_bytes: config.estimated_storage_bytes,
      };

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('RetentionHandler', 'Failed to get retention configuration', {
        requestId,
        error: errorMessage,
      });

      throw new Error(`Failed to get retention configuration: ${errorMessage}`);
    }
  });

  // Register retention:set-periods handler
  ipcMain.handle(IPC_CHANNELS.RETENTION_SET_PERIODS, async (_event, request: unknown) => {
    const requestId = generateRequestId();

    logger.info('RetentionHandler', 'Received retention:set-periods request', {
      requestId,
    });

    try {
      const parsed = RetentionSetPeriodsRequestSchema.safeParse(request ?? {});

      if (!parsed.success) {
        const message = parsed.error.errors.map((e) => e.message).join('; ');
        logger.warn('RetentionHandler', 'Invalid retention:set-periods request', {
          requestId,
          error: message,
        });
        return {
          success: false,
          message: `请求参数无效: ${message}`,
        } satisfies RetentionSetPeriodsResponse;
      }

      const req = parsed.data;
      const {
        email_metadata_retention_days: emailDays,
        feedback_retention_days: feedbackDays,
        perform_immediate_cleanup = true,
        show_confirmation = true,
      } = req;

      // Validate retention periods (allowed values only)
      const validPeriods = [-1, 30, 90, 180, 365];
      if (!validPeriods.includes(emailDays) || !validPeriods.includes(feedbackDays)) {
        return {
          success: false,
          message: `保留期无效，必须为: ${validPeriods.join(', ')}`,
        } satisfies RetentionSetPeriodsResponse;
      }

      logger.info('RetentionHandler', 'Setting retention periods', {
        requestId,
        email_days: emailDays,
        feedback_days: feedbackDays,
        immediate_cleanup: perform_immediate_cleanup,
      });

      // Build cleanup options
      const cleanupOptions: CleanupOptions = {
        performImmediateCleanup: perform_immediate_cleanup,
        showConfirmation: show_confirmation,
      };

      // Set retention periods (triggers immediate cleanup if requested)
      await DataRetentionConfigRepository.setRetentionPeriods(
        emailDays as RetentionPeriod,
        feedbackDays as RetentionPeriod,
        cleanupOptions
      );

      logger.info('RetentionHandler', 'Retention periods updated successfully', {
        requestId,
      });

      const response: RetentionSetPeriodsResponse = {
        success: true,
        message: '保留期设置已更新',
        cleanup_triggered: perform_immediate_cleanup,
      };

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('RetentionHandler', 'Failed to set retention periods', {
        requestId,
        error: errorMessage,
      });

      const response: RetentionSetPeriodsResponse = {
        success: false,
        message: `设置保留期失败: ${errorMessage}`,
      };

      return response;
    }
  });

  // Register retention:get-preview handler
  ipcMain.handle(IPC_CHANNELS.RETENTION_GET_PREVIEW, async (_event, request: unknown) => {
    const requestId = generateRequestId();

    logger.info('RetentionHandler', 'Received retention:get-preview request', {
      requestId,
    });

    try {
      const parsed = RetentionGetPreviewRequestSchema.safeParse(request ?? {});

      if (!parsed.success) {
        const message = parsed.error.errors.map((e) => e.message).join('; ');
        logger.warn('RetentionHandler', 'Invalid retention:get-preview request', {
          requestId,
          error: message,
        });
        throw new Error(`请求参数无效: ${message}`);
      }

      const { email_metadata_retention_days: emailDays, feedback_retention_days: feedbackDays } =
        parsed.data;

      logger.info('RetentionHandler', 'Getting cleanup preview', {
        requestId,
        email_days: emailDays,
        feedback_days: feedbackDays,
      });

      // Get cleanup preview
      const preview = await DataRetentionConfigRepository.getCleanupPreview(
        emailDays as RetentionPeriod,
        feedbackDays as RetentionPeriod
      );

      logger.info('RetentionHandler', 'Cleanup preview calculated', {
        requestId,
        email_count: preview.email_count,
        feedback_count: preview.feedback_count,
      });

      const response: RetentionGetPreviewResponse = {
        email_count: preview.email_count,
        feedback_count: preview.feedback_count,
      };

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('RetentionHandler', 'Failed to get cleanup preview', {
        requestId,
        error: errorMessage,
      });

      throw new Error(`Failed to get cleanup preview: ${errorMessage}`);
    }
  });

  // Register retention:manual-cleanup handler
  ipcMain.handle(IPC_CHANNELS.RETENTION_MANUAL_CLEANUP, async (_event, request: unknown) => {
    const requestId = generateRequestId();

    logger.info('RetentionHandler', 'Received retention:manual-cleanup request', {
      requestId,
    });

    try {
      const parsed = RetentionManualCleanupRequestSchema.safeParse(request ?? {});

      if (!parsed.success) {
        const message = parsed.error.errors.map((e) => e.message).join('; ');
        logger.warn('RetentionHandler', 'Invalid retention:manual-cleanup request', {
          requestId,
          error: message,
        });
        return {
          success: false,
          email_metadata_deleted: 0,
          feedback_deleted: 0,
          message: `请求参数无效: ${message}`,
        } satisfies RetentionManualCleanupResponse;
      }

      const { confirm } = parsed.data;

      // Check user confirmation
      if (!confirm) {
        logger.warn('RetentionHandler', 'User confirmation missing', {
          requestId,
        });

        const response: RetentionManualCleanupResponse = {
          success: false,
          email_metadata_deleted: 0,
          feedback_deleted: 0,
          message: '需要用户确认才能执行清理。请将 confirm 设置为 true。',
        };

        return response;
      }

      logger.info('RetentionHandler', 'Performing manual 30-day cleanup', {
        requestId,
      });

      // Perform manual 30-day cleanup
      const result = await performManual30DayCleanup();

      logger.info('RetentionHandler', 'Manual cleanup completed', {
        requestId,
        email_metadata_deleted: result.email_metadata_deleted,
        feedback_deleted: result.feedback_deleted,
      });

      const response: RetentionManualCleanupResponse = {
        success: true,
        email_metadata_deleted: result.email_metadata_deleted,
        feedback_deleted: result.feedback_deleted,
        message: result.message,
      };

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('RetentionHandler', 'Manual cleanup failed', {
        requestId,
        error: errorMessage,
      });

      const response: RetentionManualCleanupResponse = {
        success: false,
        email_metadata_deleted: 0,
        feedback_deleted: 0,
        message: `手动清理失败: ${errorMessage}`,
      };

      return response;
    }
  });

  // Register retention:get-storage handler
  ipcMain.handle(IPC_CHANNELS.RETENTION_GET_STORAGE, async () => {
    const requestId = generateRequestId();

    logger.info('RetentionHandler', 'Received retention:get-storage request', {
      requestId,
    });

    try {
      // Get storage usage
      const storage = getStorageUsage();

      logger.info('RetentionHandler', 'Storage usage retrieved', {
        requestId,
        email_metadata_bytes: storage.email_metadata_bytes,
        feedback_data_bytes: storage.feedback_data_bytes,
        total_bytes: storage.total_bytes,
      });

      const response: RetentionGetStorageResponse = {
        email_metadata_bytes: storage.email_metadata_bytes,
        feedback_data_bytes: storage.feedback_data_bytes,
        total_bytes: storage.total_bytes,
        email_metadata_mb: storage.email_metadata_bytes / (1024 * 1024),
        feedback_data_mb: storage.feedback_data_bytes / (1024 * 1024),
        total_mb: storage.total_bytes / (1024 * 1024),
      };

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('RetentionHandler', 'Failed to get storage usage', {
        requestId,
        error: errorMessage,
      });

      throw new Error(`Failed to get storage usage: ${errorMessage}`);
    }
  });

  logger.info('RetentionHandler', 'Retention cleanup IPC handlers registered successfully');
}

/**
 * Unregister Retention Cleanup IPC handlers
 *
 * Removes IPC channel listeners. Called during application shutdown.
 */
export function unregisterRetentionHandlers(): void {
  logger.info('RetentionHandler', 'Unregistering retention cleanup IPC handlers');

  ipcMain.removeAllListeners(IPC_CHANNELS.RETENTION_GET_CONFIG);
  ipcMain.removeAllListeners(IPC_CHANNELS.RETENTION_SET_PERIODS);
  ipcMain.removeAllListeners(IPC_CHANNELS.RETENTION_GET_PREVIEW);
  ipcMain.removeAllListeners(IPC_CHANNELS.RETENTION_MANUAL_CLEANUP);
  ipcMain.removeAllListeners(IPC_CHANNELS.RETENTION_GET_STORAGE);

  logger.info('RetentionHandler', 'Retention cleanup IPC handlers unregistered');
}

export default {
  registerRetentionHandlers,
  unregisterRetentionHandlers,
};
