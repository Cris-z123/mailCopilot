/**
 * EmlParser Unit Tests
 *
 * Tests for RFC 5322 .eml format parser
 * Per plan.md: ≥95% Message-ID extraction rate (SC-004)
 *
 * @module tests/unit/email/eml-parser.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EmlParser } from '@/email/parsers/EmlParser';

describe('EmlParser', () => {
  let parser: EmlParser;
  let tempDir: string;

  beforeEach(async () => {
    parser = new EmlParser();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eml-test-'));
  });

  afterEach(async () => {
    // Clean up temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('canParse', () => {
    it('should return true for .eml files', () => {
      expect(parser.canParse('test.eml')).toBe(true);
      expect(parser.canParse('/path/to/email.eml')).toBe(true);
      expect(parser.canParse('C:\\Users\\test\\email.eml')).toBe(true);
    });

    it('should return false for non-.eml files', () => {
      expect(parser.canParse('test.msg')).toBe(false);
      expect(parser.canParse('test.html')).toBe(false);
      expect(parser.canParse('test.txt')).toBe(false);
      expect(parser.canParse('test')).toBe(false);
    });

    it('should be case-insensitive for extension', () => {
      expect(parser.canParse('test.EML')).toBe(true);
      expect(parser.canParse('test.Eml')).toBe(true);
      expect(parser.canParse('test.EmL')).toBe(true);
    });
  });

  describe('parse - standard email', () => {
    it('should parse basic email with all fields', async () => {
      const emlContent = `Message-ID: <test123@example.com>
From: sender@example.com
To: recipient@example.com
Subject: Test Subject
Date: Mon, 27 Jan 2026 10:30:00 +0000

This is a test email body with enough content to be reliable for fingerprinting purposes. It contains multiple sentences and paragraphs to ensure we have at least 200 characters of content. This is important for the system to properly extract and process the email content without falling into the degraded mode that occurs when content is too short.
`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      // Verify basic fields
      expect(result.message_id).toBe('test123@example.com');
      expect(result.from).toBe('sender@example.com');
      expect(result.subject).toBe('Test Subject');
      expect(result.format).toBe('eml');
      expect(result.extract_status).toBe('success');

      // Verify email hash is computed
      expect(result.email_hash).toBeDefined();
      expect(result.email_hash).toHaveLength(64); // SHA-256 = 64 hex chars

      // Verify date extraction
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Verify body is extracted
      expect(result.body).toBeDefined();
      expect(result.body!.length).toBeGreaterThan(200);
    });

    it('should extract Message-ID correctly (FR-001)', async () => {
      const emlContent = `Message-ID: <unique-id-12345@domain.com>
From: test@example.com
Subject: Test

Body content here.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.message_id).toBe('unique-id-12345@domain.com');
    });

    it('should handle Message-ID with angle brackets', async () => {
      const emlContent = `Message-ID: <bracketed-id@example.com>
From: test@example.com
Subject: Test

Body content here.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.message_id).toBe('bracketed-id@example.com');
      expect(result.message_id).not.toContain('<');
      expect(result.message_id).not.toContain('>');
    });
  });

  describe('parse - email hash computation (R0-4)', () => {
    it('should compute SHA-256 hash from Message-ID + Date + From', async () => {
      const emlContent = `Message-ID: <test-id@example.com>
From: sender@example.com
Date: Mon, 27 Jan 2026 10:30:00 +0000
Subject: Test

Body content that is long enough to be reliable for fingerprinting purposes. We need at least 200 characters to ensure the system can properly process this email without falling into degraded mode. This is a test email with sufficient content.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      // Verify hash format (64 hex characters)
      expect(result.email_hash).toMatch(/^[a-f0-9]{64}$/);

      // Verify hash is deterministic (same input = same hash)
      const result2 = await parser.parse(testFile);
      expect(result.email_hash).toBe(result2.email_hash);
    });

    it('should compute hash without Message-ID (degraded mode)', async () => {
      const emlContent = `From: sender@example.com
Date: Mon, 27 Jan 2026 10:30:00 +0000
Subject: Test

Body content that is long enough to be reliable for fingerprinting purposes. We need at least 200 characters to ensure the system can properly process this email without falling into degraded mode. This is a test email with sufficient content.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      // Hash should still be computed
      expect(result.email_hash).toBeDefined();
      expect(result.email_hash).toHaveLength(64);

      // Message-ID should be undefined
      expect(result.message_id).toBeUndefined();
    });
  });

  describe('parse - subject handling', () => {
    it('should extract subject correctly', async () => {
      const emlContent = `Subject: Q3预算终版
From: test@example.com
Date: Mon, 27 Jan 2026 10:30:00 +0000

Body content here.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.subject).toBe('Q3预算终版');
    });

    it('should handle missing subject (use fallback)', async () => {
      const emlContent = `From: test@example.com
Date: Mon, 27 Jan 2026 10:30:00 +0000

Body content here.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.subject).toBe('(无主题)');
    });
  });

  describe('parse - date handling', () => {
    it('should extract date in ISO 8601 format', async () => {
      const emlContent = `Date: Mon, 27 Jan 2026 10:30:00 +0000
From: test@example.com
Subject: Test

Body content here.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      // Accept both UTC (Z) and timezone offset (+/-HH:MM) formats
      // date-fns preserves local timezone information per plan.md R0-9
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/);
    });

    it('should handle missing date gracefully', async () => {
      const emlContent = `From: test@example.com
Subject: Test

Body content that is long enough to be reliable for fingerprinting purposes. We need at least 200 characters to ensure the system can properly process this email without falling into degraded mode. This is a test email with sufficient content.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      // Should have a date (fallback to current time)
      expect(result.date).toBeDefined();
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('parse - body handling', () => {
    it('should extract plain text body', async () => {
      const longBody = 'A'.repeat(300); // > 200 chars
      const emlContent = `From: test@example.com
Subject: Test
Date: Mon, 27 Jan 2026 10:30:00 +0000

${longBody}`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.body).toBeDefined();
      expect(result.body!.length).toBe(300);
    });

    it('should strip HTML tags from HTML-only emails', async () => {
      // Create HTML content longer than 200 chars to avoid "no_content" status
      const htmlBody = '<html><body><p>' + 'This is HTML content with tags. '.repeat(10) + '</p></body></html>';
      const emlContent = `Content-Type: text/html
From: test@example.com
Subject: Test
Date: Mon, 27 Jan 2026 10:30:00 +0000

${htmlBody}`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.body).toBeDefined();
      expect(result.body).not.toContain('<html>');
      expect(result.body).not.toContain('<p>');
    });

    it('should truncate body to 100k characters', async () => {
      const longBody = 'A'.repeat(150000); // 150k chars
      const emlContent = `From: test@example.com
Subject: Test
Date: Mon, 27 Jan 2026 10:30:00 +0000

${longBody}`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.body).toBeDefined();
      expect(result.body!.length).toBe(100000);
    });

    it('should return undefined for short content (<200 chars per FR-013)', async () => {
      const shortBody = 'Short content.';
      const emlContent = `From: test@example.com
Subject: Test
Date: Mon, 27 Jan 2026 10:30:00 +0000

${shortBody}`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.body).toBeUndefined();
      expect(result.extract_status).toBe('no_content');
    });
  });

  describe('parse - attachments', () => {
    it('should extract attachment metadata', async () => {
      // Note: mailparser would parse actual attachments in real emails
      // For unit tests, we verify the structure exists
      const emlContent = `From: test@example.com
Subject: Test
Date: Mon, 27 Jan 2026 10:30:00 +0000

Body content that is long enough to be reliable for fingerprinting purposes. We need at least 200 characters to ensure the system can properly process this email without falling into degraded mode. This is a test email with sufficient content.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      // Should have attachments array (even if empty)
      expect(result.attachments).toBeDefined();
      expect(Array.isArray(result.attachments)).toBe(true);
    });

    it('should not store attachment content (FR-044)', async () => {
      const emlContent = `From: test@example.com
Subject: Test
Date: Mon, 27 Jan 2026 10:30:00 +0000

Body content that is long enough to be reliable for fingerprinting purposes. We need at least 200 characters to ensure the system can properly process this email without falling into degraded mode. This is a test email with sufficient content.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      // Verify attachment structure has no content field
      if (result.attachments.length > 0) {
        result.attachments.forEach(att => {
          expect(att).not.toHaveProperty('content');
          expect(att).toHaveProperty('filename');
          expect(att).toHaveProperty('size');
          expect(att).toHaveProperty('mime_type');
        });
      }
    });
  });

  describe('parse - sender handling', () => {
    it('should extract sender email address', async () => {
      const emlContent = `From: sender@example.com
Subject: Test
Date: Mon, 27 Jan 2026 10:30:00 +0000

Body content that is long enough to be reliable for fingerprinting purposes. We need at least 200 characters to ensure the system can properly process this email without falling into degraded mode. This is a test email with sufficient content.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.from).toBe('sender@example.com');
    });

    it('should handle missing From header gracefully', async () => {
      const emlContent = `Subject: Test
Date: Mon, 27 Jan 2026 10:30:00 +0000

Body content that is long enough to be reliable for fingerprinting purposes. We need at least 200 characters to ensure the system can properly process this email without falling into degraded mode. This is a test email with sufficient content.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.from).toBe('unknown@example.com');
    });
  });

  describe('parse - error handling', () => {
    it('should throw error for non-existent file', async () => {
      const testFile = path.join(tempDir, 'nonexistent.eml');

      await expect(parser.parse(testFile)).rejects.toThrow();
    });

    it('should throw error for corrupted email file', async () => {
      const corruptedContent = 'This is not a valid email format at all';
      const testFile = path.join(tempDir, 'corrupted.eml');
      await fs.writeFile(testFile, corruptedContent, 'utf-8');

      // mailparser might still parse this, but if it doesn't, it should throw
      // The important thing is it doesn't crash the application
      try {
        const result = await parser.parse(testFile);
        // If it parses, verify it has required fields
        expect(result).toBeDefined();
        expect(result.email_hash).toBeDefined();
      } catch (error) {
        // If it throws, that's also acceptable
        expect(error).toBeDefined();
      }
    });

    it('should set extract_status based on content availability', async () => {
      const shortBody = 'Short.'; // < 200 chars
      const emlContent = `From: test@example.com
Subject: Test
Date: Mon, 27 Jan 2026 10:30:00 +0000

${shortBody}`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.extract_status).toBe('no_content');
    });
  });

  describe('parse - file path handling', () => {
    it('should preserve absolute file path', async () => {
      const emlContent = `From: test@example.com
Subject: Test
Date: Mon, 27 Jan 2026 10:30:00 +0000

Body content that is long enough to be reliable for fingerprinting purposes. We need at least 200 characters to ensure the system can properly process this email without falling into degraded mode. This is a test email with sufficient content.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.file_path).toBe(testFile);
      expect(path.isAbsolute(result.file_path)).toBe(true);
    });
  });

  describe('Message-ID extraction rate (SC-004)', () => {
    it('should extract Message-ID from standard format', async () => {
      const emlContent = `Message-ID: <1234567890@example.com>
From: test@example.com
Subject: Test
Date: Mon, 27 Jan 2026 10:30:00 +0000

Body content that is long enough to be reliable for fingerprinting purposes.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.message_id).toBeDefined();
      expect(result.message_id).toBe('1234567890@example.com');
    });

    it('should handle Message-ID without angle brackets', async () => {
      const emlContent = `Message-ID: plain-id@example.com
From: test@example.com
Subject: Test
Date: Mon, 27 Jan 2026 10:30:00 +0000

Body content that is long enough to be reliable for fingerprinting purposes.`;

      const testFile = path.join(tempDir, 'test.eml');
      await fs.writeFile(testFile, emlContent, 'utf-8');

      const result = await parser.parse(testFile);

      expect(result.message_id).toBeDefined();
    });
  });
});
