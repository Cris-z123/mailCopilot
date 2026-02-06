import DatabaseManager from '../Database.js';
import { logger } from '@/config/logger.js';
import { ConfigManager } from '@/config/ConfigManager.js';
import crypto from 'crypto';

/**
 * Action Item Entity (Todo Item)
 *
 * Represents extracted action items from emails with encrypted content.
 * This model provides CRUD operations for action item tracking with
 * field-level encryption and source verification status.
 *
 * Table Schema: todo_items
 * - item_id: TEXT PRIMARY KEY (UUID)
 * - report_date: TEXT FOREIGN KEY → daily_reports(report_date)
 * - content_encrypted: BLOB NOT NULL (AES-256-GCM encrypted item content)
 * - content_checksum: TEXT NOT NULL (SHA-256 hash for tamper detection)
 * - item_type: TEXT NOT NULL CHECK('completed', 'pending')
 * - tags: TEXT NOT NULL DEFAULT '[]' (JSON array of tag strings)
 * - created_at: INTEGER NOT NULL (Unix timestamp)
 * - is_manually_edited: INTEGER NOT NULL DEFAULT 0 (0 or 1)
 * - source_status: TEXT NOT NULL DEFAULT 'verified' CHECK('verified', 'unverified')
 * - confidence_score: REAL CHECK(>= 0 AND <= 1)
 * - feedback_type: TEXT CHECK('content_error', 'priority_error', 'not_actionable', 'source_error')
 *
 * Per plan.md:
 * - FR-005: 100% traceability (all items have source association)
 * - FR-010: Confidence calculation (rules 50% + LLM 50%, cap at 0.6 for schema failures)
 * - FR-011: Confidence thresholds (≥0.8 normal, 0.6-0.79 "建议复核", <0.6 "来源待确认")
 * - FR-022: User feedback types (4 error categories)
 * - R0-3: AES-256-GCM field-level encryption
 * - R0-5: Degradation handling (source_status='unverified' when schema fails)
 */

/**
 * Item type enum for action item classification
 */
export enum ItemType {
  COMPLETED = 'completed',
  PENDING = 'pending',
}

/**
 * Source status enum for traceability verification
 *
 * Per plan.md R0-5: Degraded items have source_status='unverified'
 * Transition verified → unverified is PROHIBITED (one-way degradation)
 */
export enum SourceStatus {
  VERIFIED = 'verified',
  UNVERIFIED = 'unverified',
}

/**
 * Feedback type enum for user error reporting
 *
 * Per plan.md FR-022: 4 error categories when user marks item as incorrect
 */
export enum FeedbackType {
  CONTENT_ERROR = 'content_error',       // Item content incorrect
  PRIORITY_ERROR = 'priority_error',     // Item type wrong (completed/pending)
  NOT_ACTIONABLE = 'not_actionable',     // Not an actionable item
  SOURCE_ERROR = 'source_error',         // Wrong source email
}

/**
 * Confidence level classification for UI display
 *
 * Per plan.md FR-011:
 * - ≥0.8: High confidence, no warning
 * - 0.6-0.79: Medium confidence, "[建议复核]" tag
 * - <0.6: Low confidence, "[来源待确认]" tag
 */
export enum ConfidenceLevel {
  HIGH = 'high',        // ≥0.8
  MEDIUM = 'medium',    // 0.6-0.79
  LOW = 'low',          // <0.6
}

/**
 * Action item data interface (excluding item_id which is generated)
 */
export interface ActionItemData {
  report_date: string; // Format: YYYY-MM-DD
  content: string; // Plain text content (will be encrypted)
  item_type: ItemType;
  tags?: string[]; // Array of tag strings
  created_at?: number; // Unix timestamp, defaults to now
  is_manually_edited?: boolean; // Default false
  source_status?: SourceStatus; // Default 'verified'
  confidence_score?: number; // 0.0 - 1.0
  feedback_type?: FeedbackType; // Optional user feedback
}

