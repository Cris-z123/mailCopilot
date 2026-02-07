/**
 * HtmlParser - Exported .htm/.html format parser
 *
 * Parses exported HTML email files.
 * Per plan.md FR-008 and SC-004: ~30% Message-ID extraction rate.
 * Confidence capped at 0.6 due to limited metadata extraction.
 *
 * HTML format is the lowest quality for traceability since metadata
 * is often lost during HTML export.
 *
 * @module main/email/parsers/HtmlParser
 */

import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { logger } from '@/config/logger';
import type { EmailParser, ParsedEmail } from './EmailParser';
import { formatISO8601 } from '@shared/utils/dateUtils';

/**
 * HtmlParser implements EmailParser interface for .htm/.html files
 *
 * HTML export format has low Message-ID extraction rate (~30% per SC-004).
 * Items extracted from HTML emails have confidence capped at 0.6 per FR-011.
 */
export class HtmlParser implements EmailParser {
  /**
   * Maximum body size before truncation (100k chars per plan.md constraints)
   */
  private static readonly MAX_BODY_SIZE = 100000;

  /**
   * Parse .htm/.html file and extract metadata
   *
   * @param filePath - Absolute path to .htm/.html file
   * @returns ParsedEmail with metadata and truncated body
   * @throws Error if file is unparseable
   */
  async parse(filePath: string): Promise<ParsedEmail> {
    try {
      logger.debug('HtmlParser', `Starting parse for file: ${filePath}`);

      // Read HTML content
      const html = await fs.readFile(filePath, 'utf-8');

      // Parse with cheerio
      const $ = cheerio.load(html);

      // Extract metadata from <meta> tags and content
      const messageId = this.extractMessageId($, html);
      const from = this.extractSenderEmail($, html);
      const date = this.extractDate($, html);
      const subject = this.extractSubject($, html);

      // Compute SHA-256 fingerprint per R0-4
      const emailHash = this.computeEmailHash(messageId, date, from);

      // Extract attachment information if available
      const attachments = this.extractAttachments($, html);

      // Extract body (main content)
      const body = this.extractBody($, html);

      logger.debug('HtmlParser', `Successfully parsed HTML email: ${messageId || '(no Message-ID)'}`);

      return {
        email_hash: emailHash,
        message_id: messageId,
        from,
        subject,
        date,
        attachments,
        body,
        file_path: filePath,
        format: 'html',
        extract_status: body ? 'success' : 'no_content',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('HtmlParser', 'Failed to parse .htm/.html file', error, { filePath });

      throw new Error(`HtmlParser failed for ${filePath}: ${errorMessage}`);
    }
  }

  /**
   * Check if file can be parsed as .htm or .html
   *
   * @param filePath - Absolute path to file
   * @returns true if file has .htm or .html extension
   */
  canParse(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.htm' || ext === '.html';
  }

  /**
   * Extract Message-ID from HTML metadata
   *
   * Message-ID extraction rate for HTML format is ~30% per SC-004.
   * Looks for <meta name="message-id"> or similar tags.
   *
   * @param $ - Cheerio instance (Root type from cheerio.load())
   * @param html - Original HTML content
   * @returns Message-ID string or undefined if missing
   */
  private extractMessageId($: ReturnType<typeof cheerio.load>, _html: string): string | undefined {
    // Try various meta tag patterns
    const metaSelectors = [
      'meta[name="message-id"]',
      'meta[name="Message-ID"]',
      'meta[name="messageid"]',
      'meta[name="x-message-id"]',
    ];

    for (const selector of metaSelectors) {
      const value = $(selector).attr('content');
      if (value) {
        // Clean up Message-ID (remove angle brackets if present)
        return value.replace(/^<|>$/g, '');
      }
    }

    // Try to find Message-ID in document body (sometimes exported as text)
    const bodyText = $('body').text();
    const messageMatch = bodyText.match(/Message-ID:\s*<([^>]+)>/i);
    if (messageMatch) {
      return messageMatch[1];
    }

    logger.debug('HtmlParser', 'Message-ID not found (expected for ~70% of HTML files per SC-004)');
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
   * Extract sender email from HTML metadata
   *
   * Looks for <meta name="from"> or similar tags.
   *
   * @param $ - Cheerio instance (Root type from cheerio.load())
   * @param html - Original HTML content
   * @returns Sender email address
   */
  private extractSenderEmail($: ReturnType<typeof cheerio.load>, _html: string): string {
    // Try meta tags first
    const metaSelectors = [
      'meta[name="from"]',
      'meta[name="sender"]',
      'meta[name="author"]',
    ];

    for (const selector of metaSelectors) {
      const value = $(selector).attr('content');
      if (value) {
        // Extract email from value
        const emailMatch = value.match(/<([^>]+)>/);
        if (emailMatch) {
          return emailMatch[1];
        }
        if (value.includes('@')) {
          return value;
        }
      }
    }

    // Try to find in document body (common pattern: "From: sender@example.com")
    const bodyText = $('body').text();
    const fromMatch = bodyText.match(/From:\s*<?([^>\s@]+@[^>\s]+)>?/i);
    if (fromMatch) {
      return fromMatch[1];
    }

    // Fallback
    logger.debug('HtmlParser', 'Sender email not found, using fallback');
    return 'unknown@example.com';
  }

  /**
   * Extract subject from HTML metadata
   *
   * Looks for <title> tag or <meta name="subject">.
   *
   * @param $ - Cheerio instance (Root type from cheerio.load())
   * @param _html - Original HTML content (unused but kept for interface consistency)
   * @returns Email subject
   */
  private extractSubject($: ReturnType<typeof cheerio.load>, _html: string): string {
    // Try <title> first (most common for HTML exports)
    const title = $('title').text().trim();
    if (title && title !== '(无主题)') {
      // Remove common prefixes added by email clients
      return title
        .replace(/^(Subject:\s*)/i, '')
        .replace(/^(Email:\s*)/i, '')
        .substring(0, 100); // Limit length
    }

    // Try meta tags
    const metaSelectors = [
      'meta[name="subject"]',
      'meta[name="title"]',
    ];

    for (const selector of metaSelectors) {
      const value = $(selector).attr('content');
      if (value) {
        return value;
      }
    }

    // Fallback
    return '(无主题)';
  }

  /**
   * Extract date as ISO 8601 string
   *
   * Uses date-fns formatISO8601 per plan.md R0-9.
   *
   * @param $ - Cheerio instance (Root type from cheerio.load())
   * @param html - Original HTML content
   * @returns ISO 8601 date string
   */
  private extractDate($: ReturnType<typeof cheerio.load>, _html: string): string {
    // Try meta tags
    const metaSelectors = [
      'meta[name="date"]',
      'meta[name="sent"]',
      'meta[name="datetime"]',
    ];

    for (const selector of metaSelectors) {
      const value = $(selector).attr('content');
      if (value) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return formatISO8601(date);
          }
        } catch {
          // Continue to next attempt
        }
      }
    }

