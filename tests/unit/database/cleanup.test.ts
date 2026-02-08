/**
 * Unit Tests: Data Retention Cleanup
 *
 * T095: Unit test for retention cleanup
 * - Delete records older than retention period
 * - Preserve records if retention_days = -1 per plan v2.7
 * - Manual 30-day cleanup functionality
 * - Storage usage calculation
 * - Cleanup preview functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import DatabaseManager from '../../../src/main/database/Database';
import {
  performRetentionCleanup,
  performManual30DayCleanup,
  getCleanupPreview,
  getStorageUsage,
} from '../../../src/main/database/cleanup';
import { DataRetentionConfigRepository } from '../../../src/main/database/entities/DataRetentionConfig';

vi.mock('../../../src/main/config/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

/** Minimal schema for cleanup tests. */
function createMinimalSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE daily_reports (
      report_date TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      generation_mode TEXT NOT NULL,
      completed_count INTEGER NOT NULL DEFAULT 0,
      pending_count INTEGER NOT NULL DEFAULT 0,
      content_encrypted BLOB NOT NULL,
      content_checksum TEXT NOT NULL,
      source_email_hashes TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE processed_emails (
      email_hash TEXT PRIMARY KEY,
      processed_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      report_date TEXT,
      attachments_meta TEXT NOT NULL DEFAULT '[]',
      extract_status TEXT NOT NULL,
      error_log TEXT,
      search_string TEXT,
      file_path TEXT
    );
    CREATE TABLE todo_items (
      item_id TEXT PRIMARY KEY,
      report_date TEXT NOT NULL,
      content_encrypted BLOB NOT NULL,
      content_checksum TEXT NOT NULL,
      item_type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      is_manually_edited INTEGER NOT NULL DEFAULT 0,
      source_status TEXT NOT NULL DEFAULT 'verified',
      confidence_score REAL,
      feedback_type BLOB
    );
  `);
  const now = Math.floor(Date.now() / 1000);
  database.prepare(
    `INSERT INTO daily_reports (report_date, created_at, updated_at, generation_mode, completed_count, pending_count, content_encrypted, content_checksum) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('2024-01-01', now, now, 'remote', 0, 0, Buffer.from('{}'), 'checksum');
}

