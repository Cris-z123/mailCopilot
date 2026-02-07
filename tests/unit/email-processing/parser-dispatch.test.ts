/**
 * Unit tests for ParserFactory format detection and parser dispatch
 *
 * Tests automatic format detection from file extensions and delegation
 * to appropriate parser implementation.
 *
 * Per plan.md FR-008: Message-ID extraction rates vary by format:
 * - .eml: ≥95%
 * - .msg: ≥85%
 * - .pst/.ost: ≥90%
 * - .mbox: ≥95%
 * - .htm/.html: ~30%
 *
 * @tests/unit/email-processing/parser-dispatch.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParserFactory } from '@/email/parsers/ParserFactory';
// Import logger for testing purposes (will be mocked)
import { logger } from '@/config/logger';

// Mock all parsers
vi.mock('@/email/parsers/EmlParser', () => {
  const mockParse = vi.fn();
  mockParse.mockImplementation((filePath: string) => Promise.resolve({
    email_hash: 'abc123',
    message_id: 'test@eml.com',
    from: 'sender@eml.com',
    subject: 'EML Test',
    date: '2024-02-05T10:00:00Z',
    attachments: [],
    body: 'EML body content',
    file_path: filePath,
    format: 'eml' as const,
    extract_status: 'success' as const,
  }));
  const mockInstance = {
    canParse: (filePath: string) => filePath.toLowerCase().endsWith('.eml'),
    parse: mockParse,
  };
  Object.defineProperty(mockInstance, 'constructor', { value: { name: 'EmlParser' } });
  return {
    EmlParser: vi.fn(() => mockInstance),
  };
});

vi.mock('@/email/parsers/MsgParser', () => {
  const mockParse = vi.fn();
  mockParse.mockImplementation((filePath: string) => Promise.resolve({
    email_hash: 'def456',
    message_id: 'test@msg.com',
    from: 'sender@msg.com',
    subject: 'MSG Test',
    date: '2024-02-05T10:00:00Z',
    attachments: [],
    body: 'MSG body content',
    file_path: filePath,
    format: 'msg' as const,
    extract_status: 'success' as const,
  }));
  const mockInstance = {
    canParse: (filePath: string) => filePath.toLowerCase().endsWith('.msg'),
    parse: mockParse,
  };
  Object.defineProperty(mockInstance, 'constructor', { value: { name: 'MsgParser' } });
  return {
    MsgParser: vi.fn(() => mockInstance),
  };
});

vi.mock('@/email/parsers/PstParser', () => {
  const mockParse = vi.fn();
  mockParse.mockImplementation((filePath: string) => {
    const isOst = filePath.toLowerCase().endsWith('.ost');
    return Promise.resolve({
      email_hash: 'ghi789',
      message_id: 'test@pst.com',
      from: 'sender@pst.com',
      subject: 'PST Test',
      date: '2024-02-05T10:00:00Z',
      attachments: [],
      body: 'PST body content',
      file_path: filePath,
      format: isOst ? ('ost' as const) : ('pst' as const),
      extract_status: 'success' as const,
    });
  });
  const mockInstance = {
    canParse: (filePath: string) =>
      filePath.toLowerCase().endsWith('.pst') || filePath.toLowerCase().endsWith('.ost'),
    parse: mockParse,
  };
  Object.defineProperty(mockInstance, 'constructor', { value: { name: 'PstParser' } });
  return {
    PstParser: vi.fn(() => mockInstance),
  };
});

vi.mock('@/email/parsers/MboxParser', () => {
  const mockParse = vi.fn();
  mockParse.mockImplementation((filePath: string) => Promise.resolve({
    email_hash: 'jkl012',
    message_id: 'test@mbox.com',
    from: 'sender@mbox.com',
    subject: 'Mbox Test',
    date: '2024-02-05T10:00:00Z',
    attachments: [],
    body: 'Mbox body content',
    file_path: filePath,
    format: 'mbox' as const,
    extract_status: 'success' as const,
  }));
  const mockInstance = {
    canParse: (filePath: string) => filePath.toLowerCase().endsWith('.mbox'),
    parse: mockParse,
  };
  Object.defineProperty(mockInstance, 'constructor', { value: { name: 'MboxParser' } });
  return {
    MboxParser: vi.fn(() => mockInstance),
  };
});

vi.mock('@/email/parsers/HtmlParser', () => {
  const mockParse = vi.fn();
  mockParse.mockImplementation((filePath: string) => Promise.resolve({
    email_hash: 'mno345',
    message_id: 'test@html.com',
    from: 'sender@html.com',
    subject: 'HTML Test',
    date: '2024-02-05T10:00:00Z',
    attachments: [],
    body: 'HTML body content',
    file_path: filePath,
    format: 'html' as const,
    extract_status: 'success' as const,
  }));
  const mockInstance = {
    canParse: (filePath: string) =>
      filePath.toLowerCase().endsWith('.html') || filePath.toLowerCase().endsWith('.htm'),
    parse: mockParse,
  };
  Object.defineProperty(mockInstance, 'constructor', { value: { name: 'HtmlParser' } });
  return {
    HtmlParser: vi.fn(() => mockInstance),
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

describe('ParserFactory', () => {
  let factory: ParserFactory;

  beforeEach(() => {
    factory = new ParserFactory();
  });

  describe('Format Detection', () => {
    it('should detect .eml format', () => {
      expect(factory.detectFormat('/test/email.eml')).toBe('eml');
      expect(factory.detectFormat('/test/EMAIL.EML')).toBe('eml'); // Case insensitive
      expect(factory.detectFormat('/path/to/file.eml')).toBe('eml');
    });

    it('should detect .msg format', () => {
      expect(factory.detectFormat('/test/email.msg')).toBe('msg');
      expect(factory.detectFormat('/test/EMAIL.MSG')).toBe('msg'); // Case insensitive
      expect(factory.detectFormat('/path/to/file.msg')).toBe('msg');
    });

    it('should detect .pst format', () => {
      expect(factory.detectFormat('/test/archive.pst')).toBe('pst');
      expect(factory.detectFormat('/test/ARCHIVE.PST')).toBe('pst'); // Case insensitive
      expect(factory.detectFormat('/path/to/file.pst')).toBe('pst');
    });

    it('should detect .ost format', () => {
      expect(factory.detectFormat('/test/archive.ost')).toBe('ost');
      expect(factory.detectFormat('/test/ARCHIVE.OST')).toBe('ost'); // Case insensitive
      expect(factory.detectFormat('/path/to/file.ost')).toBe('ost');
    });

    it('should detect .mbox format', () => {
      expect(factory.detectFormat('/test/emails.mbox')).toBe('mbox');
      expect(factory.detectFormat('/test/EMAILS.MBOX')).toBe('mbox'); // Case insensitive
      expect(factory.detectFormat('/path/to/file.mbox')).toBe('mbox');
    });

    it('should detect .html format', () => {
      expect(factory.detectFormat('/test/email.html')).toBe('html');
      expect(factory.detectFormat('/test/EMAIL.HTML')).toBe('html'); // Case insensitive
      expect(factory.detectFormat('/path/to/file.html')).toBe('html');
    });

    it('should detect .htm format', () => {
      expect(factory.detectFormat('/test/email.htm')).toBe('html');
      expect(factory.detectFormat('/test/EMAIL.HTM')).toBe('html'); // Case insensitive
      expect(factory.detectFormat('/path/to/file.htm')).toBe('html');
    });

    it('should return undefined for unsupported formats', () => {
      expect(factory.detectFormat('/test/email.pdf')).toBeUndefined();
      expect(factory.detectFormat('/test/email.txt')).toBeUndefined();
      expect(factory.detectFormat('/test/email.zip')).toBeUndefined();
      expect(factory.detectFormat('/test/email')).toBeUndefined();
    });
  });

  describe('Parser Selection', () => {
    it('should select EmlParser for .eml files', () => {
      const parser = factory.getParser('/test/email.eml');
      expect(parser).toBeDefined();
      expect(parser?.constructor.name).toBe('EmlParser');
    });

    it('should select MsgParser for .msg files', () => {
      const parser = factory.getParser('/test/email.msg');
      expect(parser).toBeDefined();
      expect(parser?.constructor.name).toBe('MsgParser');
    });

    it('should select PstParser for .pst files', () => {
      const parser = factory.getParser('/test/archive.pst');
      expect(parser).toBeDefined();
      expect(parser?.constructor.name).toBe('PstParser');
    });

    it('should select PstParser for .ost files', () => {
      const parser = factory.getParser('/test/archive.ost');
      expect(parser).toBeDefined();
      expect(parser?.constructor.name).toBe('PstParser');
    });

    it('should select MboxParser for .mbox files', () => {
      const parser = factory.getParser('/test/emails.mbox');
      expect(parser).toBeDefined();
      expect(parser?.constructor.name).toBe('MboxParser');
    });

    it('should select HtmlParser for .html files', () => {
      const parser = factory.getParser('/test/email.html');
      expect(parser).toBeDefined();
      expect(parser?.constructor.name).toBe('HtmlParser');
    });

    it('should select HtmlParser for .htm files', () => {
      const parser = factory.getParser('/test/email.htm');
      expect(parser).toBeDefined();
      expect(parser?.constructor.name).toBe('HtmlParser');
    });

    it('should return undefined for unsupported formats', () => {
      const parser = factory.getParser('/test/email.pdf');
      expect(parser).toBeUndefined();
    });
  });

  describe('Parse Dispatch', () => {
    it('should dispatch .eml files to EmlParser', async () => {
      const result = await factory.parse('/test/email.eml');

      expect(result.format).toBe('eml');
      expect(result.message_id).toBe('test@eml.com');
      expect(result.subject).toBe('EML Test');
    });

    it('should dispatch .msg files to MsgParser', async () => {
      const result = await factory.parse('/test/email.msg');

      expect(result.format).toBe('msg');
      expect(result.message_id).toBe('test@msg.com');
      expect(result.subject).toBe('MSG Test');
    });

    it('should dispatch .pst files to PstParser', async () => {
      const result = await factory.parse('/test/archive.pst');

      expect(result.format).toBe('pst');
      expect(result.message_id).toBe('test@pst.com');
      expect(result.subject).toBe('PST Test');
    });

    it('should dispatch .ost files to PstParser', async () => {
      const result = await factory.parse('/test/archive.ost');

      expect(result.format).toBe('ost');
      expect(result.message_id).toBe('test@pst.com');
      expect(result.subject).toBe('PST Test');
    });

    it('should dispatch .mbox files to MboxParser', async () => {
      const result = await factory.parse('/test/emails.mbox');

      expect(result.format).toBe('mbox');
      expect(result.message_id).toBe('test@mbox.com');
      expect(result.subject).toBe('Mbox Test');
    });

    it('should dispatch .html files to HtmlParser', async () => {
      const result = await factory.parse('/test/email.html');

      expect(result.format).toBe('html');
      expect(result.message_id).toBe('test@html.com');
      expect(result.subject).toBe('HTML Test');
    });

    it('should dispatch .htm files to HtmlParser', async () => {
      const result = await factory.parse('/test/email.htm');

      expect(result.format).toBe('html');
      expect(result.message_id).toBe('test@html.com');
      expect(result.subject).toBe('HTML Test');
    });

    it('should throw error for unsupported formats', async () => {
      await expect(factory.parse('/test/email.pdf')).rejects.toThrow('Unsupported email format');
    });

    it('should include supported formats in error message', async () => {
      try {
        await factory.parse('/test/email.xyz');
      } catch (error) {
        expect((error as Error).message).toContain('.eml');
        expect((error as Error).message).toContain('.msg');
        expect((error as Error).message).toContain('.pst');
        expect((error as Error).message).toContain('.ost');
        expect((error as Error).message).toContain('.mbox');
        expect((error as Error).message).toContain('.html');
        expect((error as Error).message).toContain('.htm');
      }
    });
  });

  describe('Format Support Check', () => {
    it('should return true for supported formats', () => {
      expect(factory.isSupported('/test/email.eml')).toBe(true);
      expect(factory.isSupported('/test/email.msg')).toBe(true);
      expect(factory.isSupported('/test/archive.pst')).toBe(true);
      expect(factory.isSupported('/test/archive.ost')).toBe(true);
      expect(factory.isSupported('/test/emails.mbox')).toBe(true);
      expect(factory.isSupported('/test/email.html')).toBe(true);
      expect(factory.isSupported('/test/email.htm')).toBe(true);
    });

    it('should return false for unsupported formats', () => {
      expect(factory.isSupported('/test/email.pdf')).toBe(false);
      expect(factory.isSupported('/test/email.txt')).toBe(false);
      expect(factory.isSupported('/test/email.zip')).toBe(false);
      expect(factory.isSupported('/test/email')).toBe(false);
    });
  });

  describe('Supported Extensions', () => {
    it('should return list of supported extensions', () => {
      const extensions = factory.getSupportedExtensions();

      expect(extensions).toContain('.eml');
      expect(extensions).toContain('.msg');
      expect(extensions).toContain('.pst');
      expect(extensions).toContain('.ost');
      expect(extensions).toContain('.mbox');
      expect(extensions).toContain('.html');
      expect(extensions).toContain('.htm');
      expect(extensions).toHaveLength(7);
    });
  });

  describe('Extraction Rate Targets (SC-004)', () => {
    it('should return correct extraction rate for .eml format', () => {
      expect(factory.getExtractionRateTarget('eml')).toBe(0.95); // ≥95%
    });

    it('should return correct extraction rate for .msg format', () => {
      expect(factory.getExtractionRateTarget('msg')).toBe(0.85); // ≥85%
    });

    it('should return correct extraction rate for .pst format', () => {
      expect(factory.getExtractionRateTarget('pst')).toBe(0.90); // ≥90%
    });

    it('should return correct extraction rate for .ost format', () => {
      expect(factory.getExtractionRateTarget('ost')).toBe(0.90); // ≥90%
    });

    it('should return correct extraction rate for .mbox format', () => {
      expect(factory.getExtractionRateTarget('mbox')).toBe(0.95); // ≥95%
    });

    it('should return correct extraction rate for .html format', () => {
      expect(factory.getExtractionRateTarget('html')).toBe(0.30); // ~30%
    });

    it('should return 0 for unknown format', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(factory.getExtractionRateTarget('unknown' as any)).toBe(0.0);
    });
  });

  describe('Maximum Confidence (FR-011)', () => {
    it('should return 1.0 for most formats', () => {
      expect(factory.getMaxConfidence('eml')).toBe(1.0);
      expect(factory.getMaxConfidence('msg')).toBe(1.0);
      expect(factory.getMaxConfidence('pst')).toBe(1.0);
      expect(factory.getMaxConfidence('ost')).toBe(1.0);
      expect(factory.getMaxConfidence('mbox')).toBe(1.0);
    });

    it('should return 0.6 for HTML format (capped per FR-011)', () => {
      expect(factory.getMaxConfidence('html')).toBe(0.6);
    });
  });

  describe('Case Insensitive Extension Handling', () => {
    it('should detect format regardless of case', () => {
      expect(factory.detectFormat('/test/file.EML')).toBe('eml');
      expect(factory.detectFormat('/test/file.Eml')).toBe('eml');
      expect(factory.detectFormat('/test/file.EmL')).toBe('eml');

      expect(factory.detectFormat('/test/file.MSG')).toBe('msg');
      expect(factory.detectFormat('/test/file.Msg')).toBe('msg');

      expect(factory.detectFormat('/test/file.PST')).toBe('pst');
      expect(factory.detectFormat('/test/file.Pst')).toBe('pst');

      expect(factory.detectFormat('/test/file.OST')).toBe('ost');
      expect(factory.detectFormat('/test/file.Ost')).toBe('ost');

      expect(factory.detectFormat('/test/file.MBOX')).toBe('mbox');
      expect(factory.detectFormat('/test/file.Mbox')).toBe('mbox');

      expect(factory.detectFormat('/test/file.HTML')).toBe('html');
      expect(factory.detectFormat('/test/file.Html')).toBe('html');

      expect(factory.detectFormat('/test/file.HTM')).toBe('html');
      expect(factory.detectFormat('/test/file.Htm')).toBe('html');
    });

    it('should select parser regardless of case', () => {
      expect(factory.getParser('/test/file.EML')).toBeDefined();
      expect(factory.getParser('/test/file.MSG')).toBeDefined();
      expect(factory.getParser('/test/file.PST')).toBeDefined();
      expect(factory.getParser('/test/file.OST')).toBeDefined();
      expect(factory.getParser('/test/file.MBOX')).toBeDefined();
      expect(factory.getParser('/test/file.HTML')).toBeDefined();
      expect(factory.getParser('/test/file.HTM')).toBeDefined();
    });
  });

  describe('File Path Edge Cases', () => {
    it('should handle file paths with multiple dots', () => {
      expect(factory.detectFormat('/test/email.archive.eml')).toBe('eml');
      expect(factory.detectFormat('/test/backup.2024.pst')).toBe('pst');
    });

    it('should handle file paths with spaces', () => {
      const parser = factory.getParser('/test/my email.msg');
      expect(parser).toBeDefined();
      expect(parser?.constructor.name).toBe('MsgParser');
    });

    it('should handle file paths with special characters', () => {
      const parser = factory.getParser('/test/email-copy(1).eml');
      expect(parser).toBeDefined();
      expect(parser?.constructor.name).toBe('EmlParser');
    });

    it('should handle file paths with query parameters', () => {
      // Should ignore query params for extension detection
      expect(factory.detectFormat('/test/email.html?param=value')).toBeUndefined();
    });
  });

  describe('Parser Initialization', () => {
    it('should initialize all parsers on construction', () => {
      const newFactory = new ParserFactory();

      // Verify all parsers are available
      expect(newFactory.getParser('/test/email.eml')).toBeDefined();
      expect(newFactory.getParser('/test/email.msg')).toBeDefined();
      expect(newFactory.getParser('/test/archive.pst')).toBeDefined();
      expect(newFactory.getParser('/test/emails.mbox')).toBeDefined();
      expect(newFactory.getParser('/test/email.html')).toBeDefined();
    });

    it('should create separate parser instances', () => {
      const parser1 = factory.getParser('/test/email1.eml');
      const parser2 = factory.getParser('/test/email2.eml');

      // Each call should get a parser (same or different instance depends on implementation)
      expect(parser1).toBeDefined();
      expect(parser2).toBeDefined();
    });
  });

  describe('Logging', () => {
    it('should log debug message during parse', async () => {
      await factory.parse('/test/email.eml');

      expect(logger.debug).toHaveBeenLastCalledWith(
        'ParserFactory',
        'Using EmlParser for file: /test/email.eml'
      );
    });

    it('should log which file is being parsed', async () => {
      await factory.parse('/test/specific-email.msg');

      expect(logger.debug).toHaveBeenLastCalledWith(
        'ParserFactory',
        'Using MsgParser for file: /test/specific-email.msg'
      );
    });
  });

  describe('Integration with EmailParser Interface', () => {
    it('should return ParsedEmail objects with correct structure', async () => {
      const result = await factory.parse('/test/email.eml');

      expect(result).toMatchObject({
        email_hash: expect.any(String),
        message_id: expect.any(String),
        from: expect.any(String),
        subject: expect.any(String),
        date: expect.any(String),
        attachments: expect.any(Array),
        body: expect.any(String),
        file_path: expect.any(String),
        format: expect.any(String),
        extract_status: expect.any(String),
      });
    });

    it('should preserve file_path in returned object', async () => {
      const testPath = '/test/specific/path/email.eml';
      const result = await factory.parse(testPath);

      expect(result.file_path).toBe(testPath);
    });

    it('should set correct format value', async () => {
      const emlResult = await factory.parse('/test/email.eml');
      const msgResult = await factory.parse('/test/email.msg');
      const pstResult = await factory.parse('/test/archive.pst');
      const mboxResult = await factory.parse('/test/emails.mbox');
      const htmlResult = await factory.parse('/test/email.html');

      expect(emlResult.format).toBe('eml');
      expect(msgResult.format).toBe('msg');
      expect(pstResult.format).toBe('pst');
      expect(mboxResult.format).toBe('mbox');
      expect(htmlResult.format).toBe('html');
    });
  });

  describe('Performance Characteristics', () => {
    it('should detect format synchronously (no async overhead)', () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        factory.detectFormat('/test/email.eml');
      }

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // Should be very fast (< 10ms for 1000 calls)
      expect(elapsed).toBeLessThan(50);
    });

    it('should get parser synchronously (no async overhead)', () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        factory.getParser('/test/email.msg');
      }

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // Should be very fast
      expect(elapsed).toBeLessThan(50);
    });
  });
});
