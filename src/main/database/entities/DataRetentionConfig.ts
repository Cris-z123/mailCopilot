import { logger } from '../../config/logger.js';
import { ConfigManager } from '../../config/ConfigManager.js';
import {
  performRetentionCleanup,
  getCleanupPreview,
} from '../cleanup.js';

/**
 * Data Retention Configuration Entity
 *
 * Per plan v2.7:
 * - Default retention: 90 days for both email metadata and feedback data
 * - Configurable options: 30/90/180/365/-1 (where -1 = permanent)
 * - Feedback retention uses same options as email metadata (per FR-026, FR-027)
 * - Immediate cleanup when retention period changes
 * - Manual cleanup button (30-day cleanup per FR-048)
 *
 * Table: user_config (singleton, key-value storage with encryption)
 * Keys:
 * - email_metadata_retention_days: INTEGER (-1 or 30/90/180/365)
 * - feedback_retention_days: INTEGER (-1 or 30/90/180/365)
 * - last_cleanup_at: INTEGER (Unix timestamp)
 * - estimated_storage_bytes: INTEGER (bytes used)
 */

/**
 * Valid retention period options (in days)
 * -1 = permanent (never auto-delete)
 */
export const RETENTION_PERIODS = {
  PERMANENT: -1,
  DAYS_30: 30,
  DAYS_90: 90,
  DAYS_180: 180,
  DAYS_365: 365,
} as const;

/**
 * Cleanup options for immediate cleanup on retention change
 */
export interface CleanupOptions {
  performImmediateCleanup: boolean; // Trigger cleanup immediately
  showConfirmation: boolean; // Show confirmation dialog to user
}

/**
 * Default cleanup options
 */
const DEFAULT_CLEANUP_OPTIONS: CleanupOptions = {
  performImmediateCleanup: true,
  showConfirmation: true,
};

/**
 * Retention period type for type safety
 */
export type RetentionPeriod = typeof RETENTION_PERIODS[keyof typeof RETENTION_PERIODS];

/**
 * Data retention configuration interface
 */
export interface DataRetentionConfig {
  email_metadata_retention_days: RetentionPeriod;
  feedback_retention_days: RetentionPeriod;
  last_cleanup_at: number; // Unix timestamp
  estimated_storage_bytes: number;
}

/**
 * Valid retention period values
 */
const VALID_RETENTION_DAYS = [-1, 30, 90, 180, 365];

/**
 * Repository class for Data Retention Configuration
 *
 * Provides CRUD operations for data retention settings.
 * Configuration is stored in user_config table with field-level encryption.
 */
export class DataRetentionConfigRepository {
  private static readonly KEY_EMAIL_RETENTION = 'email_metadata_retention_days';
  private static readonly KEY_FEEDBACK_RETENTION = 'feedback_retention_days';
  private static readonly KEY_LAST_CLEANUP = 'last_cleanup_at';
  private static readonly KEY_STORAGE_BYTES = 'estimated_storage_bytes';

  /**
   * Get the data retention configuration
   *
   * Returns default values if not configured.
   *
   * @returns Data retention configuration
   */
  static async get(): Promise<DataRetentionConfig> {
    const config = await ConfigManager.get([
      this.KEY_EMAIL_RETENTION,
      this.KEY_FEEDBACK_RETENTION,
      this.KEY_LAST_CLEANUP,
      this.KEY_STORAGE_BYTES,
    ]);

    // Default values (per plan v2.7: 90 days default)
    return {
      email_metadata_retention_days:
        (config[this.KEY_EMAIL_RETENTION] as RetentionPeriod) ?? RETENTION_PERIODS.DAYS_90,
      feedback_retention_days:
        (config[this.KEY_FEEDBACK_RETENTION] as RetentionPeriod) ?? RETENTION_PERIODS.DAYS_90,
      last_cleanup_at:
        (config[this.KEY_LAST_CLEANUP] as number) ?? Math.floor(Date.now() / 1000),
      estimated_storage_bytes:
        (config[this.KEY_STORAGE_BYTES] as number) ?? 0,
    };
  }

