import DatabaseManager from '../Database.js';
import { logger } from '@/config/logger.js';

/**
 * Email Source Entity
 *
 * Represents metadata for processed emails in the processed_emails table.
 * This model provides CRUD operations for email source tracking with
 * duplicate detection via SHA-256 fingerprint.
 *
 * Table Schema: processed_emails
 * - email_hash: TEXT PRIMARY KEY (SHA-256 fingerprint of Message-ID + Date + From)
 * - processed_at: INTEGER NOT NULL (Unix timestamp, first processing)
 * - last_seen_at: INTEGER NOT NULL (Unix timestamp, last seen for cross-batch dupes)
 * - report_date: TEXT FOREIGN KEY → daily_reports(report_date)
 * - attachments_meta: TEXT NOT NULL (JSON array of attachment metadata)
 * - extract_status: TEXT NOT NULL CHECK('success', 'no_content', 'error')
 * - error_log: TEXT (optional error details)
 * - search_string: TEXT (search format: from:sender subject:"snippet" date:YYYY-MM-DD)
 * - file_path: TEXT (original email file path)
 *
 * Per plan.md:
 * - FR-008A: Cross-batch duplicate detection with last_seen_at update
 * - SC-004: Message-ID extraction ≥95% for .eml format
 * - R0-4: SHA-256 fingerprint algorithm for duplicate detection
 */

/**
 * Extract status enum for email processing results
 */
export enum ExtractStatus {
  SUCCESS = 'success',
  NO_CONTENT = 'no_content',
  ERROR = 'error',
}

/**
 * Attachment metadata structure
 */
export interface AttachmentMetadata {
  filename: string;
  size: number;
  mime_type: string;
}

/**
 * Email source data interface (excluding email_hash which is derived)
 */
export interface EmailSourceData {
  processed_at?: number; // Unix timestamp, defaults to now
  last_seen_at?: number; // Unix timestamp, defaults to now
  report_date?: string; // Format: YYYY-MM-DD, optional
  attachments_meta?: string; // JSON string of AttachmentMetadata[]
  extract_status: ExtractStatus;
  error_log?: string; // Optional error details
  search_string?: string; // Search keywords string
  file_path?: string; // Original email file path
}

/**
 * Complete EmailSource entity including primary key
 */
export interface EmailSource extends EmailSourceData {
  email_hash: string; // SHA-256(Message-ID + Date + From)
}

/**
 * Repository class for EmailSource entity operations
 *
 * Provides database access methods for email source tracking,
 * duplicate detection, and metadata management.
 */
export class EmailSourceRepository {
  private static readonly TABLE_NAME = 'processed_emails';