/**
 * Complete ActionItem entity including primary key
 */
export interface ActionItem extends ActionItemData {
  item_id: string; // UUID
  content_encrypted: string; // Base64 encoded encrypted content
  content_checksum: string; // SHA-256 hash for tamper detection
  tags: string[]; // JSON array as string[]
  is_manually_edited: boolean; // 0 or 1 as boolean
  created_at: number; // Unix timestamp
  source_status: SourceStatus;
  confidence_score: number;
  feedback_type?: FeedbackType;
}

/**
 * Decrypted action item for display in UI
 */
export interface DecryptedActionItem {
  item_id: string;
  report_date: string;
  content: string;
  item_type: ItemType;
  source_status: SourceStatus;
  confidence_score: number;
  tags: string[];
  feedback_type?: FeedbackType;
  created_at: number;
}

/**
 * Repository class for ActionItem entity operations
 *
 * Provides database access methods for action item tracking,
 * encryption/decryption, and feedback management.
 */
export class ActionItemRepository {
  private static readonly TABLE_NAME = 'todo_items';

  /**
   * Create a new action item record
   *
   * Content is encrypted using AES-256-GCM before storage.
   * SHA-256 checksum is computed for tamper detection.
   *
   * @param item_id - UUID for the item
   * @param data - Action item data (content will be encrypted)
   * @returns The created action item record
   * @throws Error if insertion fails
   */
  static async create(item_id: string, data: ActionItemData): Promise<ActionItem> {
    const db = DatabaseManager.getDatabase();

    const now = Math.floor(Date.now() / 1000);
    const created_at = data.created_at ?? now;

    // Encrypt content
    const content_encrypted_json = await ConfigManager.encryptField(data.content);
    const content_encrypted = Buffer.from(content_encrypted_json, 'utf-8');
    const content_checksum = crypto
      .createHash('sha256')
      .update(data.content)
      .digest('hex');

    // Convert tags array to JSON string
    const tags_json = JSON.stringify(data.tags ?? []);

    // Convert boolean to integer (0 or 1)
    const is_manually_edited = (data.is_manually_edited ?? false) ? 1 : 0;

    const stmt = db.prepare(`
      INSERT INTO ${this.TABLE_NAME} (
        item_id,
        report_date,
        content_encrypted,
        content_checksum,
        item_type,
        tags,
        created_at,
        is_manually_edited,
        source_status,
        confidence_score,
        feedback_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        item_id,
        data.report_date,
        content_encrypted,
        content_checksum,
        data.item_type,
        tags_json,
        created_at,
        is_manually_edited,
        data.source_status ?? SourceStatus.VERIFIED,
        data.confidence_score ?? 0.0,
        data.feedback_type ?? null
      );

      logger.info('ActionItem', `Created action item: ${item_id}`, {
        item_id,
        report_date: data.report_date,
        item_type: data.item_type,
        source_status: data.source_status ?? SourceStatus.VERIFIED,
        confidence_score: data.confidence_score ?? 0.0,
      });
    } catch (error) {
      logger.error('ActionItem', `Failed to create action item: ${item_id}`, {
        item_id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return this.findById(item_id) as ActionItem;
  }

  /**
   * Find action item by ID
   *
   * @param item_id - UUID of the item
   * @returns Action item record or null if not found
   */
  static findById(item_id: string): ActionItem | null {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      SELECT
        item_id,
        report_date,
        content_encrypted,
        content_checksum,
        item_type,
        tags,
        created_at,
        is_manually_edited,
        source_status,
        confidence_score,
        feedback_type
      FROM ${this.TABLE_NAME}
      WHERE item_id = ?
    `);

    const row = stmt.get(item_id) as ActionItem | undefined;

    if (!row) {
      return null;
    }

    // Parse tags JSON to array
    row.tags = this.parseTags(row.tags as unknown as string);

    // Convert is_manually_edited to boolean
    row.is_manually_edited = Boolean(row.is_manually_edited);

    return row;
  }

