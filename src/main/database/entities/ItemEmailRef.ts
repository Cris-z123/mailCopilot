import DatabaseManager from '../Database.js';
import { logger } from '../../config/logger.js';

/**
 * Item-Email Reference Entity (Many-to-Many Relationship)
 *
 * Represents the many-to-many relationship between action items and email sources.
 * This model prevents hallucination by ensuring every action item has verifiable
 * source attribution with evidence and confidence scores.
 *
 * Table Schema: item_email_refs
 * - ref_id: TEXT PRIMARY KEY (UUID)
 * - item_id: TEXT NOT NULL FOREIGN KEY → todo_items(item_id) ON DELETE CASCADE
 * - email_hash: TEXT NOT NULL FOREIGN KEY → processed_emails(email_hash)
 * - evidence_text: TEXT NOT NULL (Model extraction rationale, desensitized)
 * - confidence: INTEGER CHECK(>= 0 AND <= 100) (LLM confidence for this association)
 * - created_at: INTEGER NOT NULL (Unix timestamp)
 *
 * Per plan.md:
 * - FR-005: 100% traceability (all items have source association)
 * - FR-006: Never silently drop items (degradation with unverified status)
 * - FR-017: Degraded items (confidence ≤ 0.6, source_status='unverified')
 * - Anti-hallucination: Prevents LLM from inventing items without source
 */

/**
 * Item-Email reference data interface (excluding ref_id which is generated)
 */
export interface ItemEmailRefData {
  item_id: string; // FK → todo_items(item_id)
  email_hash: string; // FK → processed_emails(email_hash)
  evidence_text: string; // Model extraction rationale (desensitized)
  confidence: number; // 0-100, LLM confidence for this association
  created_at?: number; // Unix timestamp, defaults to now
}

/**
 * Complete ItemEmailRef entity including primary key
 */
export interface ItemEmailRef extends ItemEmailRefData {
  ref_id: string; // UUID
  created_at: number; // Unix timestamp
}

/**
 * Item source reference with email metadata for UI display
 *
 * Per plan.md IPC schema for get_items response
 */
export interface ItemSourceRef {
  email_hash: string;
  search_string: string;
  file_path: string;
  evidence_text: string;
  confidence: number;
}

/**
 * Repository class for ItemEmailRef entity operations
 *
 * Provides database access methods for item-email relationship tracking,
 * source attribution, and anti-hallucination enforcement.
 */
export class ItemEmailRefRepository {
  private static readonly TABLE_NAME = 'item_email_refs';

  /**
   * Create a new item-email reference
   *
   * Creates a link between an action item and an email source,
   * establishing verifiable traceability per FR-005.
   *
   * @param ref_id - UUID for the reference
   * @param data - Item-email reference data
   * @returns The created item-email reference
   * @throws Error if insertion fails or foreign key constraints violated
   */
  static create(ref_id: string, data: ItemEmailRefData): ItemEmailRef {
    const db = DatabaseManager.getDatabase();

    const now = Math.floor(Date.now() / 1000);
    const created_at = data.created_at ?? now;

    const stmt = db.prepare(`
      INSERT INTO ${this.TABLE_NAME} (
        ref_id,
        item_id,
        email_hash,
        evidence_text,
        confidence,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        ref_id,
        data.item_id,
        data.email_hash,
        data.evidence_text,
        data.confidence,
        created_at
      );

      logger.info('ItemEmailRef', `Created item-email reference: ${ref_id}`, {
        ref_id,
        item_id: data.item_id,
        email_hash: data.email_hash,
        confidence: data.confidence,
      });
    } catch (error) {
      logger.error('ItemEmailRef', `Failed to create item-email reference: ${ref_id}`, {
        ref_id,
        item_id: data.item_id,
        email_hash: data.email_hash,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return this.findByRefId(ref_id) as ItemEmailRef;
  }

  /**
   * Find item-email reference by ID
   *
   * @param ref_id - UUID of the reference
   * @returns Item-email reference or null if not found
   */
  static findByRefId(ref_id: string): ItemEmailRef | null {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      SELECT
        ref_id,
        item_id,
        email_hash,
        evidence_text,
        confidence,
        created_at
      FROM ${this.TABLE_NAME}
      WHERE ref_id = ?
    `);

    const row = stmt.get(ref_id) as ItemEmailRef | undefined;
    return row ?? null;
  }

