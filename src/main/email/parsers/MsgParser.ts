/**
 * MsgParser - Outlook .msg format parser
 *
 * Parses Outlook .msg files using msg-extractor library.
 * Per plan.md FR-008 and SC-004: ≥85% Message-ID extraction rate.
 * Falls back to SHA-256 fingerprint when Message-ID unavailable.
 *
 * @module main/email/parsers/MsgParser
 */

import { createHash } from 'crypto';
import * as path from 'path';
import { logger } from '@/config/logger';
import type { EmailParser, ParsedEmail } from './EmailParser';
import { formatISO8601 } from '@shared/utils/dateUtils';

/**
 * MsgParser implements EmailParser interface for Outlook .msg files
 *
 * .msg format is Outlook's proprietary format with moderate Message-ID
 * extraction rate (≥85% per SC-004).
 */
export class MsgParser implements EmailParser {
  /**
   * Maximum body size before truncation (100k chars per plan.md constraints)
   */
  private static readonly MAX_BODY_SIZE = 100000;

  /**
   * Parse .msg file and extract metadata
   *
   * @param filePath - Absolute path to .msg file
   * @returns ParsedEmail with metadata and truncated body
   * @throws Error if file is unparseable
   */
  async parse(filePath: string): Promise<ParsedEmail> {
    try {
      logger.debug('MsgParser', `Starting parse for file: ${filePath}`);

      // Dynamically import msg-extractor (optional dependency)
      const msgExtractor = await import('msg-extractor');
      const extractMsg = msgExtractor.extractMsg;

      // Extract using msg-extractor
      const msg = await extractMsg(filePath);

      // Extract Message-ID (critical for traceability per FR-001)
      const messageId = this.extractMessageId(msg);

      // Extract date early (needed for hash computation)
      const date = this.extractDate(msg);

      // Compute SHA-256 fingerprint per R0-4
      const from = this.extractSenderEmail(msg);
      const emailHash = this.computeEmailHash(messageId, date, from);

      // Extract subject
      const subject = msg.subject || '(无主题)';

      // Extract attachment metadata
      const attachments = this.extractAttachments(msg.attachments || []);

      // Extract and truncate body
      const body = this.extractBody(msg);

      logger.debug('MsgParser', `Successfully parsed email: ${messageId || '(no Message-ID)'}`);

      return {
        email_hash: emailHash,
        message_id: messageId,
        from,
        subject,
        date,
        attachments,
        body,
        file_path: filePath,
        format: 'msg',
        extract_status: body ? 'success' : 'no_content',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('MsgParser', 'Failed to parse .msg file', error, { filePath });

      throw new Error(`MsgParser failed for ${filePath}: ${errorMessage}`);
    }
  }

  /**
   * Check if file can be parsed as .msg
   *
   * @param filePath - Absolute path to file
   * @returns true if file has .msg extension
   */
  canParse(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.msg';
  }

  /**
   * Extract Message-ID from .msg file
   *
   * Message-ID extraction rate for .msg format is ≥85% per SC-004.
   *
   * @param msg - Extracted msg object
   * @returns Message-ID string or undefined if missing
   */
  private extractMessageId(msg: any): string | undefined {
    // msg-extractor provides various headers
    if (msg.headers && msg.headers['message-id']) {
      const messageId = msg.headers['message-id'];
      // Clean up Message-ID (remove angle brackets if present)
      return messageId.replace(/^<|>$/g, '');
    }

    // Some .msg files store Message-ID in internetMessageId field
    if (msg.internetMessageId) {
      return msg.internetMessageId.replace(/^<|>$/g, '');
    }

    logger.debug('MsgParser', 'Message-ID not found in .msg file (expected for ~15% of files per SC-004)');
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
   * @param from - From address
   * @returns SHA-256 hash as hex string
   */
  private computeEmailHash(
    messageId: string | undefined,
    date: string,
    from: string
  ): string {
    // Use fallback if Message-ID missing (degraded mode)
    const idPart = messageId || 'no-message-id';

    // Concatenate and hash
    const hashInput = `${idPart}${date}${from}`;
    return createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Extract sender email address
   *
   * @param msg - Extracted msg object
   * @returns Sender email address
   */
  private extractSenderEmail(msg: any): string {
    if (msg.sender) {
      // Try to extract email from sender field
      const emailMatch = msg.sender.match(/<([^>]+)>/);
      if (emailMatch) {
        return emailMatch[1];
      }
      // If no angle brackets, check if it's a plain email
      if (msg.sender.includes('@')) {
        return msg.sender;
      }
    }

    // Fallback to fromEmail field if available
    if (msg.fromEmail) {
      return msg.fromEmail;
    }

    // Last resort fallback
    logger.debug('MsgParser', 'Sender email not found, using fallback');
    return 'unknown@example.com';
  }

  /**
   * Extract date as ISO 8601 string
   *
   * Uses date-fns formatISO8601 per plan.md R0-9 for consistent date handling.
   *
   * @param msg - Extracted msg object
   * @returns ISO 8601 date string
   */
  private extractDate(msg: any): string {
    if (msg.date) {
      // msg-extractor returns Date object
      return formatISO8601(new Date(msg.date));
    }

    // Fallback to sentTime if available
    if (msg.sentTime) {
      return formatISO8601(new Date(msg.sentTime));
    }

    // Fallback to current time (using date-fns formatISO8601 per plan.md R0-9)
    logger.debug('MsgParser', 'Date not found in .msg file, using current time');
    return formatISO8601(new Date());
  }

  /**
   * Extract attachment metadata (no content per FR-044)
   *
   * @param attachments - Array of attachment objects from msg-extractor
   * @returns Attachment metadata array
   */
  private extractAttachments(attachments: any[]): Array<{ filename: string; size: number; mime_type: string }> {
    return attachments.map(att => ({
      filename: att.fileName || att.name || 'unnamed',
      size: att.size || 0,
      mime_type: att.mimeType || att.contentType || 'application/octet-stream',
    }));
  }

  /**
   * Extract and truncate email body
   *
   * Truncates to 100k characters per plan.md constraints.
   * Returns undefined if body is too short (<200 chars) per FR-013.
   *
   * @param msg - Extracted msg object
   * @returns Truncated body content or undefined
   */
  private extractBody(msg: any): string | undefined {
    // Prefer text body, fallback to HTML
    let body = msg.body || msg.htmlBody || '';

    // Strip HTML tags if HTML content
    if (msg.htmlBody && !msg.body) {
      body = body.replace(/<[^>]*>/g, ' ').trim();
    }

    // Truncate to max size
    if (body.length > MsgParser.MAX_BODY_SIZE) {
      body = body.substring(0, MsgParser.MAX_BODY_SIZE);
      logger.debug('MsgParser', 'Body truncated to 100k characters');
    }

    // Check minimum length for reliable fingerprint (FR-013)
    if (body.length < 200) {
      logger.debug('MsgParser', 'Body too short (<200 chars), not reliable for fingerprinting');
      return undefined;
    }

    return body;
  }
}

export default MsgParser;