  /**
   * Set email metadata retention period
   *
   * Per plan v2.7: Triggers immediate cleanup when retention period changes.
   *
   * @param days - Retention period in days (-1 for permanent)
   * @param options - Cleanup options (immediate cleanup, confirmation)
   * @throws Error if days value is invalid
   */
  static async setEmailRetention(
    days: RetentionPeriod,
    options: CleanupOptions = DEFAULT_CLEANUP_OPTIONS
  ): Promise<void> {
    this.validateRetentionDays(days);

    // Get current retention period to check if it's changing
    const currentConfig = await this.get();
    const oldDays = currentConfig.email_metadata_retention_days;

    // Update retention period
    await ConfigManager.set({
      [this.KEY_EMAIL_RETENTION]: days,
    });

    logger.info('DataRetentionConfig', 'Email metadata retention period updated', {
      old_days: oldDays,
      new_days: days,
    });

    // Trigger immediate cleanup if requested and retention period changed
    if (options.performImmediateCleanup && oldDays !== days) {
      logger.info('DataRetentionConfig', 'Triggering immediate cleanup after retention change');

      try {
        const result = await performRetentionCleanup();

        logger.info('DataRetentionConfig', 'Immediate cleanup completed', {
          email_metadata_deleted: result.email_metadata_deleted,
          feedback_deleted: result.feedback_deleted,
          message: result.message,
        });

        // Return cleanup result to caller
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error('DataRetentionConfig', 'Immediate cleanup failed', {
          error: errorMessage,
        });

        throw new Error(`Retention period updated, but cleanup failed: ${errorMessage}`);
      }
    }
  }

  /**
   * Set feedback retention period
   *
   * Per plan v2.7: Feedback retention uses same options as email metadata.
   * Triggers immediate cleanup when retention period changes.
   *
   * @param days - Retention period in days (-1 for permanent)
   * @param options - Cleanup options (immediate cleanup, confirmation)
   * @throws Error if days value is invalid
   */
  static async setFeedbackRetention(
    days: RetentionPeriod,
    options: CleanupOptions = DEFAULT_CLEANUP_OPTIONS
  ): Promise<void> {
    this.validateRetentionDays(days);

    // Get current retention period to check if it's changing
    const currentConfig = await this.get();
    const oldDays = currentConfig.feedback_retention_days;

    // Update retention period
    await ConfigManager.set({
      [this.KEY_FEEDBACK_RETENTION]: days,
    });

    logger.info('DataRetentionConfig', 'Feedback retention period updated', {
      old_days: oldDays,
      new_days: days,
    });

    // Trigger immediate cleanup if requested and retention period changed
    if (options.performImmediateCleanup && oldDays !== days) {
      logger.info('DataRetentionConfig', 'Triggering immediate cleanup after retention change');

      try {
        const result = await performRetentionCleanup();

        logger.info('DataRetentionConfig', 'Immediate cleanup completed', {
          email_metadata_deleted: result.email_metadata_deleted,
          feedback_deleted: result.feedback_deleted,
          message: result.message,
        });

        // Return cleanup result to caller
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error('DataRetentionConfig', 'Immediate cleanup failed', {
          error: errorMessage,
        });

        throw new Error(`Retention period updated, but cleanup failed: ${errorMessage}`);
      }
    }
  }

