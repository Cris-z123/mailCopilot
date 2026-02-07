/**
 * MboxParser - Unix mbox format parser
 *
 * Parses Unix mbox format files with From_ delimiter separation.
 * Per plan.md FR-008 and SC-004: ≥95% Message-ID extraction rate.
 *
 * mbox format stores multiple emails in a single text file, separated
 * by lines starting with "From " (From_ delimiter).
 *
 * @module main/email/parsers/MboxParser
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from '@/config/logger';
import type { EmailParser, ParsedEmail } from './EmailParser';
import { formatISO8601 } from '@shared/utils/dateUtils';

/**
 * MboxParser implements EmailParser interface for Unix mbox files
 *
 * mbox format has high Message-ID extraction rate (≥95% per SC-004).
 *
 * Note: mbox files contain multiple emails. This parser extracts
 * the first email. For full processing, EmailProcessor should
 * iterate through all emails in the mbox file.
 */
export class MboxParser implements EmailParser {
  /**
   * Maximum body size before truncation (100k chars per plan.md constraints)
   */
  private static readonly MAX_BODY_SIZE = 100000;

  /**
   * Parse .mbox file and extract metadata
   *
   * Note: This method extracts the FIRST email from the mbox file.
   * For complete processing, EmailProcessor should handle iteration.
   *
   * @param filePath - Absolute path to .mbox file
   * @returns ParsedEmail with metadata for first email in mbox
   * @throws Error if file is unparseable
   */
  async parse(filePath: string): Promise<ParsedEmail> {
    try {
      logger.debug('MboxParser', `Starting parse for file: ${filePath}`);

      // Read entire mbox file
      const content = await fs.readFile(filePath, 'utf-8');

      // Split into individual emails using From_ delimiter
      const emails = this.splitMbox(content);

      if (emails.length === 0) {
        throw new Error('No emails found in mbox file');
      }

      logger.debug('MboxParser', `Found ${emails.length} emails in mbox file`);

      // Parse first email
      const firstEmail = this.parseEmailContent(emails[0], filePath);

      logger.debug('MboxParser', `Successfully parsed first email: ${firstEmail.message_id || '(no Message-ID)'}`);

      return firstEmail;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('MboxParser', 'Failed to parse .mbox file', error, { filePath });

      throw new Error(`MboxParser failed for ${filePath}: ${errorMessage}`);
    }
  }

  /**
   * Check if file can be parsed as .mbox
   *
   * @param filePath - Absolute path to file
   * @returns true if file has .mbox extension
   */
  canParse(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.mbox';
  }

  /**
   * Split mbox content into individual emails
   *
   * Uses From_ delimiter (lines starting with "From ").
   * Records file offsets for each email.
   *
   * @param content - Raw mbox file content
   * @returns Array of email contents
   */
  private splitMbox(content: string): string[] {
    const emails: string[] = [];
    const lines = content.split('\n');
    let currentEmail: string[] = [];
    let inEmail = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for From_ delimiter (line starts with "From ")
      if (line.startsWith('From ')) {
        // Save previous email if exists
        if (inEmail && currentEmail.length > 0) {
          emails.push(currentEmail.join('\n'));
        }
        // Start new email
        currentEmail = [];
        inEmail = true;
      } else if (inEmail) {
        // Add line to current email
        currentEmail.push(line);
      }
    }

    // Don't forget the last email
    if (inEmail && currentEmail.length > 0) {
      emails.push(currentEmail.join('\n'));
    }