  /**
   * Create a new email source record
   *
   * @param email_hash - SHA-256 fingerprint (computed from Message-ID + Date + From)
   * @param data - Email source data
   * @returns The created email source record
   * @throws Error if insertion fails (e.g., duplicate email_hash)
   */
  static create(email_hash: string, data: EmailSourceData): EmailSource {
    const db = DatabaseManager.getDatabase();

    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      INSERT INTO ${this.TABLE_NAME} (
        email_hash,
        processed_at,
        last_seen_at,
        report_date,
        attachments_meta,
        extract_status,
        error_log,
        search_string,
        file_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        email_hash,
        data.processed_at ?? now,
        data.last_seen_at ?? now,
        data.report_date ?? null,
        data.attachments_meta ?? '[]',
        data.extract_status,
        data.error_log ?? null,
        data.search_string ?? null,
        data.file_path ?? null
      );

      logger.info('EmailSource', `Created email source: ${email_hash}`, {
        email_hash,
        extract_status: data.extract_status,
      });
    } catch (error) {
      logger.error('EmailSource', `Failed to create email source: ${email_hash}`, {
        email_hash,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return this.findByHash(email_hash) as EmailSource;
  }

  /**
   * Find email source by hash
   *
   * @param email_hash - SHA-256 fingerprint
   * @returns Email source record or null if not found
   */
  static findByHash(email_hash: string): EmailSource | null {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      SELECT
        email_hash,
        processed_at,
        last_seen_at,
        report_date,
        attachments_meta,
        extract_status,
        error_log,
        search_string,
        file_path
      FROM ${this.TABLE_NAME}
      WHERE email_hash = ?
    `);

    const row = stmt.get(email_hash) as EmailSource | undefined;
    return row ?? null;
  }

  /**
   * Update last_seen_at timestamp for cross-batch duplicate detection
   *
   * Per FR-008A: When duplicate detected across batches, update timestamp
   * and skip creating new items, but log "跳过N封已处理邮件"
   *
   * @param email_hash - SHA-256 fingerprint
   * @returns Updated email source or null if not found
   */
  static updateLastSeen(email_hash: string): EmailSource | null {
    const db = DatabaseManager.getDatabase();

    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      UPDATE ${this.TABLE_NAME}
      SET last_seen_at = ?
      WHERE email_hash = ?
    `);

    const result = stmt.run(now, email_hash);

    if (result.changes > 0) {
      logger.info('EmailSource', `Updated last_seen_at for cross-batch duplicate: ${email_hash}`, {
        email_hash,
        last_seen_at: now,
      });
      return this.findByHash(email_hash);
    }

    return null;
  }

  /**
   * Update extract status and error log for an email source
   *
   * Used when email processing fails after initial creation
   *
   * @param email_hash - SHA-256 fingerprint
   * @param extract_status - New extract status
   * @param error_log - Optional error details
   * @returns Updated email source or null if not found
   */
  static updateStatus(
    email_hash: string,
    extract_status: ExtractStatus,
    error_log?: string
  ): EmailSource | null {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      UPDATE ${this.TABLE_NAME}
      SET extract_status = ?, error_log = ?
      WHERE email_hash = ?
    `);

    const result = stmt.run(extract_status, error_log ?? null, email_hash);

    if (result.changes > 0) {
      logger.info('EmailSource', `Updated extract status: ${email_hash}`, {
        email_hash,
        extract_status,
      });
      return this.findByHash(email_hash);
    }

    return null;
  }

  /**
   * Update search string and file path for an email source
   *
   * These fields may be populated after initial metadata extraction
   *
   * @param email_hash - SHA-256 fingerprint
   * @param search_string - Search keywords string (format: from:sender subject:"snippet" date:YYYY-MM-DD)
   * @param file_path - Original email file path
   * @returns Updated email source or null if not found
   */
  static updateTraceability(
    email_hash: string,
    search_string: string,
    file_path: string
  ): EmailSource | null {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      UPDATE ${this.TABLE_NAME}
      SET search_string = ?, file_path = ?
      WHERE email_hash = ?
    `);

    const result = stmt.run(search_string, file_path, email_hash);

    if (result.changes > 0) {
      logger.info('EmailSource', `Updated traceability info: ${email_hash}`, {
        email_hash,
        search_string,
        file_path,
      });
      return this.findByHash(email_hash);
    }

    return null;
  }

  /**
   * Delete email source by hash
   *
   * Cascade deletes will handle item_email_refs via ON DELETE CASCADE
   *
   * @param email_hash - SHA-256 fingerprint
   * @returns True if deleted, false if not found
   */
  static delete(email_hash: string): boolean {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`DELETE FROM ${this.TABLE_NAME} WHERE email_hash = ?`);
    const result = stmt.run(email_hash);

    if (result.changes > 0) {
      logger.info('EmailSource', `Deleted email source: ${email_hash}`, {
        email_hash,
      });
      return true;
    }

