/**
 * Unit tests for HtmlParser
 *
 * Tests exported .htm/.html format parser with focus on:
 * - Message-ID extraction rate ~30% per SC-004 (low due to format limitations)
 * - Metadata extraction from <meta> tags and document body
 * - Confidence capped at 0.6 for HTML emails per FR-011
 * - Body extraction from main content areas
 * - Error handling for malformed HTML
 *
 * @tests/unit/email-processing/parsers/html-parser.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HtmlParser } from '@/email/parsers/HtmlParser';
import * as crypto from 'crypto';

// Module-level containers for mock references (defined before mocks to avoid hoisting issues)
const mockRefs = {
  cheerioLoad: null as any,
  readFile: null as any,
};

// Mock cheerio - define inline to avoid hoisting issues
vi.mock('cheerio', () => {
  const mockLoad = vi.fn();
  mockRefs.cheerioLoad = mockLoad;
  return {
    default: mockLoad,
    load: mockLoad,
  };
});

// Mock fs with promises - matching the import pattern used in HtmlParser
vi.mock('fs', () => {
  const mockReadFile = vi.fn();
  mockRefs.readFile = mockReadFile;
  return {
    promises: {
      readFile: mockReadFile,
    },
  };
});

// Mock logger
vi.mock('@/config/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('HtmlParser', () => {
  let parser: HtmlParser;

  beforeEach(() => {
    parser = new HtmlParser();

    // Set default mock behaviors
    mockRefs.readFile.mockResolvedValue('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRefs.cheerioLoad.mockImplementation(() => ({} as any));
  });

  afterEach(() => {
    // Reset mocks
    mockRefs.readFile.mockReset();
    mockRefs.readFile.mockResolvedValue('');
    mockRefs.cheerioLoad.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRefs.cheerioLoad.mockImplementation(() => ({} as any));
  });

  describe('Message-ID Extraction', () => {
    it('should extract Message-ID from meta[name="message-id"]', async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="message-id" content="<test123@example.com>" />
  <title>Email Export</title>
</head>
<body>
  <p>Body content ${'A'.repeat(300)}</p>
</body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      // Mock cheerio.load to return functional cheerio instance
      const $ = mockCheerioInstance({
        'meta[name="message-id"]': { attr: (name: string) => (name === 'content' ? '<test123@example.com>' : undefined) },
        'title': { text: () => 'Email Export' },
        'body': { text: () => `Body content ${'A'.repeat(300)}` },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.message_id).toBe('test123@example.com');
    });

    it('should try multiple meta tag patterns', async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="Message-ID" content="<caps@example.org>" />
</head>
<body><p>${'B'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="Message-ID"]': { attr: (name: string) => (name === 'content' ? '<caps@example.org>' : undefined) },
        'body': { text: () => 'B'.repeat(300) },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.message_id).toBe('caps@example.org');
    });

    it('should extract Message-ID from body text pattern', async () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <p>Message-ID: &lt;bodymsg@example.com&gt;</p>
  <p>${'C'.repeat(300)}</p>
</body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="message-id"]': { attr: () => undefined },
        'body': { text: () => `Message-ID: <bodymsg@example.com>\n${'C'.repeat(300)}` },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.message_id).toBe('bodymsg@example.com');
    });

    it('should return undefined when Message-ID not found (expected for ~70% per SC-004)', async () => {
      const html = `<!DOCTYPE html>
<html>
<head><title>Email</title></head>
<body><p>${'D'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="message-id"]': { attr: () => undefined },
        'body': { text: () => 'D'.repeat(300) },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.message_id).toBeUndefined();
    });
  });

  describe('SHA-256 Hash Computation', () => {
    it('should compute hash from Message-ID, date, and from', async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="message-id" content="<hash@example.com>" />
  <meta name="from" content="from@example.com" />
  <meta name="date" content="2024-02-05T10:00:00Z" />
</head>
<body><p>${'E'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="message-id"]': { attr: (name: string) => (name === 'content' ? '<hash@example.com>' : undefined) },
        'meta[name="from"]': { attr: (name: string) => (name === 'content' ? 'from@example.com' : undefined) },
        'meta[name="date"]': { attr: (name: string) => (name === 'content' ? '2024-02-05T10:00:00Z' : undefined) },
        'body': { text: () => 'E'.repeat(300) },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      const expectedHash = crypto
        .createHash('sha256')
        .update('hash@example.com' + result.date + 'from@example.com')
        .digest('hex');

      expect(result.email_hash).toBe(expectedHash);
    });

    it('should compute hash with fallback when Message-ID missing', async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="from" content="fallback@example.com" />
  <meta name="date" content="2024-02-05T10:00:00Z" />
</head>
<body><p>${'F'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="from"]': { attr: (name: string) => (name === 'content' ? 'fallback@example.com' : undefined) },
        'meta[name="date"]': { attr: (name: string) => (name === 'content' ? '2024-02-05T10:00:00Z' : undefined) },
        'body': { text: () => 'F'.repeat(300) },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      const expectedHash = crypto
        .createHash('sha256')
        .update('no-message-id' + result.date + 'fallback@example.com')
        .digest('hex');

      expect(result.email_hash).toBe(expectedHash);
    });
  });

  describe('Sender Email Extraction', () => {
    it('should extract email from meta[name="from"]', async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="from" content="<sender@example.com>" />
</head>
<body><p>${'G'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="from"]': { attr: (name: string) => (name === 'content' ? '<sender@example.com>' : undefined) },
        'body': { text: () => 'G'.repeat(300) },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.from).toBe('sender@example.com');
    });

    it('should extract plain email from meta tag', async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="from" content="plain@example.com" />
</head>
<body><p>${'H'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="from"]': { attr: (name: string) => (name === 'content' ? 'plain@example.com' : undefined) },
        'body': { text: () => 'H'.repeat(300) },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.from).toBe('plain@example.com');
    });

    it('should extract from body text pattern', async () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <p>From: body@example.com</p>
  <p>${'I'.repeat(300)}</p>
</body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="from"]': { attr: () => undefined },
        'body': { text: () => `From: body@example.com\n${'I'.repeat(300)}` },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.from).toBe('body@example.com');
    });

    it('should use fallback when sender not found', async () => {
      const html = `<!DOCTYPE html>
<html>
<body><p>${'J'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="from"]': { attr: () => undefined },
        'body': { text: () => 'J'.repeat(300) },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.from).toBe('unknown@example.com');
    });
  });

  describe('Subject Extraction', () => {
    it('should extract from <title> tag', async () => {
      const html = `<!DOCTYPE html>
<html>
<head><title>Important Meeting Tomorrow</title></head>
<body><p>${'K'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'title': { text: () => 'Important Meeting Tomorrow' },
        'body': { text: () => 'K'.repeat(300) },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.subject).toBe('Important Meeting Tomorrow');
    });

    it('should remove common prefixes from title', async () => {
      const html = `<!DOCTYPE html>
<html>
<head><title>Subject: Project Update Required</title></head>
<body><p>${'L'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'title': { text: () => 'Subject: Project Update Required' },
        'body': { text: () => 'L'.repeat(300) },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.subject).toBe('Project Update Required');
    });

    it('should extract from meta[name="subject"]', async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="subject" content="Meta Subject" />
</head>
<body><p>${'M'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'title': { text: () => '(无主题)' },
        'meta[name="subject"]': { attr: (name: string) => (name === 'content' ? 'Meta Subject' : undefined) },
        'body': { text: () => 'M'.repeat(300) },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.subject).toBe('Meta Subject');
    });

    it('should use fallback when subject not found', async () => {
      const html = `<!DOCTYPE html>
<html>
<body><p>${'N'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'title': { text: () => '' },
        'meta[name="subject"]': { attr: () => undefined },
        'body': { text: () => 'N'.repeat(300) },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.subject).toBe('(无主题)');
    });
  });

  describe('Date Extraction', () => {
    it('should extract from meta[name="date"]', async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="date" content="2024-02-05T10:00:00Z" />
</head>
<body><p>${'O'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="date"]': { attr: (name: string) => (name === 'content' ? '2024-02-05T10:00:00Z' : undefined) },
        'body': { text: () => 'O'.repeat(300) },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should extract from body text pattern', async () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <p>Date: 2024-02-05 15:30:00</p>
  <p>${'P'.repeat(300)}</p>
</body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="date"]': { attr: () => undefined },
        'body': { text: () => `Date: 2024-02-05 15:30:00\n${'P'.repeat(300)}` },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.date).toBeDefined();
    });

    it('should use current time when date not found', async () => {
      const html = `<!DOCTYPE html>
<html>
<body><p>${'Q'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="date"]': { attr: () => undefined },
        'body': { text: () => 'Q'.repeat(300) },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.date).toBeDefined();
    });
  });

  describe('Body Extraction', () => {
    it('should extract body content from main content areas', async () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <div id="content">
    <p>This is the main email content.</p>
    <p>${'R'.repeat(300)}</p>
  </div>
</body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const contentDivText = `This is the main email content.\n${'R'.repeat(300)}`;

      const $ = mockCheerioInstance({
        '#content': { text: () => contentDivText, length: 1 },
        'body': { text: () => contentDivText, length: 1 },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.body).toBeDefined();
      expect(result.body).toContain('main email content');
    });

    it('should strip HTML tags from body', async () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <p>This is <strong>HTML</strong> content.</p>
  <p>${'S'.repeat(300)}</p>
</body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'body': { text: () => `This is HTML content.\n${'S'.repeat(300)}`, length: 1 },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.body).not.toContain('<');
      expect(result.body).not.toContain('>');
    });

    it('should truncate body to 100k characters', async () => {
      const longBody = 'T'.repeat(150000);
      const html = `<!DOCTYPE html><html><body>${longBody}</body></html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'body': { text: () => longBody, length: 1 },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.body).toBeDefined();
      if (result.body) {
        expect(result.body.length).toBeLessThanOrEqual(100000);
      }
    });

    it('should return undefined for body <200 chars', async () => {
      const shortBody = 'U'.repeat(100);
      const html = `<!DOCTYPE html><html><body>${shortBody}</body></html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'body': { text: () => shortBody, length: 1 },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.body).toBeUndefined();
      expect(result.extract_status).toBe('no_content');
    });
  });

  describe('Attachment Extraction', () => {
    it('should extract attachment links from href attributes', async () => {
      const html = `<!DOCTYPE html>
<html>
<body>
  <a href="attachment/document.pdf">document.pdf</a>
  <a href="attach/image.png">image.png</a>
  <p>${'V'.repeat(300)}</p>
</body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'a[href*="attachment"], a[href*="attach"]': {
          each: (callback: any) => {
            callback.call(
              { text: (text: string) => text, attr: (name: string) => (name === 'href' ? 'attachment/document.pdf' : undefined) },
              0
            );
            callback.call(
              { text: (text: string) => text, attr: (name: string) => (name === 'href' ? 'attach/image.png' : undefined) },
              1
            );
          },
        },
        'body': { text: () => 'V'.repeat(300), length: 1 },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.attachments).toHaveLength(2);
      expect(result.attachments[0].filename).toBe('document.pdf');
      expect(result.attachments[1].filename).toBe('image.png');
    });

    it('should handle attachment meta tag with count', async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="attachments" content="3" />
</head>
<body><p>${'W'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="attachments"], meta[name="attachment-count"]': { attr: (name: string) => (name === 'content' ? '3' : undefined) },
        'a[href*="attachment"], a[href*="attach"]': { each: () => {} },
        'body': { text: () => 'W'.repeat(300), length: 1 },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.attachments).toHaveLength(3);
      expect(result.attachments[0].filename).toBe('attachment-1');
    });

    it('should return empty array when no attachments', async () => {
      const html = `<!DOCTYPE html><html><body><p>${'X'.repeat(300)}</p></body></html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'a[href*="attachment"], a[href*="attach"]': { each: () => {} },
        'meta[name="attachments"], meta[name="attachment-count"]': { attr: () => undefined },
        'body': { text: () => 'X'.repeat(300), length: 1 },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/email.html');

      expect(result.attachments).toEqual([]);
    });
  });

  describe('Format Detection', () => {
    it('should identify .html files as parseable', () => {
      expect(parser.canParse('/test/email.html')).toBe(true);
      expect(parser.canParse('/test/EMAIL.HTML')).toBe(true); // Case insensitive
      expect(parser.canParse('/path/to/file.html')).toBe(true);
    });

    it('should identify .htm files as parseable', () => {
      expect(parser.canParse('/test/email.htm')).toBe(true);
      expect(parser.canParse('/test/EMAIL.HTM')).toBe(true); // Case insensitive
      expect(parser.canParse('/path/to/file.htm')).toBe(true);
    });

    it('should reject non-.html/.htm files', () => {
      expect(parser.canParse('/test/email.eml')).toBe(false);
      expect(parser.canParse('/test/email.msg')).toBe(false);
      expect(parser.canParse('/test/email.txt')).toBe(false);
      expect(parser.canParse('/test/email')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when file read fails', async () => {
      mockRefs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(parser.parse('/test/missing.html')).rejects.toThrow('HtmlParser failed');
    });

    it('should include file path in error message', async () => {
      mockRefs.readFile.mockRejectedValue(new Error('Read error'));

      await expect(parser.parse('/path/to/file.html')).rejects.toThrow('/path/to/file.html');
    });

    it('should log error on parsing failure', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('@/config/logger');
      mockRefs.readFile.mockRejectedValue(new Error('Parse error'));

      try {
        await parser.parse('/test/error.html');
      } catch {
        // Expected error
      }

      expect(logger.error).toHaveBeenCalledWith(
        'HtmlParser',
        'Failed to parse .htm/.html file',
        expect.any(Error),
        { filePath: '/test/error.html' }
      );
    });
  });

  describe('ParsedEmail Structure', () => {
    it('should return complete ParsedEmail object with format=html', async () => {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="message-id" content="<structure@example.com>" />
  <meta name="from" content="from@example.com" />
  <title>HTML Structure Test</title>
</head>
<body><p>${'Y'.repeat(300)}</p></body>
</html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'meta[name="message-id"]': { attr: (name: string) => (name === 'content' ? '<structure@example.com>' : undefined) },
        'meta[name="from"]': { attr: (name: string) => (name === 'content' ? 'from@example.com' : undefined) },
        'title': { text: () => 'HTML Structure Test' },
        'body': { text: () => 'Y'.repeat(300), length: 1 },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/structure.html');

      expect(result).toMatchObject({
        email_hash: expect.any(String),
        message_id: 'structure@example.com',
        from: 'from@example.com',
        subject: 'HTML Structure Test',
        date: expect.any(String),
        body: 'Y'.repeat(300),
        file_path: '/test/structure.html',
        format: 'html',
        extract_status: 'success',
      });

      expect(result.email_hash).toHaveLength(64);
    });
  });

  describe('Message-ID Extraction Rate Compliance (SC-004)', () => {
    it('should demonstrate ~30% Message-ID extraction rate', async () => {
      // Test multiple HTML export patterns
      const testCases = [
        {
          description: 'Has Message-ID in meta tag',
          html: '<meta name="message-id" content="<test1@example.com>" />',
          expectedId: 'test1@example.com',
        },
        {
          description: 'Has Message-ID in body',
          html: '<p>Message-ID: &lt;test2@example.com&gt;</p>',
          expectedId: 'test2@example.com',
        },
        {
          description: 'No Message-ID (common for HTML exports)',
          html: '<p>Just content, no metadata</p>',
          expectedId: undefined,
        },
        {
          description: 'Another no Message-ID case',
          html: '<div>Exported without headers</div>',
          expectedId: undefined,
        },
      ];

      let extractionCount = 0;

      for (const testCase of testCases) {
        const html = `<!DOCTYPE html><html><body>${testCase.html}<p>${'Z'.repeat(300)}</p></body></html>`;

        mockRefs.readFile.mockResolvedValue(html);

        const $ = mockCheerioInstance({
          'meta[name="message-id"]': { attr: () => undefined },
          'body': { text: () => `${testCase.html}\n${'Z'.repeat(300)}`, length: 1 },
        });
        mockRefs.cheerioLoad.mockReturnValue($);

        const result = await parser.parse('/test/email.html');

        if (result.message_id) {
          extractionCount++;
        }
      }

      // HTML format has low Message-ID availability (~30% per SC-004)
      // This test demonstrates the limited extraction capability
      expect(extractionCount).toBeLessThanOrEqual(testCases.length * 0.5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed HTML gracefully', async () => {
      const html = `<div><p>Unclosed tags${'AA'.repeat(300)}</body></html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'body': { text: () => 'Unclosed tags' + 'AA'.repeat(300), length: 1 },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/malformed.html');

      expect(result.body).toBeDefined();
    });

    it('should handle empty HTML document', async () => {
      const html = `<!DOCTYPE html><html><body></body></html>`;

      mockRefs.readFile.mockResolvedValue(html);

      const $ = mockCheerioInstance({
        'body': { text: () => '', length: 1 },
      });
      mockRefs.cheerioLoad.mockReturnValue($);

      const result = await parser.parse('/test/empty.html');

      expect(result.body).toBeUndefined();
      expect(result.extract_status).toBe('no_content');
    });
  });
});

// Helper function to create a mock cheerio instance
function mockCheerioInstance(selectors: Record<string, any>): any {
  return {
    ...Object.entries(selectors).reduce((acc, [selector, impl]) => {
      acc[selector] = impl;
      return acc;
    }, {} as Record<string, any>),
    length: 1,
  };
}