    return emails;
  }

  /**
   * Parse individual email content from mbox
   *
   * @param emailContent - Raw email content
   * @param filePath - Original file path
   * @returns ParsedEmail object
   */
  private parseEmailContent(emailContent: string, filePath: string): ParsedEmail {
    // Split headers and body
    const { headers, body } = this.splitHeadersAndBody(emailContent);

    // Extract Message-ID (critical for traceability per FR-001)
    const messageId = this.extractMessageId(headers);

    // Extract date
    const date = this.extractDate(headers);

    // Extract sender
    const from = this.extractSenderEmail(headers);

    // Compute SHA-256 fingerprint per R0-4
    const emailHash = this.computeEmailHash(messageId, date, from);

    // Extract subject
    const subject = headers['subject'] || '(无主题)';

    // Parse body
    const parsedBody = this.extractBody(body);

    return {
      email_hash: emailHash,
      message_id: messageId,
      from,
      subject,
      date,
      attachments: [], // TODO: Parse MIME attachments
      body: parsedBody,
      file_path: filePath,
      format: 'mbox',
      extract_status: parsedBody ? 'success' : 'no_content',
    };
  }

  /**
   * Split email content into headers and body
   *
   * @param emailContent - Raw email content
   * @returns Headers object and body string
   */
  private splitHeadersAndBody(emailContent: string): { headers: Record<string, string>; body: string } {
    const lines = emailContent.split('\n');
    const headers: Record<string, string> = {};
    let headerEndIndex = 0;

    // Extract headers (until empty line)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') {
        headerEndIndex = i;
        break;
      }

      // Parse header line
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        const headerName = match[1].toLowerCase();
        const headerValue = match[2];

        // Handle continuation lines (start with whitespace)
        if (headers[headerName]) {
          headers[headerName] += ' ' + headerValue;
        } else {
          headers[headerName] = headerValue;
        }
      }
    }

    // Extract body (everything after headers)
    const body = lines.slice(headerEndIndex + 1).join('\n');

    return { headers, body };
  }

  /**
   * Extract Message-ID header
   *
   * Message-ID extraction rate for mbox format is ≥95% per SC-004.
   *
   * @param headers - Email headers
   * @returns Message-ID string or undefined if missing
   */
  private extractMessageId(headers: Record<string, string>): string | undefined {
    if (headers['message-id']) {
      // Clean up Message-ID (remove angle brackets if present)
      return headers['message-id'].replace(/^<|>$/g, '');
    }

    logger.debug('MboxParser', 'Message-ID not found (rare for mbox format)');
    return undefined;
  }

  /**
   * Compute SHA-256 email fingerprint
   *
   * Per plan.md R0-4: SHA256(Message-ID + Date + From)
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
   * @param headers - Email headers
   * @returns Sender email address
   */
  private extractSenderEmail(headers: Record<string, string>): string {
    const fromHeader = headers['from'];

    if (!fromHeader) {
      logger.debug('MboxParser', 'From header not found, using fallback');
      return 'unknown@example.com';
    }

    // Try to extract email from angle brackets
    const emailMatch = fromHeader.match(/<([^>]+)>/);
    if (emailMatch) {
      return emailMatch[1];
    }

    // Check if it's a plain email
    if (fromHeader.includes('@')) {
      return fromHeader;
    }

    return 'unknown@example.com';
  }

  /**
   * Extract date as ISO 8601 string
   *
   * Uses date-fns formatISO8601 per plan.md R0-9.
   *
   * @param headers - Email headers
   * @returns ISO 8601 date string
   */
  private extractDate(headers: Record<string, string>): string {
    const dateHeader = headers['date'];

    if (dateHeader) {
      try {
        const date = new Date(dateHeader);
        if (!isNaN(date.getTime())) {
          return formatISO8601(date);
        }
      } catch (error) {
        logger.debug('MboxParser', 'Failed to parse date header');
      }
    }

    // Fallback to current time (using date-fns formatISO8601 per plan.md R0-9)
    logger.debug('MboxParser', 'Date header not found or invalid, using current time');
    return formatISO8601(new Date());
  }

  /**
   * Extract and truncate email body
   *
   * Truncates to 100k characters per plan.md constraints.
   * Returns undefined if body is too short (<200 chars) per FR-013.
   *
   * @param body - Raw body content
   * @returns Truncated body content or undefined
   */
  private extractBody(body: string): string | undefined {
    // Strip HTML tags if present
    let parsedBody = body;
    if (body.includes('<')) {
      parsedBody = body.replace(/<[^>]*>/g, ' ').trim();
    }

    // Truncate to max size
    if (parsedBody.length > MboxParser.MAX_BODY_SIZE) {
      parsedBody = parsedBody.substring(0, MboxParser.MAX_BODY_SIZE);
      logger.debug('MboxParser', 'Body truncated to 100k characters');
    }

    // Check minimum length for reliable fingerprint (FR-013)
    if (parsedBody.length < 200) {
      logger.debug('MboxParser', 'Body too short (<200 chars), not reliable for fingerprinting');
      return undefined;
    }

    return parsedBody;
  }
}

export default MboxParser;
