/**
 * PstParser - Outlook .pst/.ost archive parser
 *
 * Parses Outlook .pst/.ost archive files using libpff/readpst.
 * Per plan.md FR-008 and SC-004: ≥90% Message-ID extraction rate.
 * ~200ms overhead per email per plan.md v2.7.
 *
 * Note: This parser extracts individual emails from PST archives.
 * Each email in the archive is processed as a separate ParsedEmail.
 *
 * @module main/email/parsers/PstParser
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../config/logger.js';
import type { EmailParser, ParsedEmail } from './EmailParser.js';
import { formatISO8601 } from '../../../shared/utils/dateUtils.js';

const execAsync = promisify(exec);

/**
 * PstParser implements EmailParser interface for Outlook .pst/.ost files
 *
 * .pst/.ost formats are Outlook's archive formats with high Message-ID
 * extraction rate (≥90% per SC-004).
 *
 * Note: This parser uses readpst command-line tool to extract emails
 * from PST archives. readpst must be installed on the system.
 */
export class PstParser implements EmailParser {
  /**
   * Maximum body size before truncation (100k chars per plan.md constraints)
   */
  private static readonly MAX_BODY_SIZE = 100000;

  /**
   * Temporary directory for PST extraction
   */
  private static readonly TEMP_DIR = path.join(process.env.TMP || '/tmp', 'mailcopilot-pst');

  /**
   * Parse .pst/.ost file and extract metadata
   *
   * Note: This method extracts ALL emails from the archive.
   * For batch processing, EmailProcessor should handle iterating
   * through the extracted emails.
   *
   * @param filePath - Absolute path to .pst/.ost file
   * @returns ParsedEmail with metadata for first email in archive
   * @throws Error if file is unparseable or readpst not available
   */
  async parse(filePath: string): Promise<ParsedEmail> {
    try {
      logger.debug('PstParser', `Starting parse for file: ${filePath}`);

      // Check if readpst is available
      await this.checkReadpstAvailable();

      // Create temp directory if it doesn't exist
      await fs.mkdir(PstParser.TEMP_DIR, { recursive: true });

      // Extract emails using readpst
      const extractedDir = await this.extractPst(filePath);

      // Read first extracted email
      const extractedFiles = await fs.readdir(extractedDir);
      const emlFiles = extractedFiles.filter(f => f.endsWith('.eml'));

      if (emlFiles.length === 0) {
        throw new Error('No emails found in PST archive');
      }

      // Parse first email (for now - future enhancement: return all emails)
      const firstEmailPath = path.join(extractedDir, emlFiles[0]);

      // Read and parse the .eml file
      const emlContent = await fs.readFile(firstEmailPath, 'utf-8');
      const parsed = await this.parseEmlContent(emlContent);

      logger.debug('PstParser', `Successfully parsed PST archive with ${emlFiles.length} emails`);

      // Cleanup temp directory
      await this.cleanupTemp(extractedDir);

      return parsed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('PstParser', 'Failed to parse .pst/.ost file', error, { filePath });

      throw new Error(`PstParser failed for ${filePath}: ${errorMessage}`);
    }
  }

  /**
   * Check if file can be parsed as .pst or .ost
   *
   * @param filePath - Absolute path to file
   * @returns true if file has .pst or .ost extension
   */
  canParse(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.pst' || ext === '.ost';
  }

  /**
   * Check if readpst command is available
   *
   * @throws Error if readpst not found
   */
  private async checkReadpstAvailable(): Promise<void> {
    try {
      await execAsync('which readpst');
    } catch {
      throw new Error('readpst command not found. Please install libpss-tools: sudo apt-get install libpss-tools (Ubuntu/Debian) or brew install libpss (macOS)');
    }
  }

  /**
   * Extract PST archive to temporary directory
   *
   * Uses readpst command-line tool with -r option (recursive)
   * and -o option to specify output directory.
   *
   * @param filePath - Path to PST file
   * @returns Path to extracted directory
   */
  private async extractPst(filePath: string): Promise<string> {
    const outputDir = path.join(PstParser.TEMP_DIR, path.basename(filePath, path.extname(filePath)));

    try {
      // readpst command: -r (recursive), -o (output directory), -q (quiet)
      const command = `readpst -r -o "${outputDir}" -q "${filePath}"`;
      await execAsync(command);

      return outputDir;
    } catch (error) {
      throw new Error(`readpst extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse .eml file content (extracted from PST)
   *
   * @param emlContent - Raw .eml file content
   * @returns ParsedEmail object
   */
  private async parseEmlContent(emlContent: string): Promise<ParsedEmail> {
    // Parse headers manually (simple approach)
    const lines = emlContent.split('\n');
    const headers: Record<string, string> = {};
    let headerEndIndex = 0;

    // Extract headers
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') {
        headerEndIndex = i;
        break;
      }
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        headers[match[1].toLowerCase()] = match[2];
      }
    }

    // Extract Message-ID
    const messageId = headers['message-id']?.replace(/^<|>$/g, '');

    // Extract date
    const dateStr = headers['date'] || headers['sent'];
    const date = dateStr ? this.parseDate(dateStr) : formatISO8601(new Date());

    // Extract sender
    const from = this.extractSenderEmail(headers['from']);

    // Compute hash
    const emailHash = this.computeEmailHash(messageId, date, from);

    // Extract subject
    const subject = headers['subject'] || '(无主题)';

    // Extract body (everything after headers)
    const bodyContent = lines.slice(headerEndIndex + 1).join('\n');
    const body = this.extractBody(bodyContent);

    return {
      email_hash: emailHash,
      message_id: messageId,
      from,
      subject,
      date,
      attachments: [], // TODO: Parse attachments from PST
      body,
      file_path: '', // Will be set by caller
      format: 'pst',
      extract_status: body ? 'success' : 'no_content',
    };
  }

  /**
   * Compute SHA-256 email fingerprint
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
    const idPart = messageId || 'no-message-id';
    const hashInput = `${idPart}${date}${from}`;
    return createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Extract sender email address
   *
   * @param fromHeader - From header value
   * @returns Sender email address
   */
  private extractSenderEmail(fromHeader?: string): string {
    if (!fromHeader) {
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
   * Parse date from email header
   *
   * @param dateStr - Date header string
   * @returns ISO 8601 date string
   */
  private parseDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return formatISO8601(date);
      }
    } catch {
      logger.debug('PstParser', 'Failed to parse date, using current time');
    }
    return formatISO8601(new Date());
  }

  /**
   * Extract and truncate email body
   *
   * @param bodyContent - Raw body content
   * @returns Truncated body content or undefined
   */
  private extractBody(bodyContent: string): string | undefined {
    let body = bodyContent;

    // Strip HTML tags if present
    if (body.includes('<')) {
      body = body.replace(/<[^>]*>/g, ' ').trim();
    }

    // Truncate to max size
    if (body.length > PstParser.MAX_BODY_SIZE) {
      body = body.substring(0, PstParser.MAX_BODY_SIZE);
      logger.debug('PstParser', 'Body truncated to 100k characters');
    }

    // Check minimum length
    if (body.length < 200) {
      logger.debug('PstParser', 'Body too short (<200 chars)');
      return undefined;
    }

    return body;
  }

  /**
   * Cleanup temporary directory
   *
   * @param dir - Directory to remove
   */
  private async cleanupTemp(dir: string): Promise<void> {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      logger.warn('PstParser', 'Failed to cleanup temp directory', { error, dir });
    }
  }
}

export default PstParser;
