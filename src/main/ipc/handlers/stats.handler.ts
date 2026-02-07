/**
 * Feedback Statistics IPC Handler
 *
 * Handles IPC communication for feedback statistics queries via feedback:stats channel.
 * Per plan.md US3: "本月修正X处错误" - Query error corrections this month from todo_items.
 *
 * @module main/ipc/handlers/stats.handler
 */

import { ipcMain } from 'electron';
import { logger } from '@/config/logger.js';
import { IPC_CHANNELS } from '../channels.js';
import { FeedbackType } from '@/database/entities/ActionItem.js';
import DatabaseManager from '@/database/Database.js';
import { ConfigManager } from '@/config/ConfigManager.js';
import {
  FeedbackStatsRequestSchema,
  type FeedbackStatsResponse,
} from '@shared/schemas/validation.js';
import { format } from 'date-fns';

/**
 * Generate unique request ID for tracking
 *
 * @returns Request ID string
 */
function generateRequestId(): string {
  return `stats_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get current month in YYYY-MM format
 *
 * @returns Current month string
 */
function getCurrentMonth(): string {
  return format(new Date(), 'yyyy-MM');
}

/**
 * Calculate month start and end timestamps
 *
 * @param month - Month string in YYYY-MM format
 * @returns Object with start and end Unix timestamps
 */
function getMonthBounds(month: string): { start: number; end: number } {
  const [year, monthNum] = month.split('-').map(Number);

  // Start of month: 00:00:00 on first day
  const startDate = new Date(year, monthNum - 1, 1, 0, 0, 0, 0);
  const start = Math.floor(startDate.getTime() / 1000);

  // End of month: 23:59:59 on last day
  const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);
  const end = Math.floor(endDate.getTime() / 1000);

  return { start, end };
}

/**
 * Register Feedback Statistics IPC handlers
 *
 * Sets up IPC channel listeners for feedback statistics queries.
 * Must be called during application initialization (main/index.ts).
 *
 * Per plan.md US3:
 * - Channel: feedback:stats
 * - Request: { month?: string } (defaults to current month)
 * - Response: { total_feedback_count, correct_count, incorrect_count, error_breakdown, month }
 * - Query items where feedback_type IS NOT NULL (feedback was submitted)
 * - Decrypt feedback_type for aggregation
 *
 * Usage:
 * ```typescript
 * import { registerStatsHandlers } from './ipc/handlers/stats.handler.js';
 * registerStatsHandlers();
 * ```
 */
export function registerStatsHandlers(): void {
  logger.info('StatsHandler', 'Registering feedback statistics IPC handlers', {
    channel: IPC_CHANNELS.FEEDBACK_STATS,
  });

  // Register feedback:stats handler
  ipcMain.handle(IPC_CHANNELS.FEEDBACK_STATS, async (_event, request: unknown) => {
    const requestId = generateRequestId();

    logger.info('StatsHandler', 'Received feedback:stats request', {
      requestId,
    });

    try {
      // Validate request schema
      const validationResult = FeedbackStatsRequestSchema.safeParse(request);

      if (!validationResult.success) {
        logger.error('StatsHandler', 'Invalid request schema', {
          requestId,
          errors: validationResult.error.errors,
        });

        return {
          total_feedback_count: 0,
          correct_count: 0,
          incorrect_count: 0,
          error_breakdown: {},
          month: getCurrentMonth(),
        };
      }

      const { month } = validationResult.data;
      const targetMonth = month ?? getCurrentMonth();

      logger.info('StatsHandler', 'Request validated', {
        requestId,
        month: targetMonth,
      });

      // Query feedback statistics from database
      const stats = await getFeedbackStats(targetMonth);

      logger.info('StatsHandler', 'Feedback statistics retrieved', {
        requestId,
        month: targetMonth,
        total_feedback_count: stats.total_feedback_count,
        correct_count: stats.correct_count,
        incorrect_count: stats.incorrect_count,
      });

      const response: FeedbackStatsResponse = {
        ...stats,
        month: targetMonth,
      };

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('StatsHandler', 'Failed to retrieve feedback statistics', {
        requestId,
        error: errorMessage,
      });

      // Return empty stats on error
      return {
        total_feedback_count: 0,
        correct_count: 0,
        incorrect_count: 0,
        error_breakdown: {},
        month: getCurrentMonth(),
      };
    }
  });

  logger.info('StatsHandler', 'Feedback statistics IPC handlers registered successfully');
}

/**
 * Get feedback statistics for a specific month
 *
 * Queries todo_items table for items with feedback data.
 * Decrypts feedback_type for accurate categorization.
 *
 * @param month - Month string in YYYY-MM format
 * @returns Feedback statistics
 */
async function getFeedbackStats(month: string): Promise<{
  total_feedback_count: number;
  correct_count: number;
  incorrect_count: number;
  error_breakdown: Record<string, number>;
}> {
  const db = DatabaseManager.getDatabase();
  const { start, end } = getMonthBounds(month);

  // Query all items with feedback (feedback_type IS NOT NULL)
  // created_at is Unix timestamp in seconds
  const stmt = db.prepare(`
    SELECT
      item_id,
      feedback_type,
      created_at
    FROM todo_items
    WHERE feedback_type IS NOT NULL
      AND created_at >= ?
      AND created_at <= ?
    ORDER BY created_at DESC
  `);

  const rows = stmt.all(start, end) as Array<{
    item_id: string;
    feedback_type: Buffer | null;
    created_at: number;
  }>;

  // Initialize statistics
  let total_feedback_count = 0;
  let correct_count = 0;
  let incorrect_count = 0;
  const error_breakdown: Record<string, number> = {
    content_error: 0,
    priority_error: 0,
    not_actionable: 0,
    source_error: 0,
  };

  // Process each item
  for (const row of rows) {
    total_feedback_count++;

    // Decrypt feedback_type
    if (row.feedback_type) {
      try {
        const decryptedFeedback = await ConfigManager.decryptField(row.feedback_type);

        // If feedback_type is decrypted successfully, it was marked incorrect
        if (decryptedFeedback) {
          incorrect_count++;

          // Count by error type
          const feedbackType = decryptedFeedback as FeedbackType;
          if (feedbackType in error_breakdown) {
            error_breakdown[feedbackType]++;
          } else {
            logger.warn('StatsHandler', 'Unknown feedback type found', {
              item_id: row.item_id,
              feedback_type: feedbackType,
            });
          }
        } else {
          // No feedback_type value means marked as correct (NULL after clearing)
          correct_count++;
        }
      } catch (error) {
        logger.error('StatsHandler', 'Failed to decrypt feedback_type', {
          item_id: row.item_id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Skip this item on decryption failure
        continue;
      }
    } else {
      // This should not happen based on WHERE clause, but handle gracefully
      correct_count++;
    }
  }

  return {
    total_feedback_count,
    correct_count,
    incorrect_count,
    error_breakdown,
  };
}

/**
 * Unregister Feedback Statistics IPC handlers
 *
 * Removes IPC channel listeners. Called during application shutdown.
 */
export function unregisterStatsHandlers(): void {
  logger.info('StatsHandler', 'Unregistering feedback statistics IPC handlers');

  ipcMain.removeAllListeners(IPC_CHANNELS.FEEDBACK_STATS);

  logger.info('StatsHandler', 'Feedback statistics IPC handlers unregistered');
}

export default {
  registerStatsHandlers,
  unregisterStatsHandlers,
  getFeedbackStats,
};