  /**
   * Set both retention periods at once
   *
   * Per plan v2.7: Triggers immediate cleanup when retention periods change.
   *
   * @param emailDays - Email metadata retention period
   * @param feedbackDays - Feedback retention period
   * @param options - Cleanup options (immediate cleanup, confirmation)
   * @throws Error if either value is invalid
   */
  static async setRetentionPeriods(
    emailDays: RetentionPeriod,
    feedbackDays: RetentionPeriod,
    options: CleanupOptions = DEFAULT_CLEANUP_OPTIONS
  ): Promise<void> {
    this.validateRetentionDays(emailDays);
    this.validateRetentionDays(feedbackDays);

    // Get current retention periods to check if they're changing
    const currentConfig = await this.get();
    const oldEmailDays = currentConfig.email_metadata_retention_days;
    const oldFeedbackDays = currentConfig.feedback_retention_days;

    const emailChanged = oldEmailDays !== emailDays;
    const feedbackChanged = oldFeedbackDays !== feedbackDays;

    // Update retention periods
    await ConfigManager.set({
      [this.KEY_EMAIL_RETENTION]: emailDays,
      [this.KEY_FEEDBACK_RETENTION]: feedbackDays,
    });

    logger.info('DataRetentionConfig', 'Retention periods updated', {
      email_metadata_retention_days: { old: oldEmailDays, new: emailDays },
      feedback_retention_days: { old: oldFeedbackDays, new: feedbackDays },
    });

    // Trigger immediate cleanup if requested and any retention period changed
    if (options.performImmediateCleanup && (emailChanged || feedbackChanged)) {
      logger.info('DataRetentionConfig', 'Triggering immediate cleanup after retention change');

      try {
        const result = await performRetentionCleanup();

        logger.info('DataRetentionConfig', 'Immediate cleanup completed', {
          email_metadata_deleted: result.email_metadata_deleted,
          feedback_deleted: result.feedback_deleted,
          message: result.message,
        });

        // Return cleanup result to caller
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.error('DataRetentionConfig', 'Immediate cleanup failed', {
          error: errorMessage,
        });

        throw new Error(`Retention periods updated, but cleanup failed: ${errorMessage}`);
      }
    }
  }

  /**
   * Update last cleanup timestamp
   *
   * Called after retention cleanup runs.
   */
  static async updateLastCleanup(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    await ConfigManager.set({
      [this.KEY_LAST_CLEANUP]: now,
    });

    logger.info('DataRetentionConfig', 'Last cleanup timestamp updated', {
      last_cleanup_at: now,
    });
  }

  /**
   * Update estimated storage usage
   *
   * @param bytes - Storage usage in bytes
   */
  static async updateStorageUsage(bytes: number): Promise<void> {
    await ConfigManager.set({
      [this.KEY_STORAGE_BYTES]: bytes,
    });

    logger.debug('DataRetentionConfig', 'Storage usage updated', {
      estimated_storage_bytes: bytes,
    });
  }

  /**
   * Get retention period as human-readable label
   *
   * @param days - Retention period in days
   * @returns Human-readable label (e.g., "30天", "永久")
   */
  static getRetentionLabel(days: RetentionPeriod): string {
    if (days === RETENTION_PERIODS.PERMANENT) {
      return '永久';
    }
    return `${days}天`;
  }

  /**
   * Parse retention label to days value
   *
   * @param label - Human-readable label (e.g., "30天", "永久")
   * @returns Retention period in days
   * @throws Error if label is invalid
   */
  static parseRetentionLabel(label: string): RetentionPeriod {
    if (label === '永久') {
      return RETENTION_PERIODS.PERMANENT;
    }

    const match = label.match(/^(\d+)天$/);
    if (!match) {
      throw new Error(`Invalid retention label: ${label}`);
    }

    const days = parseInt(match[1], 10);
    if (!VALID_RETENTION_DAYS.includes(days)) {
      throw new Error(`Invalid retention period: ${days}`);
    }

    return days as RetentionPeriod;
  }

  /**
   * Check if retention period is permanent
   *
   * @param days - Retention period in days
   * @returns True if permanent (-1)
   */
  static isPermanentRetention(days: RetentionPeriod): boolean {
    return days === RETENTION_PERIODS.PERMANENT;
  }