    return false;
  }

  /**
   * Find all email sources for a specific report date
   *
   * @param report_date - Report date (format: YYYY-MM-DD)
   * @returns Array of email sources for the report
   */
  static findByReportDate(report_date: string): EmailSource[] {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      SELECT
        email_hash,
        processed_at,
        last_seen_at,
        report_date,
        attachments_meta,
        extract_status,
        error_log,
        search_string,
        file_path
      FROM ${this.TABLE_NAME}
      WHERE report_date = ?
      ORDER BY processed_at DESC
    `);

    return stmt.all(report_date) as EmailSource[];
  }

  /**
   * Find all email sources with a specific extract status
   *
   * @param extract_status - Extract status to filter by
   * @returns Array of email sources with the given status
   */
  static findByExtractStatus(extract_status: ExtractStatus): EmailSource[] {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      SELECT
        email_hash,
        processed_at,
        last_seen_at,
        report_date,
        attachments_meta,
        extract_status,
        error_log,
        search_string,
        file_path
      FROM ${this.TABLE_NAME}
      WHERE extract_status = ?
      ORDER BY processed_at DESC
    `);

    return stmt.all(extract_status) as EmailSource[];
  }

  /**
   * Get total count of email sources
   *
   * @returns Total number of email sources
   */
  static count(): number {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${this.TABLE_NAME}`);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Get count of email sources by extract status
   *
   * @param extract_status - Extract status to count
   * @returns Count of email sources with the given status
   */
  static countByStatus(extract_status: ExtractStatus): number {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(
      `SELECT COUNT(*) as count FROM ${this.TABLE_NAME} WHERE extract_status = ?`
    );
    const result = stmt.get(extract_status) as { count: number };
    return result.count;
  }

  /**
   * Delete all email sources older than specified timestamp
   *
   * Used for data retention cleanup per FR-041, FR-042, FR-043
   *
   * @param older_than - Unix timestamp, delete emails with processed_at < this value
   * @returns Number of deleted email sources
   */
  static deleteOlderThan(older_than: number): number {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(
      `DELETE FROM ${this.TABLE_NAME} WHERE processed_at < ?`
    );
    const result = stmt.run(older_than);

    logger.info('EmailSource', `Deleted ${result.changes} email sources older than ${older_than}`, {
      count: result.changes,
      older_than,
    });

    return result.changes;
  }

  /**
   * Batch create email sources within a transaction
   *
   * Per plan.md: Use transaction wrapping for bulk inserts to improve performance
   *
   * @param emailSources - Array of {email_hash, data} tuples
   * @returns Array of created email sources
   */
  static batchCreate(
    emailSources: Array<{ email_hash: string; data: EmailSourceData }>
  ): EmailSource[] {
    return DatabaseManager.transaction(() => {
      const created: EmailSource[] = [];

      for (const { email_hash, data } of emailSources) {
        try {
          const emailSource = this.create(email_hash, data);
          created.push(emailSource);
        } catch (error) {
          logger.error('EmailSource', `Failed to create email source in batch: ${email_hash}`, {
            email_hash,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue with next item (batch partial failure handling)
        }
      }

      logger.info('EmailSource', `Batch created ${created.length}/${emailSources.length} email sources`, {
        created: created.length,
        total: emailSources.length,
      });

      return created;
    });
  }

  /**
   * Parse attachment metadata JSON string to array
   *
   * @param attachments_meta - JSON string of attachment metadata
   * @returns Parsed attachment metadata array
   */
  static parseAttachments(attachments_meta: string): AttachmentMetadata[] {
    try {
      const parsed = JSON.parse(attachments_meta);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      logger.warn('EmailSource', 'Failed to parse attachments_meta JSON', {
        attachments_meta,
      });
      return [];
    }
  }

  /**
   * Stringify attachment metadata array to JSON
   *
   * @param attachments - Attachment metadata array
   * @returns JSON string
   */
  static stringifyAttachments(attachments: AttachmentMetadata[]): string {
    try {
      return JSON.stringify(attachments);
    } catch (error) {
      logger.error('EmailSource', 'Failed to stringify attachments array', {
        attachments,
        error: error instanceof Error ? error.message : String(error),
      });
      return '[]';
    }
  }
}

export default EmailSourceRepository;
