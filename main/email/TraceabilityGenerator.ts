/**
 * TraceabilityGenerator - Search string and file path generation
 *
 * Generates traceability information for emails per plan.md R0-9:
 * - Search string format: `from:sender subject:"snippet" date:YYYY-MM-DD`
 * - Subject truncation to 30 characters
 * - File path as backup traceability method
 *
 * @module main/email/TraceabilityGenerator
 */

import { logger } from '../config/logger';
import { ParsedEmail } from './parsers/EmailParser';
import { extractDateOnly as extractDateOnlyUtil, getCurrentDateYYYYMMDD } from '../../shared/utils/dateUtils';

/**
 * Traceability information for an email
 *
 * Provides users with multiple ways to locate the original email:
 * 1. Search string for email client search bar
 * 2. Absolute file path for manual file system navigation
 */
export interface TraceabilityInfo {
  /** Search string formatted for email clients */
  search_string: string;

  /** Absolute path to original email file */
  file_path: string;

  /** Message-ID or SHA-256 fingerprint */
  identifier: string;

  /** Whether identifier is verified Message-ID or degraded fingerprint */
  identifier_type: 'message_id' | 'fingerprint';
}

/**
 * TraceabilityGenerator generates search strings and file paths
 *
 * Per plan.md R0-9 and FR-003, FR-004:
 * - Standard email search syntax compatible with major clients
 * - Subject prefix truncation (Re:, Fwd:, etc.)
 * - 30-character subject limit for conciseness
 * - File path provided as backup for clients without search syntax support
 */
export class TraceabilityGenerator {
  /**
   * Maximum subject length in search string
   */
  private static readonly MAX_SUBJECT_LENGTH = 30;

  /**
   * Subject prefixes to strip (reply/forward indicators)
   */
  private static readonly SUBJECT_PREFIXES = [
    're:',
    'fw:',
    'fwd:',
    '回复:',
    '转发:',
    '答案:',
  ];

  /**
   * Generate traceability information for parsed email
   *
   * @param parsed - ParsedEmail from parser
   * @returns TraceabilityInfo with search string and file path
   */
  generateTraceability(parsed: ParsedEmail): TraceabilityInfo {
    try {
      const searchString = this.generateSearchString(parsed);

      logger.debug('TraceabilityGenerator', 'Generated traceability info', {
        email_hash: parsed.email_hash,
        has_message_id: !!parsed.message_id,
      });

      return {
        search_string: searchString,
        file_path: parsed.file_path,
        identifier: parsed.message_id || parsed.email_hash,
        identifier_type: parsed.message_id ? 'message_id' : 'fingerprint',
      };
    } catch (error) {
      logger.error('TraceabilityGenerator', 'Failed to generate traceability', error as Error, {
        email_hash: parsed.email_hash,
      });

      // Fallback: minimal traceability
      return {
        search_string: `date:${this.extractDateOnly(parsed.date)}`,
        file_path: parsed.file_path,
        identifier: parsed.email_hash,
        identifier_type: 'fingerprint',
      };
    }
  }

  /**
   * Generate search string for email client
   *
   * Format: `from:sender subject:"snippet" date:YYYY-MM-DD`
   *
   * Compatible with major email clients:
   * - Thunderbird: supports from:, subject:, date:
   * - Apple Mail: supports from:, subject:, date:
   * - Outlook webmail: supports from:, subject:, date:
   *
   * @param parsed - ParsedEmail from parser
   * @returns Formatted search string
   */
  private generateSearchString(parsed: ParsedEmail): string {
    const parts: string[] = [];

    // Add sender: from:email@domain.com
    parts.push(`from:${parsed.from}`);

    // Add subject snippet (truncated, cleaned)
    const subjectSnippet = this.cleanAndTruncateSubject(parsed.subject);
    if (subjectSnippet) {
      // Quote multi-word subjects
      const quotedSubject = subjectSnippet.includes(' ')
        ? `"${subjectSnippet}"`
        : subjectSnippet;
      parts.push(`subject:${quotedSubject}`);
    }

    // Add date: YYYY-MM-DD
    const dateOnly = this.extractDateOnly(parsed.date);
    parts.push(`date:${dateOnly}`);

    return parts.join(' ');
  }

  /**
   * Clean and truncate subject for search string
   *
   * Strips reply/forward prefixes and limits to 30 characters.
   *
   * @param subject - Original subject line
   * @returns Cleaned and truncated subject
   */
  private cleanAndTruncateSubject(subject: string): string {
    if (!subject || subject.trim().length === 0) {
      return '';
    }

    let cleaned = subject.trim();

    // Strip common prefixes (case-insensitive)
    for (const prefix of TraceabilityGenerator.SUBJECT_PREFIXES) {
      if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
        cleaned = cleaned.substring(prefix.length).trim();
      }
    }

    // Truncate to max length
    if (cleaned.length > TraceabilityGenerator.MAX_SUBJECT_LENGTH) {
      cleaned = cleaned.substring(0, TraceabilityGenerator.MAX_SUBJECT_LENGTH).trim();
    }

    return cleaned;
  }

  /**
   * Extract date-only portion (YYYY-MM-DD) from ISO 8601 string
   *
   * Uses date-fns utilities per plan.md R0-9 for consistent date handling.
   *
   * @param isoDate - ISO 8601 date string
   * @returns Date in YYYY-MM-DD format
   */
  private extractDateOnly(isoDate: string): string {
    try {
      // Use date-fns extractDateOnly utility for consistent date handling per plan.md R0-9
      // This provides both fast regex extraction and fallback parsing
      return extractDateOnlyUtil(isoDate);
    } catch (error) {
      logger.warn('TraceabilityGenerator', 'Failed to parse date, using current date', {
        isoDate,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback to current date (using date-fns getCurrentDateYYYYMMDD per plan.md R0-9)
      return getCurrentDateYYYYMMDD();
    }
  }

  /**
   * Generate human-readable traceability summary
   *
   * Useful for UI display and logging.
   *
   * @param info - TraceabilityInfo
   * @returns Human-readable summary
   */
  formatTraceabilitySummary(info: TraceabilityInfo): string {
    const identifierLabel = info.identifier_type === 'message_id' ? 'Message-ID' : 'SHA-256 指纹';
    return `搜索: ${info.search_string}\n文件: ${info.file_path}\n${identifierLabel}: ${info.identifier}`;
  }

  /**
   * Validate search string format
   *
   * Ensures search string follows expected format.
   *
   * @param searchString - Search string to validate
   * @returns true if format is valid
   */
  validateSearchString(searchString: string): boolean {
    // Basic format validation: should contain at least 'from:' and 'date:'
    const hasFrom = searchString.includes('from:');
    const hasDate = searchString.includes('date:');

    if (!hasFrom || !hasDate) {
      logger.warn('TraceabilityGenerator', 'Invalid search string format', {
        searchString,
        hasFrom,
        hasDate,
      });
      return false;
    }

    return true;
  }

  /**
   * Extract traceability info from database record
   *
   * Reconstructs TraceabilityInfo from stored data.
   *
   * @param record - Database record with search_string and file_path
   * @param message_id - Optional Message-ID from database
   * @param email_hash - SHA-256 hash from database
   * @returns Reconstructed TraceabilityInfo
   */
  fromDatabaseRecord(
    record: { search_string: string; file_path: string },
    message_id: string | undefined,
    email_hash: string
  ): TraceabilityInfo {
    return {
      search_string: record.search_string,
      file_path: record.file_path,
      identifier: message_id || email_hash,
      identifier_type: message_id ? 'message_id' : 'fingerprint',
    };
  }
}

export default TraceabilityGenerator;
