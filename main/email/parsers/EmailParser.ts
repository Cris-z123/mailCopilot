/**
 * EmailParser Interface
 *
 * Defines the contract for all email format parsers.
 * Per plan.md R0-1, each parser must implement this interface.
 *
 * @module main/email/parsers/EmailParser
 */

/**
 * Parsed email result containing metadata and optional body content
 *
 * Note: Email body is truncated to 100k characters per plan.md constraints.
 * Attachments are metadata-only (filenames, sizes, MIME types).
 */
export interface ParsedEmail {
  /** SHA-256 hash of (Message-ID + Date + From) for duplicate detection */
  email_hash: string;

  /** Message-ID header if available (critical for traceability) */
  message_id?: string;

  /** Sender email address */
  from: string;

  /** Email subject line (truncated if needed) */
  subject: string;

  /** ISO 8601 date string from Date header */
  date: string;

  /** Attachment metadata (filename, size, MIME type) */
  attachments: Array<{
    filename: string;
    size: number;
    mime_type: string;
  }>;

  /** Email body content (truncated to 100k chars) */
  body?: string;

  /** Absolute file path to original email file */
  file_path: string;

  /** Email format type */
  format: 'eml' | 'msg' | 'pst' | 'ost' | 'mbox' | 'html';

  /** Extraction status */
  extract_status: 'success' | 'no_content' | 'error';

  /** Error message if extraction failed */
  error_log?: string;
}

/**
 * EmailParser interface
 *
 * All format-specific parsers (.eml, .msg, .pst, .mbox, .html) must
 * implement this interface to ensure consistent behavior across formats.
 *
 * Per plan.md R0-1:
 * - Primary parser → backup parser → degraded mode (confidence 0.5, "[格式受限]" tag)
 * - Message-ID extraction rates vary by format (FR-008)
 */
export interface EmailParser {
  /**
   * Parse email file and extract metadata
   *
   * @param filePath - Absolute path to email file
   * @returns Promise resolving to ParsedEmail with metadata and optional body
   * @throws Error if file is unparseable (logged, continues per FR-054)
   *
   * Behavior:
   * - Extract Message-ID if available (critical for traceability per FR-001)
   * - Compute SHA-256 fingerprint: SHA256(Message-ID + Date + From) per R0-4
   * - Extract attachment metadata (no content storage per FR-044)
   * - Truncate body to 100k characters per plan.md constraints
   * - Set extract_status based on parsing success
   *
   * Error Handling:
   * - Corrupted/unparseable emails: throw Error (caught by EmailProcessor)
   * - Missing Message-ID: Return message_id as undefined (degraded mode)
   * - Short content (<200 chars): Return body undefined (FR-013)
   */
  parse(filePath: string): Promise<ParsedEmail>;

  /**
   * Validate file format compatibility
   *
   * @param filePath - Absolute path to email file
   * @returns true if file can be parsed by this parser
   *
   * Used by EmailParserFactory to select appropriate parser.
   */
  canParse(filePath: string): boolean;
}

export default EmailParser;