    // Try to find in document body
    const bodyText = $('body').text();
    const dateMatch = bodyText.match(/Date:\s*([^\n]+)/i);
    if (dateMatch) {
      try {
        const date = new Date(dateMatch[1].trim());
        if (!isNaN(date.getTime())) {
          return formatISO8601(date);
        }
      } catch {
        // Fall through to fallback
      }
    }

    // Fallback to current time (using date-fns formatISO8601 per plan.md R0-9)
    logger.debug('HtmlParser', 'Date not found in HTML, using current time');
    return formatISO8601(new Date());
  }

  /**
   * Extract attachments from HTML metadata
   *
   * Looks for attachment information in meta tags or document structure.
   *
   * @param $ - Cheerio instance (Root type from cheerio.load())
   * @param _html - Original HTML content (unused but kept for interface consistency)
   * @returns Attachment metadata array
   */
  private extractAttachments($: ReturnType<typeof cheerio.load>, _html: string): Array<{ filename: string; size: number; mime_type: string }> {
    const attachments: Array<{ filename: string; size: number; mime_type: string }> = [];

    // Look for attachment links or meta tags
    $('a[href*="attachment"], a[href*="attach"]').each((_, element) => {
      const filename = $(element).text().trim() || $(element).attr('href') || 'unnamed';
      attachments.push({
        filename,
        size: 0, // Size not available in HTML exports
        mime_type: 'application/octet-stream',
      });
    });

    // Check meta tags for attachment count
    const attachmentMeta = $('meta[name="attachments"], meta[name="attachment-count"]');
    const count = attachmentMeta.attr('content');
    if (count) {
      const numAttachments = parseInt(count, 10);
      if (numAttachments > 0 && attachments.length === 0) {
        // Add placeholder attachments if count specified but no details
        for (let i = 0; i < numAttachments; i++) {
          attachments.push({
            filename: `attachment-${i + 1}`,
            size: 0,
            mime_type: 'application/octet-stream',
          });
        }
      }
    }

    return attachments;
  }

  /**
   * Extract and truncate email body
   *
   * Truncates to 100k characters per plan.md constraints.
   * Returns undefined if body is too short (<200 chars) per FR-013.
   *
   * @param $ - Cheerio instance (Root type from cheerio.load())
   * @param _html - Original HTML content (unused but kept for interface consistency)
   * @returns Truncated body content or undefined
   */
  private extractBody($: ReturnType<typeof cheerio.load>, _html: string): string | undefined {
    // Try to find main content area
    let body = '';

    // Common content selectors (in order of preference)
    const contentSelectors = [
      'body',
      '#content',
      '#message-body',
      '.message-body',
      '.email-content',
      'article',
      'main',
    ];

    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        // Get text content
        body = element.text().trim();
        if (body.length > 200) {
          break; // Found substantial content
        }
      }
    }

    // Remove common navigation/footer elements
    body = body
      .replace(/Navigation:.*$/gm, '')
      .replace(/Footer:.*$/gm, '')
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Truncate to max size
    if (body.length > HtmlParser.MAX_BODY_SIZE) {
      body = body.substring(0, HtmlParser.MAX_BODY_SIZE);
      logger.debug('HtmlParser', 'Body truncated to 100k characters');
    }

    // Check minimum length for reliable fingerprint (FR-013)
    if (body.length < 200) {
      logger.debug('HtmlParser', 'Body too short (<200 chars), not reliable for fingerprinting');
      return undefined;
    }

    return body;
  }
}

export default HtmlParser;