  /**
   * Find and decrypt action item by ID
   *
   * @param item_id - UUID of the item
   * @returns Decrypted action item or null if not found
   */
  static async findByIdDecrypted(item_id: string): Promise<DecryptedActionItem | null> {
    const item = this.findById(item_id);

    if (!item) {
      return null;
    }

    // Verify content checksum
    const content = await ConfigManager.decryptField(item.content_encrypted);
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    if (checksum !== item.content_checksum) {
      logger.error('ActionItem', `Content checksum mismatch for item: ${item_id}`, {
        item_id,
        expected: item.content_checksum,
        actual: checksum,
      });
      throw new Error(`Content checksum mismatch for item ${item_id}`);
    }

    return {
      item_id: item.item_id,
      report_date: item.report_date,
      content,
      item_type: item.item_type,
      source_status: item.source_status,
      confidence_score: item.confidence_score,
      tags: item.tags,
      feedback_type: item.feedback_type,
      created_at: item.created_at,
    };
  }

  /**
   * Find all action items for a specific report date
   *
   * @param report_date - Report date (format: YYYY-MM-DD)
   * @returns Array of action items (encrypted)
   */
  static findByReportDate(report_date: string): ActionItem[] {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      SELECT
        item_id,
        report_date,
        content_encrypted,
        content_checksum,
        item_type,
        tags,
        created_at,
        is_manually_edited,
        source_status,
        confidence_score,
        feedback_type
      FROM ${this.TABLE_NAME}
      WHERE report_date = ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(report_date) as ActionItem[];

    return rows.map((row) => ({
      ...row,
      tags: this.parseTags(row.tags as unknown as string),
      is_manually_edited: Boolean(row.is_manually_edited),
    }));
  }

