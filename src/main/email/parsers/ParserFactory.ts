/**
 * ParserFactory - Email format detection and parser selection
 *
 * Detects email file format from extension and delegates to
 * appropriate parser implementation.
 *
 * Per plan.md R0-1: Primary parser → backup parser → degraded mode.
 * Per plan.md FR-008: Message-ID extraction rates vary by format:
 * - .eml: ≥95%
 * - .msg: ≥85%
 * - .pst/.ost: ≥90%
 * - .mbox: ≥95%
 * - .htm/.html: ~30%
 *
 * @module main/email/parsers/ParserFactory
 */

import * as path from 'path';
import { logger } from '@/config/logger';
import type { EmailParser, ParsedEmail } from './EmailParser';
import { EmlParser } from './EmlParser';
import { MsgParser } from './MsgParser';
import { PstParser } from './PstParser';
import { MboxParser } from './MboxParser';
import { HtmlParser } from './HtmlParser';

/**
 * Supported email formats with their extensions
 */
const EMAIL_FORMATS = {
  EML: '.eml',
  MSG: '.msg',
  PST: '.pst',
  OST: '.ost',
  MBOX: '.mbox',
  HTML: '.html',
  HTM: '.htm',
} as const;

/**
 * ParserFactory manages format detection and parser selection
 *
 * Uses factory pattern to select appropriate parser based on file extension.
 */
export class ParserFactory {
  /**
   * Registered parsers
   */
  private parsers: EmailParser[];

  constructor() {
    // Initialize all available parsers
    this.parsers = [
      new EmlParser(),
      new MsgParser(),
      new PstParser(),
      new MboxParser(),
      new HtmlParser(),
    ];

    logger.debug('ParserFactory', `Initialized with ${this.parsers.length} parsers`);
  }

  /**
   * Parse email file with automatic format detection
   *
   * Detects format from file extension and delegates to appropriate parser.
   *
   * @param filePath - Absolute path to email file
   * @returns Promise resolving to ParsedEmail with metadata
   * @throws Error if format is not supported or parsing fails
   */
  async parse(filePath: string): Promise<ParsedEmail> {
    const parser = this.getParser(filePath);

    if (!parser) {
      const ext = path.extname(filePath).toLowerCase();
      throw new Error(
        `Unsupported email format: ${ext}. ` +
        `Supported formats: ${Object.values(EMAIL_FORMATS).join(', ')}`
      );
    }

    logger.debug('ParserFactory', `Using ${parser.constructor.name} for file: ${filePath}`);

    return parser.parse(filePath);
  }

  /**
   * Get appropriate parser for file based on extension
   *
   * @param filePath - Absolute path to email file
   * @returns EmailParser instance or undefined if format not supported
   */
  getParser(filePath: string): EmailParser | undefined {
    // Try to find a parser that can handle this file
    for (const parser of this.parsers) {
      if (parser.canParse(filePath)) {
        return parser;
      }
    }

    return undefined;
  }

  /**
   * Detect email format from file extension
   *
   * @param filePath - Absolute path to email file
   * @returns Format type or undefined if not recognized
   */
  detectFormat(filePath: string): ParsedEmail['format'] | undefined {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case EMAIL_FORMATS.EML:
        return 'eml';
      case EMAIL_FORMATS.MSG:
        return 'msg';
      case EMAIL_FORMATS.PST:
        return 'pst';
      case EMAIL_FORMATS.OST:
        return 'ost';
      case EMAIL_FORMATS.MBOX:
        return 'mbox';
      case EMAIL_FORMATS.HTML:
      case EMAIL_FORMATS.HTM:
        return 'html';
      default:
        return undefined;
    }
  }

  /**
   * Check if file format is supported
   *
   * @param filePath - Absolute path to email file
   * @returns true if format is supported
   */
  isSupported(filePath: string): boolean {
    return this.getParser(filePath) !== undefined;
  }

  /**
   * Get list of supported file extensions
   *
   * @returns Array of supported extensions (with dots)
   */
  getSupportedExtensions(): string[] {
    return Object.values(EMAIL_FORMATS);
  }

  /**
   * Get Message-ID extraction rate target for format
   *
   * Per SC-004, extraction rates vary by format:
   * - .eml: ≥95%
   * - .msg: ≥85%
   * - .pst/.ost: ≥90%
   * - .mbox: ≥95%
   * - .htm/.html: ~30%
   *
   * @param format - Email format
   * @returns Expected Message-ID extraction rate (0-1)
   */
  getExtractionRateTarget(format: ParsedEmail['format']): number {
    switch (format) {
      case 'eml':
      case 'mbox':
        return 0.95; // ≥95%
      case 'msg':
        return 0.85; // ≥85%
      case 'pst':
      case 'ost':
        return 0.90; // ≥90%
      case 'html':
        return 0.30; // ~30%
      default:
        return 0.0; // Unknown format
    }
  }

  /**
   * Get maximum confidence score for format
   *
   * HTML emails have confidence capped at 0.6 per FR-011.
   *
   * @param format - Email format
   * @returns Maximum confidence score (0-1)
   */
  getMaxConfidence(format: ParsedEmail['format']): number {
    switch (format) {
      case 'html':
        return 0.6; // Capped due to limited metadata
      default:
        return 1.0; // No cap for other formats
    }
  }
}

// Export singleton instance
export const parserFactory = new ParserFactory();

export default ParserFactory;
