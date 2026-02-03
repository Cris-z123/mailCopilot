/**
 * DuplicateDetector - Cross-batch duplicate detection for emails
 *
 * Implements SHA-256 fingerprint-based duplicate detection per plan.md R0-4:
 * - SHA-256 fingerprint: SHA256(Message-ID + Date + From)
 * - Same-batch detection: Skip entirely, log "跳过N封重复邮件"
 * - Cross-batch detection: Update last_seen_at timestamp, skip item creation
 *
 * Per FR-008A:
 * - Same-batch duplicates are skipped during processing
 * - Cross-batch duplicates update timestamp and skip item creation
 * - Audit logging for all duplicate detection scenarios
 *
 * @module main/email/DuplicateDetector
 */

import { createHash } from 'crypto';
import { logger } from '../config/logger';
import { EmailSourceRepository } from '../database/entities/EmailSource';
import { ParsedEmail } from './parsers/EmailParser';

/**
 * Result of duplicate check
 *
 * Provides information about whether an email is a duplicate
 * and what action should be taken.
 */
export interface DuplicateCheckResult {
  /** True if email is a duplicate (same-batch or cross-batch) */
  is_duplicate: boolean;

  /** Whether duplicate was found in current batch (same-batch) */
  is_same_batch: boolean;

  /** Whether duplicate was found from previous batch (cross-batch) */
  is_cross_batch: boolean;

  /** Existing email source record if cross-batch duplicate */
  existing_record?: {
    email_hash: string;
    processed_at: number;
    last_seen_at: number;
  };
}

/**
 * Duplicate detection statistics for batch processing
 *
 * Used for audit logging and reporting.
 */
export interface DuplicateStats {
  /** Count of same-batch duplicates (skipped entirely) */
  same_batch_count: number;

  /** Count of cross-batch duplicates (timestamp updated) */
  cross_batch_count: number;

  /** Set of email hashes in current batch for same-batch detection */
  batch_hashes: Set<string>;
}

/**
 * DuplicateDetector handles email duplicate detection using SHA-256 fingerprints
 *
 * Per plan.md R0-4 and FR-008A:
 * - SHA-256 fingerprint: SHA256(Message-ID + Date + From)
 * - Same-batch detection: Skip entirely, no database operation
 * - Cross-batch detection: Update last_seen_at timestamp
 * - Audit logging: Track all duplicate scenarios
 *
 * Usage:
 * ```typescript
 * const detector = new DuplicateDetector();
 * const stats = detector.createStats();
 *
 * for (const email of emails) {
 *   const result = await detector.checkDuplicate(email, stats);
 *   if (result.is_duplicate) {
 *     if (result.is_same_batch) {
 *       // Skip processing
 *     } else if (result.is_cross_batch) {
 *       // Update timestamp, skip item creation
 *     }
 *   } else {
 *     // Process normally
 *   }
 * }
 * ```
 */
export class DuplicateDetector {
  /**
   * Check if email is a duplicate
   *
   * @param email - Parsed email to check
   * @param stats - Duplicate statistics for current batch
   * @returns DuplicateCheckResult with duplicate status
   */
  async checkDuplicate(
    email: ParsedEmail,
    stats: DuplicateStats
  ): Promise<DuplicateCheckResult> {
    try {
      const { email_hash } = email;

      // Check same-batch duplicate first (in-memory check, fast)
      if (stats.batch_hashes.has(email_hash)) {
        logger.debug('DuplicateDetector', 'Same-batch duplicate detected', {
          email_hash,
          message_id: email.message_id,
          from: email.from,
          subject: email.subject,
        });

        stats.same_batch_count++;

        return {
          is_duplicate: true,
          is_same_batch: true,
          is_cross_batch: false,
        };
      }

      // Check cross-batch duplicate (database lookup)
      const existing = EmailSourceRepository.findByHash(email_hash);

      if (existing) {
        logger.debug('DuplicateDetector', 'Cross-batch duplicate detected', {
          email_hash,
          message_id: email.message_id,
          from: email.from,
          subject: email.subject,
          existing_processed_at: existing.processed_at,
          existing_last_seen_at: existing.last_seen_at,
        });

        // Update last_seen_at timestamp for cross-batch duplicate
        EmailSourceRepository.updateLastSeen(email_hash);

        stats.cross_batch_count++;

        return {
          is_duplicate: true,
          is_same_batch: false,
          is_cross_batch: true,
          existing_record: {
            email_hash: existing.email_hash,
            processed_at: existing.processed_at,
            last_seen_at: existing.last_seen_at,
          },
        };
      }

      // Not a duplicate - add to batch tracking
      stats.batch_hashes.add(email_hash);

      logger.debug('DuplicateDetector', 'Email is not a duplicate', {
        email_hash,
        message_id: email.message_id,
        from: email.from,
      });

      return {
        is_duplicate: false,
        is_same_batch: false,
        is_cross_batch: false,
      };
    } catch (error) {
      logger.error('DuplicateDetector', 'Error checking duplicate', error as Error, {
        email_hash: email.email_hash,
      });

      // On error, treat as not duplicate to allow processing
      // (Conservative approach: prefer false negatives over false positives)
      return {
        is_duplicate: false,
        is_same_batch: false,
        is_cross_batch: false,
      };
    }
  }