  /**
   * Find all action items for a specific report date (decrypted)
   *
   * @param report_date - Report date (format: YYYY-MM-DD)
   * @returns Array of decrypted action items
   */
  static async findByReportDateDecrypted(report_date: string): Promise<DecryptedActionItem[]> {
    const items = this.findByReportDate(report_date);

    const decrypted: DecryptedActionItem[] = [];

    for (const item of items) {
      try {
        const decryptedItem = await this.findByIdDecrypted(item.item_id);
        if (decryptedItem) {
          decrypted.push(decryptedItem);
        }
      } catch (error) {
        logger.error('ActionItem', `Failed to decrypt item: ${item.item_id}`, {
          item_id: item.item_id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Skip items that fail decryption
      }
    }

    return decrypted;
  }

  /**
   * Update action item content (with encryption)
   *
   * Updates content, checksum, and sets is_manually_edited flag.
   *
   * @param item_id - UUID of the item
   * @param content - New content (will be encrypted)
   * @returns Updated action item or null if not found
   */
  static async updateContent(item_id: string, content: string): Promise<ActionItem | null> {
    const db = DatabaseManager.getDatabase();

    // Encrypt new content
    const content_encrypted_json = await ConfigManager.encryptField(content);
    const content_encrypted = Buffer.from(content_encrypted_json, 'utf-8');
    const content_checksum = crypto.createHash('sha256').update(content).digest('hex');

    const stmt = db.prepare(`
      UPDATE ${this.TABLE_NAME}
      SET content_encrypted = ?,
          content_checksum = ?,
          is_manually_edited = 1
      WHERE item_id = ?
    `);

    const result = stmt.run(content_encrypted, content_checksum, item_id);

    if (result.changes > 0) {
      logger.info('ActionItem', `Updated content for item: ${item_id}`, {
        item_id,
        is_manually_edited: true,
      });
      return this.findById(item_id);
    }

    return null;
  }

  /**
   * Update action item type
   *
   * @param item_id - UUID of the item
   * @param item_type - New item type
   * @returns Updated action item or null if not found
   */
  static updateType(item_id: string, item_type: ItemType): ActionItem | null {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      UPDATE ${this.TABLE_NAME}
      SET item_type = ?
      WHERE item_id = ?
    `);

    const result = stmt.run(item_type, item_id);

    if (result.changes > 0) {
      logger.info('ActionItem', `Updated type for item: ${item_id}`, {
        item_id,
        item_type,
      });
      return this.findById(item_id);
    }

    return null;
  }

  /**
   * Update confidence score and source status
   *
   * Per plan.md FR-010: Confidence calculation with schema failure adjustment
   *
   * @param item_id - UUID of the item
   * @param confidence_score - New confidence score (0.0 - 1.0)
   * @param source_status - New source status
   * @returns Updated action item or null if not found
   */
  static updateConfidence(
    item_id: string,
    confidence_score: number,
    source_status: SourceStatus
  ): ActionItem | null {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      UPDATE ${this.TABLE_NAME}
      SET confidence_score = ?, source_status = ?
      WHERE item_id = ?
    `);

    const result = stmt.run(confidence_score, source_status, item_id);

    if (result.changes > 0) {
      logger.info('ActionItem', `Updated confidence for item: ${item_id}`, {
        item_id,
        confidence_score,
        source_status,
      });
      return this.findById(item_id);
    }

    return null;
  }

  /**
   * Submit user feedback for an action item
   *
   * Per plan.md FR-022: 4 error categories for user feedback
   *
   * @param item_id - UUID of the item
   * @param is_correct - Whether user marked item as correct (✓) or incorrect (✗)
   * @param feedback_type - Error type if marked incorrect
   * @returns Updated action item or null if not found
   */
  static submitFeedback(
    item_id: string,
    is_correct: boolean,
    feedback_type?: FeedbackType
  ): ActionItem | null {
    const db = DatabaseManager.getDatabase();

    // If marked correct, clear feedback_type
    // If marked incorrect, set feedback_type
    const stmt = db.prepare(`
      UPDATE ${this.TABLE_NAME}
      SET feedback_type = ?
      WHERE item_id = ?
    `);

    const feedback_value = is_correct ? null : feedback_type;
    const result = stmt.run(feedback_value, item_id);

    if (result.changes > 0) {
      logger.info('ActionItem', `Submitted feedback for item: ${item_id}`, {
        item_id,
        is_correct,
        feedback_type: feedback_value,
      });
      return this.findById(item_id);
    }

    return null;
  }

  /**
   * Delete action item by ID
   *
   * Cascade deletes will handle item_email_refs via ON DELETE CASCADE
   *
   * @param item_id - UUID of the item
   * @returns True if deleted, false if not found
   */
  static delete(item_id: string): boolean {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`DELETE FROM ${this.TABLE_NAME} WHERE item_id = ?`);
    const result = stmt.run(item_id);

    if (result.changes > 0) {
      logger.info('ActionItem', `Deleted action item: ${item_id}`, {
        item_id,
      });
      return true;
    }

    return false;
  }