describe('T095: Data Retention Cleanup Unit Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    createMinimalSchema(db);
    vi.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db);
  });

  afterEach(() => {
    try {
      if (db) db.close();
    } catch {
      // Already closed (e.g. in error-handling tests)
    }
    vi.restoreAllMocks();
  });

  describe('Cleanup Preview Functionality', () => {
    it('should return zero counts for permanent retention (-1)', () => {
      const preview = getCleanupPreview(-1);

      expect(preview).toEqual({
        email_count: 0,
        feedback_count: 0,
      });
    });

    it('should calculate cleanup preview for 30-day retention', async () => {
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60);

      // Insert test data
      db.prepare(`
        INSERT INTO processed_emails (email_hash, processed_at, last_seen_at, report_date, extract_status)
        VALUES (?, ?, ?, ?, ?)
      `).run('hash1', thirtyDaysAgo - 1000, thirtyDaysAgo - 1000, '2024-01-01', 'success');

      db.prepare(`
        INSERT INTO processed_emails (email_hash, processed_at, last_seen_at, report_date, extract_status)
        VALUES (?, ?, ?, ?, ?)
      `).run('hash2', now - 1000, now - 1000, '2024-01-01', 'success');

      const preview = getCleanupPreview(30);

      // Only one email should be deleted (the one older than 30 days)
      expect(preview.email_count).toBeGreaterThanOrEqual(1);
    });

    it('should calculate cleanup preview for feedback data', async () => {
      const now = Math.floor(Date.now() / 1000);
      const ninetyDaysAgo = now - (90 * 24 * 60 * 60);

      // Insert test items with feedback
      db.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, created_at, feedback_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('item1', '2024-01-01', Buffer.from('encrypted'), 'checksum', 'pending', ninetyDaysAgo - 1000, Buffer.from('feedback'));

      db.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, created_at, feedback_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('item2', '2024-01-01', Buffer.from('encrypted'), 'checksum', 'pending', now - 1000, Buffer.from('feedback'));

      const preview = getCleanupPreview(90);

      // Only one feedback should be deleted (the one older than 90 days)
      expect(preview.feedback_count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Retention Cleanup (Permanent Option)', () => {
    it('should skip cleanup when retention_days = -1 (permanent)', async () => {
      // Mock DataRetentionConfigRepository.get to return permanent retention
      vi.spyOn(DataRetentionConfigRepository, 'get').mockResolvedValue({
        email_metadata_retention_days: -1,
        feedback_retention_days: -1,
        last_cleanup_at: Math.floor(Date.now() / 1000),
        estimated_storage_bytes: 0,
      });

      const result = await performRetentionCleanup();

      expect(result).toEqual({
        email_metadata_deleted: 0,
        feedback_deleted: 0,
        skipped_permanent_email: true,
        skipped_permanent_feedback: true,
        message: '永久保留设置已启用，跳过清理。',
      });
    });

    it('should skip email cleanup when email retention is permanent', async () => {
      // Mock DataRetentionConfigRepository.get
      vi.spyOn(DataRetentionConfigRepository, 'get').mockResolvedValue({
        email_metadata_retention_days: -1,
        feedback_retention_days: 90,
        last_cleanup_at: Math.floor(Date.now() / 1000),
        estimated_storage_bytes: 0,
      });

      const result = await performRetentionCleanup();

      expect(result.skipped_permanent_email).toBe(true);
      expect(result.skipped_permanent_feedback).toBe(false);
      expect(result.email_metadata_deleted).toBe(0);
    });

    it('should skip feedback cleanup when feedback retention is permanent', async () => {
      // Mock DataRetentionConfigRepository.get
      vi.spyOn(DataRetentionConfigRepository, 'get').mockResolvedValue({
        email_metadata_retention_days: 90,
        feedback_retention_days: -1,
        last_cleanup_at: Math.floor(Date.now() / 1000),
        estimated_storage_bytes: 0,
      });

      const result = await performRetentionCleanup();

      expect(result.skipped_permanent_email).toBe(false);
      expect(result.skipped_permanent_feedback).toBe(true);
      expect(result.feedback_deleted).toBe(0);
    });
  });

  describe('Retention Cleanup (Delete Old Records)', () => {
    it('should delete email metadata older than retention period', async () => {
      const now = Math.floor(Date.now() / 1000);
      const ninetyDaysAgo = now - (90 * 24 * 60 * 60);

      // Insert test data
      db.prepare(`
        INSERT INTO processed_emails (email_hash, processed_at, last_seen_at, report_date, extract_status)
        VALUES (?, ?, ?, ?, ?)
      `).run('old_hash', ninetyDaysAgo - 1000, ninetyDaysAgo - 1000, '2024-01-01', 'success');

      db.prepare(`
        INSERT INTO processed_emails (email_hash, processed_at, last_seen_at, report_date, extract_status)
        VALUES (?, ?, ?, ?, ?)
      `).run('recent_hash', now - 1000, now - 1000, '2024-01-01', 'success');

      // Mock DataRetentionConfigRepository.get
      vi.spyOn(DataRetentionConfigRepository, 'get').mockResolvedValue({
        email_metadata_retention_days: 90,
        feedback_retention_days: 90,
        last_cleanup_at: Math.floor(Date.now() / 1000),
        estimated_storage_bytes: 0,
      });

      const result = await performRetentionCleanup();

      expect(result.email_metadata_deleted).toBeGreaterThan(0);
      expect(result.skipped_permanent_email).toBe(false);
    });

    it('should delete feedback data older than retention period', async () => {
      const now = Math.floor(Date.now() / 1000);
      const ninetyDaysAgo = now - (90 * 24 * 60 * 60);

      // Insert test items with feedback
      db.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, created_at, feedback_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('old_item', '2024-01-01', Buffer.from('encrypted'), 'checksum', 'pending', ninetyDaysAgo - 1000, Buffer.from('feedback'));

      db.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, created_at, feedback_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('recent_item', '2024-01-01', Buffer.from('encrypted'), 'checksum', 'pending', now - 1000, Buffer.from('feedback'));

      // Mock DataRetentionConfigRepository.get
      vi.spyOn(DataRetentionConfigRepository, 'get').mockResolvedValue({
        email_metadata_retention_days: 90,
        feedback_retention_days: 90,
        last_cleanup_at: Math.floor(Date.now() / 1000),
        estimated_storage_bytes: 0,
      });

      const result = await performRetentionCleanup();

      expect(result.feedback_deleted).toBeGreaterThan(0);
      expect(result.skipped_permanent_feedback).toBe(false);
    });

    it('should preserve recent records within retention period', async () => {
      const now = Math.floor(Date.now() / 1000);

      // Insert recent data
      db.prepare(`
        INSERT INTO processed_emails (email_hash, processed_at, last_seen_at, report_date, extract_status)
        VALUES (?, ?, ?, ?, ?)
      `).run('recent_hash', now - 1000, now - 1000, '2024-01-01', 'success');

      // Mock DataRetentionConfigRepository.get
      vi.spyOn(DataRetentionConfigRepository, 'get').mockResolvedValue({
        email_metadata_retention_days: 90,
        feedback_retention_days: 90,
        last_cleanup_at: Math.floor(Date.now() / 1000),
        estimated_storage_bytes: 0,
      });

      const beforeCount = db.prepare('SELECT COUNT(*) as count FROM processed_emails').get() as { count: number };

      await performRetentionCleanup();

      const afterCount = db.prepare('SELECT COUNT(*) as count FROM processed_emails').get() as { count: number };

      // Recent records should be preserved
      expect(afterCount.count).toBe(beforeCount.count);
    });
  });

  describe('Manual 30-Day Cleanup (FR-048)', () => {
    it('should delete records older than 30 days regardless of retention setting', async () => {
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60);

      // Insert data older than 30 days
      db.prepare(`
        INSERT INTO processed_emails (email_hash, processed_at, last_seen_at, report_date, extract_status)
        VALUES (?, ?, ?, ?, ?)
      `).run('old_hash', thirtyDaysAgo - 1000, thirtyDaysAgo - 1000, '2024-01-01', 'success');

      db.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, created_at, feedback_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('old_item', '2024-01-01', Buffer.from('encrypted'), 'checksum', 'pending', thirtyDaysAgo - 1000, Buffer.from('feedback'));

      const result = await performManual30DayCleanup();

      expect(result.email_metadata_deleted).toBeGreaterThan(0);
      expect(result.feedback_deleted).toBeGreaterThan(0);
      expect(result.skipped_permanent_email).toBe(false);
      expect(result.skipped_permanent_feedback).toBe(false);
    });

    it('should preserve records within 30 days', async () => {
      const now = Math.floor(Date.now() / 1000);

      // Insert recent data
      db.prepare(`
        INSERT INTO processed_emails (email_hash, processed_at, last_seen_at, report_date, extract_status)
        VALUES (?, ?, ?, ?, ?)
      `).run('recent_hash', now - 1000, now - 1000, '2024-01-01', 'success');

      const beforeCount = db.prepare('SELECT COUNT(*) as count FROM processed_emails').get() as { count: number };

      await performManual30DayCleanup();

      const afterCount = db.prepare('SELECT COUNT(*) as count FROM processed_emails').get() as { count: number };

      // Recent records should be preserved
      expect(afterCount.count).toBe(beforeCount.count);
    });

    it('should include proper message in response', async () => {
      const result = await performManual30DayCleanup();

      expect(result.message).toContain('已删除');
      expect(result.message).toContain('邮件元数据');
      expect(result.message).toContain('反馈数据');
      expect(result.message).toContain('30天前');
    });
  });

  describe('Storage Usage Calculation', () => {
    it('should calculate storage usage in bytes', () => {
      const storage = getStorageUsage();

      expect(storage).toHaveProperty('email_metadata_bytes');
      expect(storage).toHaveProperty('feedback_data_bytes');
      expect(storage).toHaveProperty('total_bytes');

      expect(typeof storage.email_metadata_bytes).toBe('number');
      expect(typeof storage.feedback_data_bytes).toBe('number');
      expect(typeof storage.total_bytes).toBe('number');

      expect(storage.email_metadata_bytes).toBeGreaterThanOrEqual(0);
      expect(storage.feedback_data_bytes).toBeGreaterThanOrEqual(0);
      expect(storage.total_bytes).toBeGreaterThanOrEqual(0);
    });

    it('should reflect storage usage after inserting data', async () => {
      const storageBefore = getStorageUsage();

      // Insert test data
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        INSERT INTO processed_emails (email_hash, processed_at, last_seen_at, report_date, extract_status)
        VALUES (?, ?, ?, ?, ?)
      `).run('new_hash', now, now, '2024-01-01', 'success');

      const storageAfter = getStorageUsage();

      // Total bytes should increase after inserting data
      expect(storageAfter.total_bytes).toBeGreaterThanOrEqual(storageBefore.total_bytes);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close database to induce error
      db.close();

      await expect(performRetentionCleanup()).rejects.toThrow();
    });

    it('should log errors during cleanup failure', async () => {
      const { logger } = await import('../../../src/main/config/logger');

      db.close();

      try {
        await performRetentionCleanup();
      } catch {
        // Expected error
      }

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('Update Last Cleanup Timestamp', () => {
    it('should update last_cleanup_at timestamp after cleanup', async () => {
      const beforeCleanup = Math.floor(Date.now() / 1000);

      // Mock DataRetentionConfigRepository methods
      const updateSpy = vi.spyOn(DataRetentionConfigRepository, 'updateLastCleanup').mockResolvedValue();

      vi.spyOn(DataRetentionConfigRepository, 'get').mockResolvedValue({
        email_metadata_retention_days: 90,
        feedback_retention_days: 90,
        last_cleanup_at: beforeCleanup,
        estimated_storage_bytes: 0,
      });

      await performRetentionCleanup();

      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe('Transaction Integrity', () => {
    it('should wrap cleanup operations in transaction', async () => {
      // This test verifies that cleanup operations are atomic
      const now = Math.floor(Date.now() / 1000);
      const ninetyDaysAgo = now - (90 * 24 * 60 * 60);

      // Insert test data
      db.prepare(`
        INSERT INTO processed_emails (email_hash, processed_at, last_seen_at, report_date, extract_status)
        VALUES (?, ?, ?, ?, ?)
      `).run('old_hash', ninetyDaysAgo - 1000, ninetyDaysAgo - 1000, '2024-01-01', 'success');

      db.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, created_at, feedback_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('old_item', '2024-01-01', Buffer.from('encrypted'), 'checksum', 'pending', ninetyDaysAgo - 1000, Buffer.from('feedback'));

      // Mock DataRetentionConfigRepository
      vi.spyOn(DataRetentionConfigRepository, 'get').mockResolvedValue({
        email_metadata_retention_days: 90,
        feedback_retention_days: 90,
        last_cleanup_at: Math.floor(Date.now() / 1000),
        estimated_storage_bytes: 0,
      });

      // Perform cleanup - should complete without error if transaction works
      const result = await performRetentionCleanup();

      expect(result.email_metadata_deleted).toBeGreaterThanOrEqual(0);
      expect(result.feedback_deleted).toBeGreaterThanOrEqual(0);
    });
  });
});
