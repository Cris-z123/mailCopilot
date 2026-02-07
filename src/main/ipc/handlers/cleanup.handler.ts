/**
 * Feedback Cleanup IPC Handler
 *
 * Handles IPC communication for feedback destruction operations.
 * Per plan.md US3: Permanent deletion of feedback_type values with confirmation.
 *
 * @module main/ipc/handlers/cleanup.handler
 */

import { ipcMain } from 'electron';
import { logger } from '../../config/logger.js';
import { IPC_CHANNELS } from '../channels.js';
import DatabaseManager from '../../database/Database.js';
import {
  FeedbackDestroyRequestSchema,
  type FeedbackDestroyResponse,
} from '../../../shared/schemas/validation.js';

/**
 * Generate unique request ID for tracking
 *
 * @returns Request ID string
 */
function generateRequestId(): string {
  return `cleanup_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Register Feedback Cleanup IPC handlers
 *
 * Sets up IPC channel listeners for feedback destruction.
 * Must be called during application initialization (main/index.ts).
 *
 * Per plan.md US3:
 * - Channel: feedback:destroy
 * - Request: { confirm: boolean, item_id?: string }
 * - Response: { success: boolean, destroyed_count: number, message: string }
 * - Permanent deletion of feedback_type values (sets to NULL)
 * - Requires explicit user confirmation
 * - Can destroy all feedback or specific item feedback
 *
 * Usage:
 * ```typescript
 * import { registerCleanupHandlers } from './ipc/handlers/cleanup.handler.js';
 * registerCleanupHandlers();
 * ```
 */
export function registerCleanupHandlers(): void {
  logger.info('CleanupHandler', 'Registering feedback cleanup IPC handlers', {
    channel: IPC_CHANNELS.FEEDBACK_DESTROY,
  });

  // Register feedback:destroy handler
  ipcMain.handle(IPC_CHANNELS.FEEDBACK_DESTROY, async (_event, request: unknown) => {
    const requestId = generateRequestId();

    logger.info('CleanupHandler', 'Received feedback:destroy request', {
      requestId,
    });

    try {
      // Validate request schema
      const validationResult = FeedbackDestroyRequestSchema.safeParse(request);

      if (!validationResult.success) {
        logger.error('CleanupHandler', 'Invalid request schema', {
          requestId,
          errors: validationResult.error.errors,
        });

        const response: FeedbackDestroyResponse = {
          success: false,
          destroyed_count: 0,
          message: 'Invalid request schema. Expected { confirm: boolean, item_id?: string }',
        };
        return response;
      }

      const { confirm, item_id } = validationResult.data;

      // Check user confirmation
      if (!confirm) {
        logger.warn('CleanupHandler', 'User confirmation missing', {
          requestId,
        });

        const response: FeedbackDestroyResponse = {
          success: false,
          destroyed_count: 0,
          message: '需要用户确认才能删除反馈数据。请将 confirm 设置为 true。',
        };
        return response;
      }

      logger.info('CleanupHandler', 'Request validated, user confirmed', {
        requestId,
        item_id: item_id ?? 'ALL',
      });

      // Destroy feedback
      const result = await destroyFeedback(item_id);

      logger.info('CleanupHandler', 'Feedback destruction completed', {
        requestId,
        destroyed_count: result.destroyed_count,
      });

      const response: FeedbackDestroyResponse = {
        success: true,
        destroyed_count: result.destroyed_count,
        message: result.message,
      };

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('CleanupHandler', 'Feedback destruction failed', {
        requestId,
        error: errorMessage,
      });

      const response: FeedbackDestroyResponse = {
        success: false,
        destroyed_count: 0,
        message: `删除失败: ${errorMessage}`,
      };

      return response;
    }
  });

  logger.info('CleanupHandler', 'Feedback cleanup IPC handlers registered successfully');
}

/**
 * Destroy feedback data
 *
 * Sets feedback_type to NULL for all feedback or specific item.
 * This is permanent deletion - data cannot be recovered.
 *
 * @param itemId - Optional item ID to destroy feedback for specific item
 * @returns Object with destroyed count and message
 */
async function destroyFeedback(itemId?: string): Promise<{
  destroyed_count: number;
  message: string;
}> {
  const db = DatabaseManager.getDatabase();

  // Use transaction for data integrity
  const destroyTx = db.transaction(() => {
    let stmt;
    let destroyed_count: number;

    if (itemId) {
      // Destroy feedback for specific item
      stmt = db.prepare(`
        UPDATE todo_items
        SET feedback_type = NULL
        WHERE item_id = ? AND feedback_type IS NOT NULL
      `);

      const result = stmt.run(itemId);
      destroyed_count = result.changes;

      logger.info('CleanupHandler', 'Destroyed feedback for specific item', {
        item_id: itemId,
        destroyed_count,
      });

      return {
        destroyed_count,
        message: destroyed_count > 0
          ? `已删除项目 ${itemId} 的反馈数据`
          : `项目 ${itemId} 没有反馈数据`,
      };
    } else {
      // Destroy ALL feedback
      stmt = db.prepare(`
        UPDATE todo_items
        SET feedback_type = NULL
        WHERE feedback_type IS NOT NULL
      `);

      const result = stmt.run();
      destroyed_count = result.changes;

      logger.info('CleanupHandler', 'Destroyed ALL feedback data', {
        destroyed_count,
      });

      return {
        destroyed_count,
        message: `已永久删除 ${destroyed_count} 条反馈数据。此操作无法撤销。`,
      };
    }
  });

  // Execute transaction
  return destroyTx();
}

/**
 * Get feedback destruction preview
 *
 * Returns count of feedback that would be destroyed without actually destroying it.
 * Useful for showing confirmation dialog to user.
 *
 * @param itemId - Optional item ID to check specific item
 * @returns Count of feedback that would be destroyed
 */
export function getDestructionPreview(itemId?: string): number {
  const db = DatabaseManager.getDatabase();

  let stmt;
  if (itemId) {
    stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM todo_items
      WHERE item_id = ? AND feedback_type IS NOT NULL
    `);
    const result = stmt.get(itemId) as { count: number };
    return result.count;
  } else {
    stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM todo_items
      WHERE feedback_type IS NOT NULL
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }
}

/**
 * Unregister Feedback Cleanup IPC handlers
 *
 * Removes IPC channel listeners. Called during application shutdown.
 */
export function unregisterCleanupHandlers(): void {
  logger.info('CleanupHandler', 'Unregistering feedback cleanup IPC handlers');

  ipcMain.removeAllListeners(IPC_CHANNELS.FEEDBACK_DESTROY);

  logger.info('CleanupHandler', 'Feedback cleanup IPC handlers unregistered');
}

export default {
  registerCleanupHandlers,
  unregisterCleanupHandlers,
  destroyFeedback,
  getDestructionPreview,
};
