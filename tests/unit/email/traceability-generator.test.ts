/**
 * TraceabilityGenerator Unit Tests
 *
 * Tests for search string and file path generation
 * Per plan.md R0-9: `from:sender subject:"snippet" date:YYYY-MM-DD`
 *
 * @module tests/unit/email/traceability-generator.test
 */

import { describe, it, expect } from 'vitest';
import { TraceabilityGenerator } from '../../../main/email/TraceabilityGenerator';
import type { ParsedEmail } from '../../../main/email/parsers/EmailParser';

describe('TraceabilityGenerator', () => {
  let generator: TraceabilityGenerator;

  beforeEach(() => {
    generator = new TraceabilityGenerator();
  });

  describe('generateTraceability', () => {
    it('should generate complete traceability info', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test-id@example.com',
        from: 'sender@example.com',
        subject: 'Test Subject',
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Email body content here',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      expect(result.search_string).toBeDefined();
      expect(result.file_path).toBe('/path/to/email.eml');
      expect(result.identifier).toBe('test-id@example.com');
      expect(result.identifier_type).toBe('message_id');
    });

    it('should use fingerprint when Message-ID is missing', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'sha256-hash-123',
        message_id: undefined,
        from: 'sender@example.com',
        subject: 'Test Subject',
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Email body content',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      expect(result.identifier).toBe('sha256-hash-123');
      expect(result.identifier_type).toBe('fingerprint');
    });
  });

  describe('generateSearchString', () => {
    it('should generate search string with all components (R0-9)', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'zhang@example.com',
        subject: 'Q3预算终版',
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Body content',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      expect(result.search_string).toContain('from:zhang@example.com');
      expect(result.search_string).toContain('subject:');
      expect(result.search_string).toContain('date:2026-01-27');
    });

    it('should handle multi-word subjects with quotes', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'sender@example.com',
        subject: 'This is a long subject line with many words',
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Body content',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      // Multi-word subjects should be quoted
      expect(result.search_string).toMatch(/subject:"[^"]+"/);
    });

    it('should handle single-word subjects without quotes', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'sender@example.com',
        subject: 'Budget',
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Body content',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      // Single-word subjects should not be quoted
      expect(result.search_string).toContain('subject:Budget');
      expect(result.search_string).not.toMatch(/subject:"/);
    });

    it('should extract date-only portion (YYYY-MM-DD)', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'sender@example.com',
        subject: 'Test',
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Body content',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      expect(result.search_string).toContain('date:2026-01-27');
      expect(result.search_string).not.toContain('T10:30:00');
    });
  });

  describe('cleanAndTruncateSubject', () => {
    it('should strip Re: prefix (case-insensitive)', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'sender@example.com',
        subject: 'Re: Original Subject',
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Body content',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      expect(result.search_string).not.toContain('Re:');
      expect(result.search_string).not.toContain('re:');
    });

    it('should strip Fw: and Fwd: prefixes', () => {
      const testCases = [
        'Fw: Forwarded Message',
        'Fwd: Another Forward',
        'fw: lowercase forward',
      ];

      testCases.forEach(subject => {
        const parsedEmail: ParsedEmail = {
          email_hash: 'abc123',
          message_id: 'test@example.com',
          from: 'sender@example.com',
          subject,
          date: '2026-01-27T10:30:00.000Z',
          attachments: [],
          body: 'Body content',
          file_path: '/path/to/email.eml',
          format: 'eml',
          extract_status: 'success',
        };

        const result = generator.generateTraceability(parsedEmail);

        expect(result.search_string).not.toMatch(/fw:|fwd:/i);
      });
    });

    it('should strip Chinese prefixes (回复:, 转发:, 答案:)', () => {
      const testCases = [
        '回复: Original Subject',
        '转发: Forwarded Message',
        '答案: Answer',
      ];

      testCases.forEach(subject => {
        const parsedEmail: ParsedEmail = {
          email_hash: 'abc123',
          message_id: 'test@example.com',
          from: 'sender@example.com',
          subject,
          date: '2026-01-27T10:30:00.000Z',
          attachments: [],
          body: 'Body content',
          file_path: '/path/to/email.eml',
          format: 'eml',
          extract_status: 'success',
        };

        const result = generator.generateTraceability(parsedEmail);

        expect(result.search_string).not.toContain('回复:');
        expect(result.search_string).not.toContain('转发:');
        expect(result.search_string).not.toContain('答案:');
      });
    });

    it('should truncate subject to 30 characters', () => {
      const longSubject = 'This is a very long subject line that definitely exceeds thirty characters';
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'sender@example.com',
        subject: longSubject,
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Body content',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      // Extract subject from search string
      const match = result.search_string.match(/subject:"([^"]+)"/);
      const subjectInSearch = match ? match[1] : '';

      expect(subjectInSearch.length).toBeLessThanOrEqual(30);
    });

    it('should handle empty subject gracefully', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'sender@example.com',
        subject: '',
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Body content',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      // Should not crash, should still generate search string
      expect(result.search_string).toBeDefined();
      expect(result.search_string).toContain('from:');
      expect(result.search_string).toContain('date:');
    });

    it('should handle whitespace-only subject', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'sender@example.com',
        subject: '   ',
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Body content',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      // Should not include subject in search string
      expect(result.search_string).toBeDefined();
      expect(result.search_string).not.toContain('subject:');
    });
  });

  describe('extractDateOnly', () => {
    it('should extract YYYY-MM-DD from ISO 8601 date', () => {
      const testCases = [
        { input: '2026-01-27T10:30:00.000Z', expected: '2026-01-27' },
        { input: '2026-12-31T23:59:59.999Z', expected: '2026-12-31' },
        { input: '2025-02-05T00:00:00.000Z', expected: '2025-02-05' },
      ];

      testCases.forEach(({ input, expected }) => {
        const parsedEmail: ParsedEmail = {
          email_hash: 'abc123',
          message_id: 'test@example.com',
          from: 'sender@example.com',
          subject: 'Test',
          date: input,
          attachments: [],
          body: 'Body content',
          file_path: '/path/to/email.eml',
          format: 'eml',
          extract_status: 'success',
        };

        const result = generator.generateTraceability(parsedEmail);

        expect(result.search_string).toContain(`date:${expected}`);
      });
    });

    it('should handle invalid date gracefully', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'sender@example.com',
        subject: 'Test',
        date: 'invalid-date',
        attachments: [],
        body: 'Body content',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      // Should still generate search string with current date
      expect(result.search_string).toBeDefined();
      expect(result.search_string).toMatch(/date:\d{4}-\d{2}-\d{2}/);
    });
  });

  describe('validateSearchString', () => {
    it('should validate correct search string format', () => {
      const validStrings = [
        'from:sender@example.com subject:Test date:2026-01-27',
        'from:test@example.com subject:"Long Subject" date:2026-01-27',
        'from:user@domain.com date:2026-01-27', // subject optional
      ];

      validStrings.forEach(str => {
        expect(generator.validateSearchString(str)).toBe(true);
      });
    });

    it('should reject invalid search strings', () => {
      const invalidStrings = [
        'subject:Test date:2026-01-27', // missing from:
        'from:sender@example.com subject:Test', // missing date:
        'just a random string',
        '',
      ];

      invalidStrings.forEach(str => {
        expect(generator.validateSearchString(str)).toBe(false);
      });
    });
  });

  describe('formatTraceabilitySummary', () => {
    it('should format human-readable summary with Message-ID', () => {
      const info = {
        search_string: 'from:sender@example.com subject:Test date:2026-01-27',
        file_path: '/path/to/email.eml',
        identifier: 'test-id@example.com',
        identifier_type: 'message_id' as const,
      };

      const summary = generator.formatTraceabilitySummary(info);

      expect(summary).toContain('from:sender@example.com');
      expect(summary).toContain('/path/to/email.eml');
      expect(summary).toContain('test-id@example.com');
      expect(summary).toContain('Message-ID');
    });

    it('should format human-readable summary with fingerprint', () => {
      const info = {
        search_string: 'from:sender@example.com date:2026-01-27',
        file_path: '/path/to/email.eml',
        identifier: 'sha256-hash-123',
        identifier_type: 'fingerprint' as const,
      };

      const summary = generator.formatTraceabilitySummary(info);

      expect(summary).toContain('sha256-hash-123');
      expect(summary).toContain('SHA-256 指纹');
    });
  });

  describe('fromDatabaseRecord', () => {
    it('should reconstruct TraceabilityInfo from database record', () => {
      const dbRecord = {
        search_string: 'from:sender@example.com subject:Test date:2026-01-27',
        file_path: '/path/to/email.eml',
      };

      const result = generator.fromDatabaseRecord(
        dbRecord,
        'test-id@example.com',
        'email-hash-123'
      );

      expect(result.search_string).toBe(dbRecord.search_string);
      expect(result.file_path).toBe(dbRecord.file_path);
      expect(result.identifier).toBe('test-id@example.com');
      expect(result.identifier_type).toBe('message_id');
    });

    it('should use fingerprint when Message-ID is undefined', () => {
      const dbRecord = {
        search_string: 'from:sender@example.com date:2026-01-27',
        file_path: '/path/to/email.eml',
      };

      const result = generator.fromDatabaseRecord(
        dbRecord,
        undefined,
        'email-hash-123'
      );

      expect(result.identifier).toBe('email-hash-123');
      expect(result.identifier_type).toBe('fingerprint');
    });
  });

  describe('error handling', () => {
    it('should handle missing subject gracefully', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'sender@example.com',
        subject: '',
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Body content',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      // Should not throw, should still generate valid traceability
      expect(result.search_string).toBeDefined();
      expect(result.search_string).toContain('from:');
      expect(result.search_string).toContain('date:');
    });

    it('should handle Chinese characters in subject', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'zhang@example.com',
        subject: 'Q3预算终版',
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Body content',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      expect(result.search_string).toContain('Q3预算');
    });
  });

  describe('compatibility with email clients', () => {
    it('should generate Thunderbird-compatible search strings', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'sender@example.com',
        subject: 'Project Update',
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Body content',
        file_path: '/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      // Thunderbird supports from:, subject:, date:
      expect(result.search_string).toMatch(/from:\S+/);
      expect(result.search_string).toMatch(/subject:\S+/);
      expect(result.search_string).toMatch(/date:\d{4}-\d{2}-\d{2}/);
    });

    it('should maintain file path as backup method', () => {
      const parsedEmail: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'sender@example.com',
        subject: 'Test',
        date: '2026-01-27T10:30:00.000Z',
        attachments: [],
        body: 'Body content',
        file_path: '/absolute/path/to/email.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = generator.generateTraceability(parsedEmail);

      expect(result.file_path).toBe('/absolute/path/to/email.eml');
    });
  });
});