  /**
   * Create fresh duplicate statistics for batch processing
   *
   * @returns New DuplicateStats instance
   */
  createStats(): DuplicateStats {
    return {
      same_batch_count: 0,
      cross_batch_count: 0,
      batch_hashes: new Set<string>(),
    };
  }

  /**
   * Log duplicate detection summary for batch
   *
   * Per FR-008A: Log "跳过N封重复邮件" for same-batch
   * and "跳过N封已处理邮件" for cross-batch
   *
   * @param stats - Duplicate statistics from batch processing
   * @param total_emails - Total number of emails in batch
   */
  logSummary(stats: DuplicateStats, total_emails: number): void {
    const { same_batch_count, cross_batch_count } = stats;

    if (same_batch_count > 0) {
      logger.info('DuplicateDetector', `跳过${same_batch_count}封重复邮件`, {
        same_batch_count,
        total_emails,
      });
    }

    if (cross_batch_count > 0) {
      logger.info('DuplicateDetector', `跳过${cross_batch_count}封已处理邮件`, {
        cross_batch_count,
        total_emails,
      });
    }

    const total_duplicates = same_batch_count + cross_batch_count;
    if (total_duplicates > 0) {
      logger.info('DuplicateDetector', `Duplicate detection summary`, {
        total_duplicates,
        same_batch_count,
        cross_batch_count,
        total_emails,
        unique_emails: total_emails - same_batch_count,
      });
    }
  }

  /**
   * Batch check multiple emails for duplicates
   *
   * Optimized for processing multiple emails in a single call.
   * Returns arrays of duplicate and unique emails.
   *
   * @param emails - Array of parsed emails to check
   * @returns Object with duplicate and unique email arrays, plus stats
   */
  async batchCheckDuplicates(
    emails: ParsedEmail[]
  ): Promise<{
    duplicates: Array<{ email: ParsedEmail; result: DuplicateCheckResult }>;
    unique: ParsedEmail[];
    stats: DuplicateStats;
  }> {
    const stats = this.createStats();
    const duplicates: Array<{ email: ParsedEmail; result: DuplicateCheckResult }> = [];
    const unique: ParsedEmail[] = [];

    for (const email of emails) {
      const result = await this.checkDuplicate(email, stats);

      if (result.is_duplicate) {
        duplicates.push({ email, result });
      } else {
        unique.push(email);
      }
    }

    // Log summary after batch processing
    this.logSummary(stats, emails.length);

    return {
      duplicates,
      unique,
      stats,
    };
  }

  /**
   * Validate SHA-256 email hash format
   *
   * SHA-256 hash should be 64 hexadecimal characters.
   *
   * @param email_hash - Email hash to validate
   * @returns true if hash format is valid
   */
  static isValidEmailHash(email_hash: string): boolean {
    // SHA-256 hash is 64 hex characters
    const sha256Regex = /^[a-f0-9]{64}$/i;
    return sha256Regex.test(email_hash);
  }

  /**
   * Compute duplicate detection key from email components
   *
   * This is the same algorithm used by EmlParser.computeEmailHash
   * but exposed here for testing and validation.
   *
   * Per plan.md R0-4: SHA256(Message-ID + Date + From)
   *
   * @param message_id - Message-ID header (optional)
   * @param date - ISO date string
   * @param from - Sender email address
   * @returns SHA-256 hash as hex string
   */
  static computeFingerprint(
    message_id: string | undefined,
    date: string,
    from: string
  ): string {
    const idPart = message_id || 'no-message-id';
    const datePart = date || new Date().toISOString();
    const fromPart = from || 'unknown-sender';

    const hashInput = `${idPart}${datePart}${fromPart}`;
    return createHash('sha256').update(hashInput).digest('hex');
  }
}

export default DuplicateDetector;