  /**
   * Find all email references for a specific item
   *
   * Returns all email sources associated with an action item.
   * Per FR-005: All items must have at least one source reference.
   *
   * @param item_id - UUID of the action item
   * @returns Array of item-email references
   */
  static findByItemId(item_id: string): ItemEmailRef[] {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      SELECT
        ref_id,
        item_id,
        email_hash,
        evidence_text,
        confidence,
        created_at
      FROM ${this.TABLE_NAME}
      WHERE item_id = ?
      ORDER BY confidence DESC, created_at ASC
    `);

    return stmt.all(item_id) as ItemEmailRef[];
  }

  /**
   * Find all item references for a specific email
   *
   * Returns all action items extracted from an email source.
   *
   * @param email_hash - SHA-256 fingerprint of the email
   * @returns Array of item-email references
   */
  static findByEmailHash(email_hash: string): ItemEmailRef[] {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      SELECT
        ref_id,
        item_id,
        email_hash,
        evidence_text,
        confidence,
        created_at
      FROM ${this.TABLE_NAME}
      WHERE email_hash = ?
      ORDER BY confidence DESC, created_at ASC
    `);

    return stmt.all(email_hash) as ItemEmailRef[];
  }

  /**
   * Find all item references for a specific item with email metadata
   *
   * Joins with processed_emails to include search_string and file_path
   * for UI display per plan.md IPC schema.
   *
   * @param item_id - UUID of the action item
   * @returns Array of item source references with email metadata
   */
  static findSourcesByItemId(item_id: string): ItemSourceRef[] {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      SELECT
        refs.ref_id,
        refs.item_id,
        refs.email_hash,
        refs.evidence_text,
        refs.confidence,
        refs.created_at,
        emails.search_string,
        emails.file_path
      FROM ${this.TABLE_NAME} refs
      INNER JOIN processed_emails emails ON refs.email_hash = emails.email_hash
      WHERE refs.item_id = ?
      ORDER BY refs.confidence DESC, refs.created_at ASC
    `);

    const rows = stmt.all(item_id) as Array<{
      ref_id: string;
      item_id: string;
      email_hash: string;
      evidence_text: string;
      confidence: number;
      created_at: number;
      search_string: string;
      file_path: string;
    }>;

    return rows.map((row) => ({
      email_hash: row.email_hash,
      search_string: row.search_string,
      file_path: row.file_path,
      evidence_text: row.evidence_text,
      confidence: row.confidence,
    }));
  }

  /**
   * Update evidence text and confidence for a reference
   *
   * Used when LLM re-evaluates item-email associations
   * or when user provides feedback affecting confidence.
   *
   * @param ref_id - UUID of the reference
   * @param evidence_text - Updated evidence text
   * @param confidence - Updated confidence score (0-100)
   * @returns Updated item-email reference or null if not found
   */
  static update(ref_id: string, evidence_text: string, confidence: number): ItemEmailRef | null {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      UPDATE ${this.TABLE_NAME}
      SET evidence_text = ?, confidence = ?
      WHERE ref_id = ?
    `);

    const result = stmt.run(evidence_text, confidence, ref_id);

    if (result.changes > 0) {
      logger.info('ItemEmailRef', `Updated reference: ${ref_id}`, {
        ref_id,
        confidence,
      });
      return this.findByRefId(ref_id);
    }

    return null;
  }

  /**
   * Delete item-email reference by ID
   *
   * Use with caution: Items should maintain at least one source reference
   * per FR-005 (100% traceability requirement).
   *
   * @param ref_id - UUID of the reference
   * @returns True if deleted, false if not found
   */
  static delete(ref_id: string): boolean {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`DELETE FROM ${this.TABLE_NAME} WHERE ref_id = ?`);
    const result = stmt.run(ref_id);

    if (result.changes > 0) {
      logger.info('ItemEmailRef', `Deleted item-email reference: ${ref_id}`, {
        ref_id,
      });
      return true;
    }

    return false;
  }

  /**
   * Delete all references for a specific item
   *
   * Automatically called via ON DELETE CASCADE when item is deleted.
   * This method is provided for manual cleanup if needed.
   *
   * @param item_id - UUID of the action item
   * @returns Number of deleted references
   */
  static deleteByItemId(item_id: string): number {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`DELETE FROM ${this.TABLE_NAME} WHERE item_id = ?`);
    const result = stmt.run(item_id);

    if (result.changes > 0) {
      logger.info('ItemEmailRef', `Deleted ${result.changes} references for item: ${item_id}`, {
        item_id,
        count: result.changes,
      });
    }

    return result.changes;
  }

  /**
   * Delete all references for a specific email
   *
   * Used when email source is deleted from processed_emails.
   *
   * @param email_hash - SHA-256 fingerprint of the email
   * @returns Number of deleted references
   */
  static deleteByEmailHash(email_hash: string): number {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`DELETE FROM ${this.TABLE_NAME} WHERE email_hash = ?`);
    const result = stmt.run(email_hash);

    if (result.changes > 0) {
      logger.info('ItemEmailRef', `Deleted ${result.changes} references for email: ${email_hash}`, {
        email_hash,
        count: result.changes,
      });
    }

    return result.changes;
  }

  /**
   * Get total count of item-email references
   *
   * @returns Total number of references
   */
  static count(): number {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${this.TABLE_NAME}`);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Get count of references for a specific item
   *
   * Per FR-005: Should return ≥1 for all valid items.
   *
   * @param item_id - UUID of the action item
   * @returns Number of email sources for this item
   */
  static countByItemId(item_id: string): number {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(
      `SELECT COUNT(*) as count FROM ${this.TABLE_NAME} WHERE item_id = ?`
    );
    const result = stmt.get(item_id) as { count: number };
    return result.count;
  }

  /**
   * Get count of references for a specific email
   *
   * @param email_hash - SHA-256 fingerprint of the email
   * @returns Number of items extracted from this email
   */
  static countByEmailHash(email_hash: string): number {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(
      `SELECT COUNT(*) as count FROM ${this.TABLE_NAME} WHERE email_hash = ?`
    );
    const result = stmt.get(email_hash) as { count: number };
    return result.count;
  }

  /**
   * Check if an item has any source references
   *
   * Per FR-005: Items without sources violate 100% traceability requirement.
   *
   * @param item_id - UUID of the action item
   * @returns True if item has at least one source reference
   */
  static hasReferences(item_id: string): boolean {
    return this.countByItemId(item_id) > 0;
  }

  /**
   * Batch create item-email references within a transaction
   *
   * Per plan.md: Use transaction wrapping for bulk inserts to improve performance.
   * Creates multiple references efficiently for items with multiple sources.
   *
   * @param refs - Array of {ref_id, data} tuples
   * @returns Array of created reference IDs
   */
  static batchCreate(refs: Array<{ ref_id: string; data: ItemEmailRefData }>): string[] {
    return DatabaseManager.transaction(() => {
      const created: string[] = [];

      for (const { ref_id, data } of refs) {
        try {
          const ref = this.create(ref_id, data);
          created.push(ref.ref_id);
        } catch (error) {
          logger.error('ItemEmailRef', `Failed to create reference in batch: ${ref_id}`, {
            ref_id,
            item_id: data.item_id,
            email_hash: data.email_hash,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue with next item (batch partial failure handling)
        }
      }

      logger.info('ItemEmailRef', `Batch created ${created.length}/${refs.length} references`, {
        created: created.length,
        total: refs.length,
      });

      return created;
    });
  }

  /**
   * Validate traceability for an item
   *
   * Per FR-005: Ensures item has verifiable source attribution.
   * Returns validation result with details.
   *
   * @param item_id - UUID of the action item
   * @returns Validation result with hasReferences, referenceCount, and avgConfidence
   */
  static validateTraceability(item_id: string): {
    hasReferences: boolean;
    referenceCount: number;
    avgConfidence: number;
    isValid: boolean;
  } {
    const refs = this.findByItemId(item_id);
    const referenceCount = refs.length;

    if (referenceCount === 0) {
      return {
        hasReferences: false,
        referenceCount: 0,
        avgConfidence: 0,
        isValid: false,
      };
    }

    const totalConfidence = refs.reduce((sum, ref) => sum + ref.confidence, 0);
    const avgConfidence = totalConfidence / referenceCount;

    return {
      hasReferences: true,
      referenceCount,
      avgConfidence,
      isValid: true, // Has at least one reference
    };
  }

  /**
   * Get high-confidence references for an item
   *
   * Returns references with confidence ≥ threshold.
   * Useful for identifying strong vs weak source associations.
   *
   * @param item_id - UUID of the action item
   * @param minConfidence - Minimum confidence threshold (0-100, default 60)
   * @returns Array of high-confidence references
   */
  static findHighConfidenceReferences(item_id: string, minConfidence: number = 60): ItemEmailRef[] {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`
      SELECT
        ref_id,
        item_id,
        email_hash,
        evidence_text,
        confidence,
        created_at
      FROM ${this.TABLE_NAME}
      WHERE item_id = ? AND confidence >= ?
      ORDER BY confidence DESC, created_at ASC
    `);

    return stmt.all(item_id, minConfidence) as ItemEmailRef[];
  }

  /**
   * Delete references older than specified timestamp
   *
   * Used for data retention cleanup per FR-041, FR-042, FR-043.
   * Note: Cascade deletes from item/email deletion handle most cases.
   *
   * @param older_than - Unix timestamp, delete refs with created_at < this value
   * @returns Number of deleted references
   */
  static deleteOlderThan(older_than: number): number {
    const db = DatabaseManager.getDatabase();

    const stmt = db.prepare(`DELETE FROM ${this.TABLE_NAME} WHERE created_at < ?`);
    const result = stmt.run(older_than);

    logger.info('ItemEmailRef', `Deleted ${result.changes} references older than ${older_than}`, {
      count: result.changes,
      older_than,
    });

    return result.changes;
  }
}

export default ItemEmailRefRepository;
