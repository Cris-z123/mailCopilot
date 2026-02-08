/**
 * Data Retention Cleanup Task
 *
 * Per plan v2.7:
 * - Daily cron job at 2:00 AM
 * - Delete email metadata older than retention period
 * - Delete feedback data older than retention period
 * - SKIP cleanup if retention_days = -1 (permanent)
 * - Update last_cleanup_at timestamp
 *
 * @module main/database/cleanup
 */

import DatabaseManager from './Database.js';
import { logger } from '../config/logger.js';
import {
  DataRetentionConfigRepository,
  type RetentionPeriod as EntityRetentionPeriod,
} from './entities/DataRetentionConfig.js';

/** -1 = permanent (never delete) */
const PERMANENT = -1;

/** Retention period type (number of days or -1) */
export type RetentionPeriod = number;

/**
 * Cleanup result interface
 */
export interface CleanupResult {
  email_metadata_deleted: number;
  feedback_deleted: number;
  skipped_permanent_email: boolean;
  skipped_permanent_feedback: boolean;
  message: string;
}

/**
 * Perform retention cleanup
 *
 * Deletes email metadata and feedback data older than retention period.
 * Skips cleanup for permanent retention (-1).
 *
 * Per plan v2.7:
 * - Email metadata: Delete from processed_emails where processed_at < cutoff
 * - Feedback data: Set feedback_type to NULL in todo_items where created_at < cutoff
 * - Permanent option (-1): Skip cleanup, return deleted count as 0
 *
 * @returns Cleanup result with deleted counts
 */
export async function performRetentionCleanup(): Promise<CleanupResult> {
  logger.info('Cleanup', 'Starting retention cleanup');

  try {
    // Get current retention configuration
    const config = await DataRetentionConfigRepository.get();

    const emailRetentionDays = config.email_metadata_retention_days;
    const feedbackRetentionDays = config.feedback_retention_days;

    // Check if permanent retention (skip cleanup)
    const skipEmailCleanup = emailRetentionDays === PERMANENT;
    const skipFeedbackCleanup = feedbackRetentionDays === PERMANENT;

    if (skipEmailCleanup && skipFeedbackCleanup) {
      logger.info('Cleanup', 'Both retention periods set to permanent, skipping cleanup');

      // Still update last_cleanup_at timestamp
      await DataRetentionConfigRepository.updateLastCleanup();

      return {
        email_metadata_deleted: 0,
        feedback_deleted: 0,
        skipped_permanent_email: true,
        skipped_permanent_feedback: true,
        message: '永久保留设置已启用，跳过清理。',
      };
    }

    const db = DatabaseManager.getDatabase();
    let emailDeletedCount = 0;
    let feedbackDeletedCount = 0;

    // Use transaction for data integrity
    const cleanupTx = db.transaction(() => {
      // Cleanup email metadata if not permanent
      if (!skipEmailCleanup) {
        const emailCutoff = DataRetentionConfigRepository.getCleanupCutoff(emailRetentionDays);

        if (emailCutoff !== null) {
          // Delete from processed_emails
          const deleteEmailStmt = db.prepare(`
            DELETE FROM processed_emails
            WHERE processed_at < ?
          `);

          const emailResult = deleteEmailStmt.run(emailCutoff);
          emailDeletedCount = emailResult.changes;

          logger.info('Cleanup', 'Deleted email metadata', {
            count: emailDeletedCount,
            cutoff_timestamp: emailCutoff,
            retention_days: emailRetentionDays,
          });
        }
      }

      // Cleanup feedback data if not permanent
      if (!skipFeedbackCleanup) {
        const feedbackCutoff = DataRetentionConfigRepository.getCleanupCutoff(feedbackRetentionDays);

        if (feedbackCutoff !== null) {
          // Set feedback_type to NULL (permanent deletion)
          const deleteFeedbackStmt = db.prepare(`
            UPDATE todo_items
            SET feedback_type = NULL
            WHERE created_at < ? AND feedback_type IS NOT NULL
          `);

          const feedbackResult = deleteFeedbackStmt.run(feedbackCutoff);
          feedbackDeletedCount = feedbackResult.changes;

          logger.info('Cleanup', 'Deleted feedback data', {
            count: feedbackDeletedCount,
            cutoff_timestamp: feedbackCutoff,
            retention_days: feedbackRetentionDays,
          });
        }
      }
    });

    // Execute transaction
    cleanupTx();

    // Update last cleanup timestamp
    await DataRetentionConfigRepository.updateLastCleanup();

    const messageParts = [];
    if (skipEmailCleanup) {
      messageParts.push('邮件元数据：永久保留');
    } else if (emailDeletedCount > 0) {
      messageParts.push(`已删除 ${emailDeletedCount} 条邮件元数据`);
    } else {
      messageParts.push('无需清理邮件元数据');
    }

    if (skipFeedbackCleanup) {
      messageParts.push('反馈数据：永久保留');
    } else if (feedbackDeletedCount > 0) {
      messageParts.push(`已删除 ${feedbackDeletedCount} 条反馈数据`);
    } else {
      messageParts.push('无需清理反馈数据');
    }

    const result: CleanupResult = {
      email_metadata_deleted: emailDeletedCount,
      feedback_deleted: feedbackDeletedCount,
      skipped_permanent_email: skipEmailCleanup,
      skipped_permanent_feedback: skipFeedbackCleanup,
      message: messageParts.join('，'),
    };

    logger.info('Cleanup', 'Retention cleanup completed', result);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Cleanup', 'Retention cleanup failed', {
      error: errorMessage,
    });

    throw new Error(`Retention cleanup failed: ${errorMessage}`);
  }
}

