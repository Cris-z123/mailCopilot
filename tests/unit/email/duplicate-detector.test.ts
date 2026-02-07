/**
 * Unit tests for DuplicateDetector
 *
 * Tests duplicate detection logic per plan.md R0-4 and FR-008A:
 * - SHA-256 fingerprint: SHA256(Message-ID + Date + From)
 * - Same-batch detection: Skip entirely
 * - Cross-batch detection: Update last_seen_at timestamp
 * - Audit logging for all scenarios
 *
 * Test categories:
 * - Same-batch duplicate detection
 * - Cross-batch duplicate detection
 * - Audit logging verification
 * - Hash validation and fingerprint computation
 *
 * @module tests/unit/email/duplicate-detector.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DuplicateDetector } from '@/email/DuplicateDetector';
import type { ParsedEmail } from '@/email/parsers/EmailParser';
import { EmailSourceRepository, ExtractStatus } from '@/database/entities/EmailSource';
import { logger } from '@/config/logger';

// Mock EmailSourceRepository
vi.mock('@/database/entities/EmailSource', () => ({
  EmailSourceRepository: {
    findByHash: vi.fn(),
    updateLastSeen: vi.fn(),
  },
  ExtractStatus: {
    SUCCESS: 'success',
    NO_CONTENT: 'no_content',
    ERROR: 'error',
  },
}));

// Mock logger (use same path as source @/config/logger so DuplicateDetector gets the mock)
vi.mock('@/config/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('DuplicateDetector', () => {
  let detector: DuplicateDetector;
  let mockFindByHash: ReturnType<typeof vi.fn>;
  let mockUpdateLastSeen: ReturnType<typeof vi.fn>;

  // Sample email data for testing
  const sampleEmail1: ParsedEmail = {
    email_hash: 'abc123def456789abc123def456789abc123def456789abc123def456789abc1',
    message_id: '<test1@example.com>',
    from: 'sender1@example.com',
    subject: 'Test Subject 1',
    date: '2026-01-27T10:00:00.000Z',
    attachments: [],
    body: 'Test body content',
    file_path: '/path/to/email1.eml',
    format: 'eml',
    extract_status: 'success',
  };

  const sampleEmail2: ParsedEmail = {
    email_hash: 'def456789abc123def456789abc123def456789abc123def456789abc123def4567',
    message_id: '<test2@example.com>',
    from: 'sender2@example.com',
    subject: 'Test Subject 2',
    date: '2026-01-27T11:00:00.000Z',
    attachments: [],
    body: 'Test body content 2',
    file_path: '/path/to/email2.eml',
    format: 'eml',
    extract_status: 'success',
  };

  // Duplicate of sampleEmail1 (same hash)
  const duplicateEmail1: ParsedEmail = {
    ...sampleEmail1,
    file_path: '/path/to/email1-duplicate.eml',
  };

  beforeEach(() => {
    detector = new DuplicateDetector();

    // Get mock functions
    mockFindByHash = vi.mocked(EmailSourceRepository.findByHash);
    mockUpdateLastSeen = vi.mocked(EmailSourceRepository.updateLastSeen);

    // Clear all mocks
    vi.clearAllMocks();

    // Default: No existing emails in database (return null)
    mockFindByHash.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Same-Batch Duplicate Detection', () => {
    it('should detect same-batch duplicate when email hash exists in current batch', async () => {
      const stats = detector.createStats();

      // First email should not be duplicate
      const result1 = await detector.checkDuplicate(sampleEmail1, stats);
      expect(result1.is_duplicate).toBe(false);
      expect(result1.is_same_batch).toBe(false);
      expect(result1.is_cross_batch).toBe(false);
      expect(stats.same_batch_count).toBe(0);
      expect(stats.batch_hashes.has(sampleEmail1.email_hash)).toBe(true);

      // Second email with same hash should be detected as same-batch duplicate
      const result2 = await detector.checkDuplicate(duplicateEmail1, stats);
      expect(result2.is_duplicate).toBe(true);
      expect(result2.is_same_batch).toBe(true);
      expect(result2.is_cross_batch).toBe(false);
      expect(stats.same_batch_count).toBe(1);
    });

    it('should not detect duplicate when email hashes are different', async () => {
      const stats = detector.createStats();

      const result1 = await detector.checkDuplicate(sampleEmail1, stats);
      const result2 = await detector.checkDuplicate(sampleEmail2, stats);

      expect(result1.is_duplicate).toBe(false);
      expect(result2.is_duplicate).toBe(false);
      expect(stats.same_batch_count).toBe(0);
      expect(stats.batch_hashes.size).toBe(2);
    });

    it('should skip same-batch duplicates without database lookup', async () => {
      const stats = detector.createStats();

      // Add first email to batch
      await detector.checkDuplicate(sampleEmail1, stats);

      // Reset mock to verify it's not called for same-batch duplicate
      mockFindByHash.mockClear();

      // Check duplicate (same-batch should not call database)
      const result = await detector.checkDuplicate(duplicateEmail1, stats);

      expect(result.is_same_batch).toBe(true);
      expect(mockFindByHash).not.toHaveBeenCalled();
    });

    it('should track multiple same-batch duplicates', async () => {
      const stats = detector.createStats();

      // Add first email
      await detector.checkDuplicate(sampleEmail1, stats);

      // Add multiple duplicates
      await detector.checkDuplicate(duplicateEmail1, stats);
      await detector.checkDuplicate(duplicateEmail1, stats);
      await detector.checkDuplicate(duplicateEmail1, stats);

      expect(stats.same_batch_count).toBe(3);
      expect(stats.batch_hashes.size).toBe(1);
    });
  });

  describe('Cross-Batch Duplicate Detection', () => {
    it('should detect cross-batch duplicate when email exists in database', async () => {
      const existingRecord = {
        email_hash: sampleEmail1.email_hash,
        processed_at: 1706342400,
        last_seen_at: 1706342400,
        report_date: '2026-01-27',
        attachments_meta: '[]',
        extract_status: ExtractStatus.SUCCESS,
        search_string: 'from:sender1@example.com subject:"Test Subject 1" date:2026-01-27',
        file_path: '/old/path/email1.eml',
      };

      mockFindByHash.mockReturnValue(existingRecord);
      mockUpdateLastSeen.mockReturnValue({ ...existingRecord, last_seen_at: Math.floor(Date.now() / 1000) });

      const stats = detector.createStats();
      const result = await detector.checkDuplicate(sampleEmail1, stats);

      expect(result.is_duplicate).toBe(true);
      expect(result.is_same_batch).toBe(false);
      expect(result.is_cross_batch).toBe(true);
      expect(result.existing_record).toEqual({
        email_hash: existingRecord.email_hash,
        processed_at: existingRecord.processed_at,
        last_seen_at: existingRecord.last_seen_at,
      });

      // Verify updateLastSeen was called
      expect(mockUpdateLastSeen).toHaveBeenCalledWith(sampleEmail1.email_hash);

      // Verify stats tracking
      expect(stats.cross_batch_count).toBe(1);
    });

    it('should not add cross-batch duplicate to batch hashes', async () => {
      const existingRecord = {
        email_hash: sampleEmail1.email_hash,
        processed_at: 1706342400,
        last_seen_at: 1706342400,
        report_date: '2026-01-27',
        attachments_meta: '[]',
        extract_status: ExtractStatus.SUCCESS,
      };

      mockFindByHash.mockReturnValue(existingRecord);
      mockUpdateLastSeen.mockReturnValue(existingRecord);

      const stats = detector.createStats();
      await detector.checkDuplicate(sampleEmail1, stats);

      // Cross-batch duplicate should not be added to batch hashes
      expect(stats.batch_hashes.has(sampleEmail1.email_hash)).toBe(false);
    });

    it('should handle database errors gracefully by treating as not duplicate', async () => {
      // Simulate database error
      mockFindByHash.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const stats = detector.createStats();
      const result = await detector.checkDuplicate(sampleEmail1, stats);

      // On error, should not be treated as duplicate (conservative approach)
      expect(result.is_duplicate).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'DuplicateDetector',
        'Error checking duplicate',
        expect.any(Error),
        expect.objectContaining({
          email_hash: sampleEmail1.email_hash,
        })
      );
    });

    it('should distinguish between same-batch and cross-batch duplicates', async () => {
      const stats = detector.createStats();

      // First email: not duplicate, add to batch
      const result1 = await detector.checkDuplicate(sampleEmail1, stats);
      expect(result1.is_duplicate).toBe(false);

      // Second email (same hash): same-batch duplicate
      const result2 = await detector.checkDuplicate(duplicateEmail1, stats);
      expect(result2.is_same_batch).toBe(true);
      expect(result2.is_cross_batch).toBe(false);

      // Now test cross-batch with different email
      const existingRecord = {
        email_hash: sampleEmail2.email_hash,
        processed_at: 1706342400,
        last_seen_at: 1706342400,
        report_date: '2026-01-27',
        attachments_meta: '[]',
        extract_status: ExtractStatus.SUCCESS,
      };

      mockFindByHash.mockReturnValue(existingRecord);
      mockUpdateLastSeen.mockReturnValue(existingRecord);

      const result3 = await detector.checkDuplicate(sampleEmail2, stats);
      expect(result3.is_same_batch).toBe(false);
      expect(result3.is_cross_batch).toBe(true);
    });
  });

  describe('Audit Logging', () => {
    it('should log same-batch duplicate detection', async () => {
      const stats = detector.createStats();

      await detector.checkDuplicate(sampleEmail1, stats);
      await detector.checkDuplicate(duplicateEmail1, stats);

      expect(logger.debug).toHaveBeenCalledWith(
        'DuplicateDetector',
        'Same-batch duplicate detected',
        expect.objectContaining({
          email_hash: sampleEmail1.email_hash,
          message_id: sampleEmail1.message_id,
          from: sampleEmail1.from,
          subject: sampleEmail1.subject,
        })
      );
    });

    it('should log cross-batch duplicate detection', async () => {
      const existingRecord = {
        email_hash: sampleEmail1.email_hash,
        processed_at: 1706342400,
        last_seen_at: 1706342400,
        report_date: '2026-01-27',
        attachments_meta: '[]',
        extract_status: ExtractStatus.SUCCESS,
      };

      mockFindByHash.mockReturnValue(existingRecord);
      mockUpdateLastSeen.mockReturnValue(existingRecord);

      const stats = detector.createStats();
      await detector.checkDuplicate(sampleEmail1, stats);

      expect(logger.debug).toHaveBeenCalledWith(
        'DuplicateDetector',
        'Cross-batch duplicate detected',
        expect.objectContaining({
          email_hash: sampleEmail1.email_hash,
          existing_processed_at: existingRecord.processed_at,
          existing_last_seen_at: existingRecord.last_seen_at,
        })
      );
    });

    it('should log batch summary with duplicate counts', async () => {
      const stats = detector.createStats();

      // Add some duplicates
      stats.same_batch_count = 3;
      stats.cross_batch_count = 2;

      detector.logSummary(stats, 10);

      expect(logger.info).toHaveBeenCalledWith(
        'DuplicateDetector',
        '跳过3封重复邮件',
        expect.objectContaining({
          same_batch_count: 3,
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        'DuplicateDetector',
        '跳过2封已处理邮件',
        expect.objectContaining({
          cross_batch_count: 2,
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        'DuplicateDetector',
        'Duplicate detection summary',
        expect.objectContaining({
          total_duplicates: 5,
          same_batch_count: 3,
          cross_batch_count: 2,
          total_emails: 10,
          unique_emails: 7,
        })
      );
    });

    it('should not log summary when no duplicates found', async () => {
      const stats = detector.createStats();
      stats.same_batch_count = 0;
      stats.cross_batch_count = 0;

      detector.logSummary(stats, 5);

      // Should not log any info messages
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('Batch Processing', () => {
    it('should process batch and separate duplicates from unique emails', async () => {
      const emails: ParsedEmail[] = [sampleEmail1, sampleEmail2, duplicateEmail1];

      const result = await detector.batchCheckDuplicates(emails);

      expect(result.unique).toHaveLength(2);
      expect(result.duplicates).toHaveLength(1);
      expect(result.stats.same_batch_count).toBe(1);
      expect(result.stats.cross_batch_count).toBe(0);
    });

    it('should include cross-batch duplicates in batch results', async () => {
      const existingRecord = {
        email_hash: sampleEmail2.email_hash,
        processed_at: 1706342400,
        last_seen_at: 1706342400,
        report_date: '2026-01-27',
        attachments_meta: '[]',
        extract_status: ExtractStatus.SUCCESS,
      };

      // Mock to return null for sampleEmail1, existingRecord for sampleEmail2
      mockFindByHash.mockImplementation((hash: string) => {
        if (hash === sampleEmail2.email_hash) {
          return existingRecord;
        }
        return null;
      });
      mockUpdateLastSeen.mockReturnValue(existingRecord);

      const emails: ParsedEmail[] = [sampleEmail1, sampleEmail2];

      const result = await detector.batchCheckDuplicates(emails);

      expect(result.unique).toHaveLength(1);
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].result.is_cross_batch).toBe(true);
      expect(result.stats.cross_batch_count).toBe(1);
    });

    it('should log summary after batch processing', async () => {
      const emails: ParsedEmail[] = [sampleEmail1, duplicateEmail1];

      vi.clearAllMocks();

      await detector.batchCheckDuplicates(emails);

      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('Hash Validation and Fingerprint Computation', () => {
    it('should validate correct SHA-256 hash format', () => {
      const validHash = 'abc123def456789abc123def456789abc123def456789abc123def456789abc1';
      expect(DuplicateDetector.isValidEmailHash(validHash)).toBe(true);
    });

    it('should reject invalid hash formats', () => {
      expect(DuplicateDetector.isValidEmailHash('too-short')).toBe(false);
      expect(DuplicateDetector.isValidEmailHash('g'.repeat(64))).toBe(false); // Invalid hex char
      expect(DuplicateDetector.isValidEmailHash('')).toBe(false);
      expect(DuplicateDetector.isValidEmailHash('abc123')).toBe(false);
    });

    it('should compute consistent SHA-256 fingerprint', () => {
      const fingerprint1 = DuplicateDetector.computeFingerprint(
        '<test@example.com>',
        '2026-01-27T10:00:00.000Z',
        'sender@example.com'
      );

      const fingerprint2 = DuplicateDetector.computeFingerprint(
        '<test@example.com>',
        '2026-01-27T10:00:00.000Z',
        'sender@example.com'
      );

      expect(fingerprint1).toBe(fingerprint2);
      expect(fingerprint1.length).toBe(64); // SHA-256 = 64 hex chars
    });

    it('should compute different fingerprints for different inputs', () => {
      const fingerprint1 = DuplicateDetector.computeFingerprint(
        '<test1@example.com>',
        '2026-01-27T10:00:00.000Z',
        'sender@example.com'
      );

      const fingerprint2 = DuplicateDetector.computeFingerprint(
        '<test2@example.com>',
        '2026-01-27T10:00:00.000Z',
        'sender@example.com'
      );

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should handle missing Message-ID in fingerprint computation', () => {
      const fingerprintWithId = DuplicateDetector.computeFingerprint(
        '<test@example.com>',
        '2026-01-27T10:00:00.000Z',
        'sender@example.com'
      );

      const fingerprintWithoutId = DuplicateDetector.computeFingerprint(
        undefined,
        '2026-01-27T10:00:00.000Z',
        'sender@example.com'
      );

      expect(fingerprintWithId).not.toBe(fingerprintWithoutId);
    });

    it('should use fallback values for missing date and from', () => {
      const fingerprint = DuplicateDetector.computeFingerprint(
        undefined,
        '',
        ''
      );

      // Should still produce valid SHA-256 hash
      expect(DuplicateDetector.isValidEmailHash(fingerprint)).toBe(true);
    });
  });

  describe('Statistics Management', () => {
    it('should create fresh statistics instance', () => {
      const stats1 = detector.createStats();
      const stats2 = detector.createStats();

      expect(stats1.same_batch_count).toBe(0);
      expect(stats1.cross_batch_count).toBe(0);
      expect(stats1.batch_hashes.size).toBe(0);

      // Verify instances are independent
      stats1.batch_hashes.add('test');

      expect(stats2.batch_hashes.size).toBe(0);
    });

    it('should track batch hashes correctly', async () => {
      const stats = detector.createStats();

      await detector.checkDuplicate(sampleEmail1, stats);
      await detector.checkDuplicate(sampleEmail2, stats);

      expect(stats.batch_hashes.has(sampleEmail1.email_hash)).toBe(true);
      expect(stats.batch_hashes.has(sampleEmail2.email_hash)).toBe(true);
      expect(stats.batch_hashes.size).toBe(2);
    });

    it('should not add duplicate emails to batch hashes', async () => {
      const stats = detector.createStats();

      await detector.checkDuplicate(sampleEmail1, stats);
      await detector.checkDuplicate(duplicateEmail1, stats);

      // Duplicate should not be added to batch hashes
      expect(stats.batch_hashes.has(sampleEmail1.email_hash)).toBe(true);
      expect(stats.batch_hashes.size).toBe(1);
    });
  });
});
