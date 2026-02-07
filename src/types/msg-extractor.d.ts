/**
 * Type definitions for msg-extractor
 *
 * Manual type definitions for the msg-extractor library
 * which provides Outlook .msg file parsing functionality.
 */

declare module 'msg-extractor' {
  /**
   * Extracted attachment from .msg file
   */
  export interface MsgAttachment {
    /** Attachment filename */
    fileName?: string;
    /** Alternative name field */
    name?: string;
    /** Attachment size in bytes */
    size?: number;
    /** MIME type */
    mimeType?: string;
    /** Alternative content type field */
    contentType?: string;
  }

  /**
   * Extracted Outlook .msg file content
   */
  export interface MsgFile {
    /** Email subject */
    subject?: string;
    /** Sender display name and/or email */
    sender?: string;
    /** Sender email address */
    fromEmail?: string;
    /** Recipient display name and/or email */
    to?: string;
    /** Recipient email address */
    toEmail?: string;
    /** Email body (plain text) */
    body?: string;
    /** Email body (HTML) */
    htmlBody?: string;
    /** Email date as Date object or string */
    date?: Date | string;
    /** Alternative sent time field */
    sentTime?: Date | string;
    /** Email headers object */
    headers?: Record<string, string>;
    /** Internet Message-ID (alternative format) */
    internetMessageId?: string;
    /** Attachments array */
    attachments?: MsgAttachment[];
  }

  /**
   * Extract content from Outlook .msg file
   *
   * @param filePath - Absolute path to .msg file
   * @returns Promise resolving to extracted MsgFile content
   */
  export function extractMsg(filePath: string): Promise<MsgFile>;
}
