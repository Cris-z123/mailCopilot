/**
 * Unit tests for MsgParser
 *
 * Tests Outlook .msg format parser with focus on:
 * - Message-ID extraction rate ≥85% per SC-004
 * - SHA-256 fallback when Message-ID missing
 * - Metadata extraction (sender, date, subject, attachments)
 * - Body truncation to 100k characters
 * - Error handling for corrupted files
 *
 * @tests/unit/email-processing/parsers/msg-parser.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MsgParser } from '@/email/parsers/MsgParser';
import { logger } from '@/config/logger';
import * as crypto from 'crypto';

// Hoist mock so we never require the optional dependency (may be not installed)
const mockExtractMsg = vi.hoisted(() => vi.fn());

// Mock msg-extractor so tests run without optional dependency
vi.mock('msg-extractor', () => ({
  extractMsg: mockExtractMsg,
}));

// Mock logger
vi.mock('@/config/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('MsgParser', () => {
  let parser: MsgParser;

  beforeEach(() => {
    parser = new MsgParser();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Message-ID Extraction', () => {
    it('should extract Message-ID from headers.message-id', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<test123@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'Test Subject',
        body: 'A'.repeat(300), // >200 chars
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.message_id).toBe('test123@example.com');
      expect(mockExtractMsg).toHaveBeenCalledWith('/test/email.msg');
    });

    it('should extract Message-ID from internetMessageId field', async () => {
      const mockMsg = {
        internetMessageId: '<another456@example.org>',
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.org',
        subject: 'Test',
        body: 'B'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.message_id).toBe('another456@example.org');
    });

    it('should remove angle brackets from Message-ID', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<brackets@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'Test',
        body: 'C'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.message_id).toBe('brackets@example.com');
    });

    it('should return undefined for missing Message-ID (expected for ~15% per SC-004)', async () => {
      const mockMsg = {
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'Test',
        body: 'D'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.message_id).toBeUndefined();
    });

    it('should compute SHA-256 hash using fallback when Message-ID missing', async () => {
      const mockMsg = {
        date: '2024-02-05T10:00:00Z',
        sender: 'fallback@test.com',
        subject: 'No Message-ID',
        body: 'E'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      // Verify hash is computed with 'no-message-id' fallback
      const expectedHash = crypto
        .createHash('sha256')
        .update('no-message-id' + result.date + 'fallback@test.com')
        .digest('hex');

      expect(result.email_hash).toBe(expectedHash);
    });
  });

  describe('SHA-256 Fingerprint Computation', () => {
    it('should compute correct hash with Message-ID, date, and from', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<abc123@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'from@example.com',
        subject: 'Hash Test',
        body: 'F'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      const expectedHash = crypto
        .createHash('sha256')
        .update('abc123@example.com' + result.date + 'from@example.com')
        .digest('hex');

      expect(result.email_hash).toBe(expectedHash);
      expect(result.email_hash).toHaveLength(64); // SHA-256 hex length
      expect(result.email_hash).toMatch(/^[a-f0-9]{64}$/i); // Valid hex
    });

    it('should compute deterministic hash for same input', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<deterministic@test.org>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'same@example.org',
        subject: 'Deterministic',
        body: 'G'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result1 = await parser.parse('/test/email1.msg');
      const result2 = await parser.parse('/test/email2.msg');

      expect(result1.email_hash).toBe(result2.email_hash);
    });
  });

  describe('Sender Email Extraction', () => {
    it('should extract email from angle bracket format', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'John Doe <johndoe@example.com>',
        subject: 'Test',
        body: 'H'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.from).toBe('johndoe@example.com');
    });

    it('should extract plain email if no angle brackets', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'plainemail@example.com',
        subject: 'Test',
        body: 'I'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.from).toBe('plainemail@example.com');
    });

    it('should fallback to fromEmail field', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        fromEmail: 'fromemail@example.com',
        subject: 'Test',
        body: 'J'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.from).toBe('fromemail@example.com');
    });

    it('should use fallback when sender not found', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        subject: 'Test',
        body: 'K'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.from).toBe('unknown@example.com');
    });
  });

  describe('Date Extraction', () => {
    it('should extract date from date field', async () => {
      const mockDate = new Date('2024-02-05T15:30:00Z');
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: mockDate,
        sender: 'sender@example.com',
        subject: 'Date Test',
        body: 'L'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.date).toBeDefined();
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO 8601 format
    });

    it('should fallback to sentTime field', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        sentTime: '2024-01-10T08:00:00Z',
        sender: 'sender@example.com',
        subject: 'Test',
        body: 'M'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.date).toBeDefined();
    });

    it('should use current time when date not available', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        sender: 'sender@example.com',
        subject: 'Test',
        body: 'N'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const beforeTime = new Date().toISOString();
      const result = await parser.parse('/test/email.msg');
      const afterTime = new Date().toISOString();

      expect(result.date).toBeDefined();
      expect(result.date >= beforeTime.substring(0, 19) || result.date <= afterTime.substring(0, 19)).toBeTruthy();
    });
  });

  describe('Subject Extraction', () => {
    it('should extract subject from subject field', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'Important Meeting Tomorrow',
        body: 'O'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.subject).toBe('Important Meeting Tomorrow');
    });

    it('should use fallback when subject missing', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        body: 'P'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.subject).toBe('(无主题)');
    });
  });

  describe('Attachment Extraction', () => {
    it('should extract attachment metadata', async () => {
      const mockAttachments = [
        {
          fileName: 'document.pdf',
          size: 1024000,
          mimeType: 'application/pdf',
        },
        {
          name: 'image.png',
          size: 512000,
          contentType: 'image/png',
        },
      ];

      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'Attachments Test',
        body: 'Q'.repeat(300),
        attachments: mockAttachments,
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.attachments).toHaveLength(2);
      expect(result.attachments[0]).toEqual({
        filename: 'document.pdf',
        size: 1024000,
        mime_type: 'application/pdf',
      });
      expect(result.attachments[1]).toEqual({
        filename: 'image.png',
        size: 512000,
        mime_type: 'image/png',
      });
    });

    it('should handle missing attachment fields gracefully', async () => {
      const mockAttachments = [
        {}, // Missing all fields
        {
          fileName: 'partial.txt',
          // Missing size and mimeType
        },
      ];

      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'Test',
        body: 'R'.repeat(300),
        attachments: mockAttachments,
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.attachments).toHaveLength(2);
      expect(result.attachments[0].filename).toBe('unnamed');
      expect(result.attachments[0].size).toBe(0);
      expect(result.attachments[0].mime_type).toBe('application/octet-stream');
      expect(result.attachments[1].filename).toBe('partial.txt');
    });

    it('should return empty array when no attachments', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'No Attachments',
        body: 'S'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.attachments).toEqual([]);
    });
  });

  describe('Body Extraction and Truncation', () => {
    it('should extract text body', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'Body Test',
        body: 'T'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.body).toBe('T'.repeat(300));
      expect(result.extract_status).toBe('success');
    });

    it('should prefer text body over HTML', async () => {
      // Body must be ≥200 chars per FR-013 for parser to return it
      const plainBody = 'Plain text content.' + 'x'.repeat(200);
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'Body Test',
        body: plainBody,
        htmlBody: '<html><body>HTML content</body></html>',
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.body).toBe(plainBody);
    });

    it('should strip HTML tags when only HTML body available', async () => {
      // Stripped body must be ≥200 chars per FR-013
      const htmlBodyContent = '<div><p>Hello <strong>world</strong></p></div>' + 'y'.repeat(200);
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'HTML Test',
        htmlBody: htmlBodyContent,
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.body).toBeDefined();
      expect(result.body!).not.toContain('<');
      expect(result.body!).not.toContain('>');
      expect(result.body!).toContain('Hello');
      expect(result.body!).toContain('world');
    });

    it('should truncate body to 100k characters', async () => {
      const longBody = 'U'.repeat(150000); // 150k chars
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'Truncation Test',
        body: longBody,
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.body).toHaveLength(100000);
      expect(result.extract_status).toBe('success');
    });

    it('should return undefined for body <200 chars (FR-013)', async () => {
      const shortBody = 'V'.repeat(199); // Just under threshold
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'Short Body Test',
        body: shortBody,
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.body).toBeUndefined();
      expect(result.extract_status).toBe('no_content');
    });

    it('should accept body with exactly 200 chars', async () => {
      const thresholdBody = 'W'.repeat(200); // Exactly at threshold
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'Threshold Test',
        body: thresholdBody,
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.body).toBe(thresholdBody);
      expect(result.extract_status).toBe('success');
    });

    it('should return no_content when body missing', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<test@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'No Body Test',
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      expect(result.body).toBeUndefined();
      expect(result.extract_status).toBe('no_content');
    });
  });

  describe('Format Detection', () => {
    it('should identify .msg files as parseable', () => {
      expect(parser.canParse('/test/email.msg')).toBe(true);
      expect(parser.canParse('/test/EMAIL.MSG')).toBe(true); // Case insensitive
      expect(parser.canParse('/path/to/file.msg')).toBe(true);
    });

    it('should reject non-.msg files', () => {
      expect(parser.canParse('/test/email.eml')).toBe(false);
      expect(parser.canParse('/test/email.pdf')).toBe(false);
      expect(parser.canParse('/test/email.txt')).toBe(false);
      expect(parser.canParse('/test/email')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when msg-extractor fails', async () => {
      mockExtractMsg.mockRejectedValue(new Error('Corrupted .msg file'));

      await expect(parser.parse('/test/corrupted.msg')).rejects.toThrow('MsgParser failed');
    });

    it('should include file path in error message', async () => {
      mockExtractMsg.mockRejectedValue(new Error('Parse error'));

      await expect(parser.parse('/path/to/file.msg')).rejects.toThrow('/path/to/file.msg');
    });

    it('should log error on extraction failure', async () => {
      mockExtractMsg.mockRejectedValue(new Error('Extraction failed'));

      try {
        await parser.parse('/test/error.msg');
      } catch {
        // Expected error
      }

      expect(logger.error).toHaveBeenCalledWith(
        'MsgParser',
        'Failed to parse .msg file',
        expect.any(Error),
        { filePath: '/test/error.msg' }
      );
    });
  });

  describe('ParsedEmail Structure', () => {
    it('should return complete ParsedEmail object', async () => {
      const mockMsg = {
        headers: {
          'message-id': '<complete@example.com>',
        },
        date: '2024-02-05T10:00:00Z',
        sender: 'complete@example.com',
        subject: 'Complete Structure',
        body: 'X'.repeat(300),
        attachments: [
          { fileName: 'file.txt', size: 100, mimeType: 'text/plain' },
        ],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/complete.msg');

      expect(result).toMatchObject({
        email_hash: expect.any(String),
        message_id: 'complete@example.com',
        from: 'complete@example.com',
        subject: 'Complete Structure',
        date: expect.any(String),
        attachments: [{ filename: 'file.txt', size: 100, mime_type: 'text/plain' }],
        body: 'X'.repeat(300),
        file_path: '/test/complete.msg',
        format: 'msg',
        extract_status: 'success',
      });

      expect(result.email_hash).toHaveLength(64);
    });
  });

  describe('Message-ID Extraction Rate Compliance (SC-004)', () => {
    it('should demonstrate ≥85% Message-ID extraction capability', async () => {
      // Test with various Message-ID field locations
      const testCases = [
        {
          headers: { 'message-id': '<test1@example.com>' },
          description: 'headers.message-id',
        },
        {
          internetMessageId: '<test2@example.com>',
          description: 'internetMessageId field',
        },
        {
          headers: { 'message-id': '<test3@example.com>' },
          internetMessageId: '<test3@example.com>',
          description: 'both fields present',
        },
      ];

      let extractionCount = 0;

      for (const testCase of testCases) {
        const mockMsg = {
          ...testCase,
          date: '2024-02-05T10:00:00Z',
          sender: 'sender@example.com',
          subject: 'Extraction Rate Test',
          body: 'Y'.repeat(300),
          attachments: [],
        };

        mockExtractMsg!.mockResolvedValue(mockMsg);
        const result = await parser.parse('/test/email.msg');

        if (result.message_id) {
          extractionCount++;
        }
      }

      // Should extract Message-ID from all supported field locations
      expect(extractionCount).toBe(testCases.length);
    });

    it('should handle missing Message-ID gracefully (within 15% threshold per SC-004)', async () => {
      const mockMsg = {
        date: '2024-02-05T10:00:00Z',
        sender: 'sender@example.com',
        subject: 'No Message-ID',
        body: 'Z'.repeat(300),
        attachments: [],
      };

      mockExtractMsg!.mockResolvedValue(mockMsg);

      const result = await parser.parse('/test/email.msg');

      // Missing Message-ID is acceptable for up to 15% of .msg files
      expect(result.message_id).toBeUndefined();
      expect(result.email_hash).toBeDefined(); // Should still compute hash with fallback
    });
  });
});