  /**
   * Validate retention days value
   *
   * @param days - Retention period in days
   * @throws Error if days value is invalid
   */
  private static validateRetentionDays(days: RetentionPeriod): void {
    if (!VALID_RETENTION_DAYS.includes(days)) {
      throw new Error(
        `Invalid retention period: ${days}. Must be one of: ${VALID_RETENTION_DAYS.join(', ')}`
      );
    }
  }

  /**
   * Calculate cleanup timestamp based on retention period
   *
   * Returns null if permanent (never cleanup).
   *
   * @param retentionDays - Retention period in days
   * @returns Unix timestamp for cleanup cutoff, or null if permanent
   */
  static getCleanupCutoff(retentionDays: RetentionPeriod): number | null {
    if (this.isPermanentRetention(retentionDays)) {
      return null; // Never cleanup
    }

    const now = Math.floor(Date.now() / 1000);
    const cutoffSeconds = retentionDays * 24 * 60 * 60;
    return now - cutoffSeconds;
  }

  /**
   * Get all available retention options
   *
   * @returns Array of {value, label} pairs for UI dropdown
   */
  static getRetentionOptions(): Array<{ value: RetentionPeriod; label: string }> {
    return [
      { value: RETENTION_PERIODS.DAYS_30, label: '30天' },
      { value: RETENTION_PERIODS.DAYS_90, label: '90天' },
      { value: RETENTION_PERIODS.DAYS_180, label: '180天' },
      { value: RETENTION_PERIODS.DAYS_365, label: '365天' },
      { value: RETENTION_PERIODS.PERMANENT, label: '永久' },
    ];
  }

  /**
   * Get cleanup preview for retention change
   *
   * Returns count of records that would be deleted if cleanup were run.
   * Useful for showing confirmation dialog to user.
   *
   * @param emailDays - Email metadata retention period
   * @param feedbackDays - Feedback retention period
   * @returns Object with email and feedback counts
   */
  static async getCleanupPreview(emailDays: RetentionPeriod, feedbackDays: RetentionPeriod): Promise<{
    email_count: number;
    feedback_count: number;
  }> {
    const emailPreview = getCleanupPreview(emailDays);
    const feedbackPreview = getCleanupPreview(feedbackDays);

    return {
      email_count: emailPreview.email_count,
      feedback_count: feedbackPreview.feedback_count,
    };
  }

  /**
   * Reset to default configuration
   *
   * Resets both retention periods to 90 days (default per plan v2.7).
   * Does not trigger immediate cleanup; next scheduled cleanup will apply.
   */
  static async resetToDefaults(): Promise<void> {
    await this.setRetentionPeriods(
      RETENTION_PERIODS.DAYS_90,
      RETENTION_PERIODS.DAYS_90,
      { performImmediateCleanup: false, showConfirmation: false }
    );

    logger.info('DataRetentionConfig', 'Reset to default retention periods (90 days)');
  }

  /**
   * Export configuration as plain object (for display/export)
   *
   * Note: This does NOT export encrypted data, just the configuration values.
   *
   * @returns Configuration object with human-readable values
   */
  static async exportConfig(): Promise<{
    email_metadata_retention_label: string;
    feedback_retention_label: string;
    last_cleanup_at: string;
    estimated_storage_mb: number;
  }> {
    const config = await this.get();

    return {
      email_metadata_retention_label: this.getRetentionLabel(
        config.email_metadata_retention_days
      ),
      feedback_retention_label: this.getRetentionLabel(
        config.feedback_retention_days
      ),
      last_cleanup_at: new Date(
        config.last_cleanup_at * 1000
      ).toISOString(),
      estimated_storage_mb: config.estimated_storage_bytes / (1024 * 1024),
    };
  }
}

export default DataRetentionConfigRepository;

// Re-export cleanup functions for convenience
export {
  performRetentionCleanup,
  performManual30DayCleanup,
  getCleanupPreview as getCleanupPreviewFn,
  getStorageUsage,
  startScheduledCleanup,
  stopScheduledCleanup,
} from '../cleanup.js';