/**
 * Perform manual 30-day cleanup
 *
 * Per FR-048: "清理30天前数据" button
 * One-time cleanup regardless of retention setting.
 * This is a manual cleanup that always deletes 30+ day old data.
 *
 * @returns Cleanup result with deleted counts
 */
export async function performManual30DayCleanup(): Promise<CleanupResult> {
  logger.info('Cleanup', 'Starting manual 30-day cleanup');

  try {
    const db = DatabaseManager.getDatabase();

    // Calculate 30-day cutoff
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
    const cutoff = now - thirtyDaysInSeconds;

    let emailDeletedCount = 0;
    let feedbackDeletedCount = 0;

    // Use transaction for data integrity
    const cleanupTx = db.transaction(() => {
      // Delete email metadata older than 30 days
      const deleteEmailStmt = db.prepare(`
        DELETE FROM processed_emails
        WHERE processed_at < ?
      `);

      const emailResult = deleteEmailStmt.run(cutoff);
      emailDeletedCount = emailResult.changes;

      // Delete feedback data older than 30 days
      const deleteFeedbackStmt = db.prepare(`
        UPDATE todo_items
        SET feedback_type = NULL
        WHERE created_at < ? AND feedback_type IS NOT NULL
      `);

      const feedbackResult = deleteFeedbackStmt.run(cutoff);
      feedbackDeletedCount = feedbackResult.changes;
    });

    // Execute transaction
    cleanupTx();

    logger.info('Cleanup', 'Manual 30-day cleanup completed', {
      email_metadata_deleted: emailDeletedCount,
      feedback_deleted: feedbackDeletedCount,
    });

    return {
      email_metadata_deleted: emailDeletedCount,
      feedback_deleted: feedbackDeletedCount,
      skipped_permanent_email: false,
      skipped_permanent_feedback: false,
      message: `已删除 ${emailDeletedCount} 条邮件元数据和 ${feedbackDeletedCount} 条反馈数据（30天前）`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Cleanup', 'Manual 30-day cleanup failed', {
      error: errorMessage,
    });

    throw new Error(`Manual cleanup failed: ${errorMessage}`);
  }
}

/**
 * Get cleanup preview
 *
 * Returns count of records that would be deleted without actually deleting them.
 * Useful for showing confirmation dialog to user.
 *
 * @param retentionDays - Retention period in days (-1 for permanent)
 * @returns Count of records that would be deleted
 */
export function getCleanupPreview(retentionDays: RetentionPeriod): {
  email_count: number;
  feedback_count: number;
} {
  const db = DatabaseManager.getDatabase();

  // If permanent, no records would be deleted
  if (retentionDays === PERMANENT) {
    return {
      email_count: 0,
      feedback_count: 0,
    };
  }

  const cutoff = DataRetentionConfigRepository.getCleanupCutoff(
    retentionDays as EntityRetentionPeriod,
  );

  if (cutoff === null) {
    return {
      email_count: 0,
      feedback_count: 0,
    };
  }

  // Count email metadata to delete
  const emailCountStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM processed_emails
    WHERE processed_at < ?
  `);
  const emailResult = emailCountStmt.get(cutoff) as { count: number };

  // Count feedback to delete
  const feedbackCountStmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM todo_items
    WHERE created_at < ? AND feedback_type IS NOT NULL
  `);
  const feedbackResult = feedbackCountStmt.get(cutoff) as { count: number };

  return {
    email_count: emailResult.count,
    feedback_count: feedbackResult.count,
  };
}