  /**
   * Get total count of action items
   *
   * @returns Total number of action items
   */
  static count(): number {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${this.TABLE_NAME}`);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Get count of action items by type
   *
   * @param item_type - Item type to count
   * @returns Count of action items with the given type
   */
  static countByType(item_type: ItemType): number {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(
      `SELECT COUNT(*) as count FROM ${this.TABLE_NAME} WHERE item_type = ?`
    );
    const result = stmt.get(item_type) as { count: number };
    return result.count;
  }

  /**
   * Get count of action items by source status
   *
   * @param source_status - Source status to count
   * @returns Count of action items with the given status
   */
  static countBySourceStatus(source_status: SourceStatus): number {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(
      `SELECT COUNT(*) as count FROM ${this.TABLE_NAME} WHERE source_status = ?`
    );
    const result = stmt.get(source_status) as { count: number };
    return result.count;
  }

  /**
   * Delete all action items older than specified timestamp
   *
   * Used for data retention cleanup per FR-041, FR-042, FR-043
   *
   * @param older_than - Unix timestamp, delete items with created_at < this value
   * @returns Number of deleted action items
   */
  static deleteOlderThan(older_than: number): number {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`DELETE FROM ${this.TABLE_NAME} WHERE created_at < ?`);
    const result = stmt.run(older_than);

    logger.info('ActionItem', `Deleted ${result.changes} action items older than ${older_than}`, {
      count: result.changes,
      older_than,
    });

    return result.changes;
  }

  /**
   * Batch create action items within a transaction
   *
   * Per plan.md: Use transaction wrapping for bulk inserts to improve performance
   *
   * NOTE: This method is a simplified implementation. For production use with encryption,
   * items should be pre-encrypted before calling this method, or use individual create()
   * calls wrapped in a transaction.
   *
   * @param items - Array of {item_id, data} tuples
   * @returns Array of created item IDs
   */
  static async batchCreate(items: Array<{ item_id: string; data: ActionItemData }>): Promise<string[]> {
    const created: string[] = [];

    for (const { item_id, data } of items) {
      try {
        // Create each item individually (with encryption)
        // Note: This is not ideal for bulk operations but ensures encryption works
        // For true bulk operations, we'd need to refactor the encryption layer
        await this.create(item_id, data);
        created.push(item_id);
      } catch (error) {
        logger.error('ActionItem', `Failed to create action item in batch: ${item_id}`, {
          item_id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with next item (batch partial failure handling)
      }
    }

    logger.info('ActionItem', `Batch created ${created.length}/${items.length} action items`, {
      created: created.length,
      total: items.length,
    });

    return created;
  }

  /**
   * Parse tags JSON string to array
   *
   * @param tags_json - JSON string of tags
   * @returns Parsed tags array
   */
  static parseTags(tags_json: string | string[]): string[] {
    if (Array.isArray(tags_json)) {
      return tags_json;
    }

    try {
      const parsed = JSON.parse(tags_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      logger.warn('ActionItem', 'Failed to parse tags JSON', {
        tags_json,
      });
      return [];
    }
  }

  /**
   * Stringify tags array to JSON
   *
   * @param tags - Tags array
   * @returns JSON string
   */
  static stringifyTags(tags: string[]): string {
    try {
      return JSON.stringify(tags);
    } catch (error) {
      logger.error('ActionItem', 'Failed to stringify tags array', {
        tags,
        error: error instanceof Error ? error.message : String(error),
      });
      return '[]';
    }
  }

  /**
   * Get confidence level from score
   *
   * Per plan.md FR-011:
   * - ≥0.8: High confidence
   * - 0.6-0.79: Medium confidence
   * - <0.6: Low confidence
   *
   * @param confidence_score - Confidence score (0.0 - 1.0)
   * @returns Confidence level classification
   */
  static getConfidenceLevel(confidence_score: number): ConfidenceLevel {
    if (confidence_score >= 0.8) {
      return ConfidenceLevel.HIGH;
    } else if (confidence_score >= 0.6) {
      return ConfidenceLevel.MEDIUM;
    } else {
      return ConfidenceLevel.LOW;
    }
  }

  /**
   * Get confidence badge label for UI display
   *
   * Per plan.md FR-011:
   * - High: No badge
   * - Medium: "[建议复核]"
   * - Low: "[来源待确认]"
   *
   * @param confidence_level - Confidence level
   * @returns Badge label or empty string
   */
  static getConfidenceBadgeLabel(confidence_level: ConfidenceLevel): string {
    switch (confidence_level) {
      case ConfidenceLevel.HIGH:
        return '';
      case ConfidenceLevel.MEDIUM:
        return '[建议复核]';
      case ConfidenceLevel.LOW:
        return '[来源待确认]';
    }
  }
}

export default ActionItemRepository;
