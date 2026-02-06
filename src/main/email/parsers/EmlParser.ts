/**
 * EmlParser - RFC 5322 .eml format parser
 *
 * Parses standard .eml files using mailparser library.
 * Per plan.md R0-1 and FR-008: ≥95% Message-ID extraction rate (SC-004).
 *
 * @module main/email/parsers/EmlParser
 */

import { simpleParser, ParsedMail, Attachment } from 'mailparser';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from '@/config/logger';
import { EmailParser, ParsedEmail } from './EmailParser';
import { formatISO8601 } from '@shared/utils/dateUtils';

/**
 * EmlParser implements EmailParser interface for .eml files
 *
 * .eml format is the standard RFC 5322 format with highest Message-ID
 * extraction rate (≥95% per SC-004).
 */
export class EmlParser implements EmailParser {
  /**
   * Maximum body size before truncation (100k chars per plan.md constraints)
   */
  private static readonly MAX_BODY_SIZE = 100000;

  /**
   * Parse .eml file and extract metadata
   *
   * @param filePath - Absolute path to .eml file
   * @returns ParsedEmail with metadata and truncated body
   * @throws Error if file is unparseable
   */
  async parse(filePath: string): Promise<ParsedEmail> {
    try {
      logger.debug('EmlParser', `Starting parse for file: ${filePath}`);

      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');

      // Parse using mailparser
      const parsed = await simpleParser(content);

      // Extract Message-ID (critical for traceability per FR-001)
      const messageId = this.extractMessageId(parsed);

      // Extract date early (needed for hash computation, using date-fns per plan.md R0-9)
      const date = this.extractDate(parsed);

      // Compute SHA-256 fingerprint per R0-4 (using date-fns formatted date)
      const fromValue = parsed.from?.value as Array<{ address: string; name?: string }> | undefined;
      const emailHash = this.computeEmailHash(messageId, date, fromValue);

      // Extract sender email
      const from = this.extractSenderEmail(parsed);

      // Extract subject
      const subject = parsed.subject || '(无主题)';

      // Extract attachment metadata
      const attachments = this.extractAttachments(parsed.attachments || []);

      // Extract and truncate body
      const body = this.extractBody(parsed);

      logger.debug('EmlParser', `Successfully parsed email: ${messageId || '(no Message-ID)'}`);

      return {
        email_hash: emailHash,
        message_id: messageId,
        from,
        subject,
        date,
        attachments,
        body,
        file_path: filePath,
        format: 'eml',
        extract_status: body ? 'success' : 'no_content',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('EmlParser', 'Failed to parse .eml file', error, { filePath });

      throw new Error(`EmlParser failed for ${filePath}: ${errorMessage}`);
    }
  }

  /**
   * Check if file can be parsed as .eml
   *
   * @param filePath - Absolute path to file
   * @returns true if file has .eml extension
   */
  canParse(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.eml';
  }

  /**
   * Extract Message-ID header
   *
   * Message-ID is critical for 100% traceability per FR-001.
   * Format: <unique-id@domain>
   *
   * @param parsed - ParsedMail from mailparser
   * @returns Message-ID string or undefined if missing
   */
  private extractMessageId(parsed: ParsedMail): string | undefined {
    // mailparser provides messageId property
    if (parsed.messageId) {
      // Clean up Message-ID (remove angle brackets if present)
      return parsed.messageId.replace(/^<|>$/g, '');
    }

    logger.debug('EmlParser', 'Message-ID not found in email headers');
    return undefined;
  }

  /**
   * Compute SHA-256 email fingerprint
   *
   * Per plan.md R0-4: SHA256(Message-ID + Date + From)
   * Used for duplicate detection across batches.
   *
   * @param messageId - Message-ID header (may be undefined)
   * @param date - ISO date string
   * @param from - From address object array
   * @returns SHA-256 hash as hex string
   */
  private computeEmailHash(
    messageId: string | undefined,
    date: string | undefined,
    from: Array<{ address: string; name?: string }> | undefined
  ): string {
    // Use fallback if Message-ID missing (degraded mode)
    const idPart = messageId || 'no-message-id';

    // Use current date if missing (using date-fns formatISO8601 per plan.md R0-9)
    const datePart = date || formatISO8601(new Date());

    // Use first sender address if available
    const fromPart = from && from.length > 0 ? from[0].address : 'unknown-sender';

    // Concatenate and hash
    const hashInput = `${idPart}${datePart}${fromPart}`;
    return createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Extract sender email address
   *
   * @param parsed - ParsedMail from mailparser
   * @returns Sender email address
   */
  private extractSenderEmail(parsed: ParsedMail): string {
    if (parsed.from && parsed.from.value && parsed.from.value.length > 0) {
      return parsed.from.value[0].address || 'unknown@example.com';
    }

    // Fallback if no From header
    logger.debug('EmlParser', 'From header not found, using fallback');
    return 'unknown@example.com';
  }

  /**
   * Extract date as ISO 8601 string
   *
   * Uses date-fns formatISO8601 per plan.md R0-9 for consistent date handling.
   *
   * @param parsed - ParsedMail from mailparser
   * @returns ISO 8601 date string
   */
  private extractDate(parsed: ParsedMail): string {
    if (parsed.date) {
      // Use date-fns formatISO8601 for consistent ISO 8601 formatting per plan.md R0-9
      return formatISO8601(parsed.date);
    }

    // Fallback to current time (using date-fns formatISO8601 per plan.md R0-9)
    logger.debug('EmlParser', 'Date header not found, using current time');
    return formatISO8601(new Date());
  }

  /**
   * Extract attachment metadata (no content per FR-044)
   *
   * @param attachments - Array of Attachment objects
   * @returns Attachment metadata array
   */
  private extractAttachments(attachments: Attachment[]): Array<{ filename: string; size: number; mime_type: string }> {
    return attachments.map(att => ({
      filename: att.filename || 'unnamed',
      size: att.size || 0,
      mime_type: att.contentType || 'application/octet-stream',
    }));
  }

  /**
   * Extract and truncate email body
   *
   * Truncates to 100k characters per plan.md constraints.
   * Returns undefined if body is too short (<200 chars) per FR-013.
   *
   * @param parsed - ParsedMail from mailparser
   * @returns Truncated body content or undefined
   */
  private extractBody(parsed: ParsedMail): string | undefined {
    // Prefer text content, fallback to HTML
    let body = parsed.text || parsed.html || '';

    // Strip HTML tags if HTML content
    if (parsed.html && !parsed.text) {
      body = body.replace(/<[^>]*>/g, ' ').trim();
    }

    // Truncate to max size
    if (body.length > EmlParser.MAX_BODY_SIZE) {
      body = body.substring(0, EmlParser.MAX_BODY_SIZE);
      logger.debug('EmlParser', 'Body truncated to 100k characters');
    }

    // Check minimum length for reliable fingerprint (FR-013)
    if (body.length < 200) {
      logger.debug('EmlParser', 'Body too short (<200 chars), not reliable for fingerprinting');
      return undefined;
    }

    return body;
  }
}

export default EmlParser;