/**
 * Get storage usage estimate
 *
 * Returns estimated storage usage in bytes for email metadata and feedback data.
 *
 * @returns Storage usage in bytes
 */
export function getStorageUsage(): {
  email_metadata_bytes: number;
  feedback_data_bytes: number;
  total_bytes: number;
} {
  const db = DatabaseManager.getDatabase();

  // Get page count and page size for database file
  const pageCountResult = db.prepare('PRAGMA page_count').get() as { page_count: number };
  const pageSizeResult = db.prepare('PRAGMA page_size').get() as { page_size: number };

  const totalBytes = pageCountResult.page_count * pageSizeResult.page_size;

  // Estimate email metadata size (processed_emails table)
  // Each row approximately: email_hash (64) + timestamps (8+8) + report_date (10) + attachments_meta (~50) + status (10) + search_string (~100) + file_path (~200) = ~450 bytes average
  const emailRowCountResult = db.prepare('SELECT COUNT(*) as count FROM processed_emails').get() as { count: number };
  const emailMetadataBytes = emailRowCountResult.count * 450;

  // Estimate feedback data size (feedback_type BLOB fields)
  // Each feedback_type BLOB is approximately 40-60 bytes (encrypted)
  const feedbackCountResult = db.prepare('SELECT COUNT(*) as count FROM todo_items WHERE feedback_type IS NOT NULL').get() as { count: number };
  const feedbackDataBytes = feedbackCountResult.count * 50;

  return {
    email_metadata_bytes: emailMetadataBytes,
    feedback_data_bytes: feedbackDataBytes,
    total_bytes: totalBytes,
  };
}

/**
 * Start scheduled cleanup task
 *
 * Sets up daily cron job at 2:00 AM for automatic retention cleanup.
 * This should be called during application initialization.
 *
 * Per plan v2.7:
 * - Schedule cleanup daily at 2:00 AM
 * - Respects retention period settings (30/90/180/365/-1 days)
 * - Updates last_cleanup_at timestamp after each run
 *
 * Note: This is a simplified implementation using setInterval.
 * In production, consider using node-cron or similar for more robust scheduling.
 */
let cleanupInterval: NodeJS.Timeout | null = null;

export function startScheduledCleanup(): void {
  // Clear existing interval if any
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  // Calculate time until next 2:00 AM
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(2, 0, 0, 0);

  // If already past 2:00 AM today, schedule for tomorrow
  if (now.getTime() > nextRun.getTime()) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  const timeUntilNextRun = nextRun.getTime() - now.getTime();

  logger.info('Cleanup', 'Scheduled cleanup task configured', {
    next_run: nextRun.toISOString(),
    interval_ms: timeUntilNextRun,
  });

  // Schedule first run
  setTimeout(() => {
    performRetentionCleanup()
      .then((result) => {
        logger.info('Cleanup', 'Scheduled cleanup completed', result);
      })
      .catch((error) => {
        logger.error('Cleanup', 'Scheduled cleanup failed', { error: error.message });
      });

    // Set up daily interval (24 hours = 86400000 ms)
    cleanupInterval = setInterval(() => {
      performRetentionCleanup()
        .then((result) => {
          logger.info('Cleanup', 'Scheduled cleanup completed', result);
        })
        .catch((error) => {
          logger.error('Cleanup', 'Scheduled cleanup failed', { error: error.message });
        });
    }, 24 * 60 * 60 * 1000);
  }, timeUntilNextRun);
}

/**
 * Stop scheduled cleanup task
 *
 * Removes the scheduled cleanup interval.
 * This should be called during application shutdown.
 */
export function stopScheduledCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Cleanup', 'Scheduled cleanup task stopped');
  }
}

export default {
  performRetentionCleanup,
  performManual30DayCleanup,
  getCleanupPreview,
  getStorageUsage,
  startScheduledCleanup,
  stopScheduledCleanup,
};
