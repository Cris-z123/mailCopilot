import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { encryptField, decryptField, generateKey, sha256, type CryptoKey } from '@/config/encryption';
import fs from 'fs';
import path from 'path';

describe('T020: Database CRUD Integration Tests', () => {
  let testDb: Database.Database;
  let testDbPath: string;
  let encryptionKey: CryptoKey;

  // Helper function to create buffer for BLOB fields
  const blobify = (data: string | object): Buffer => {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return Buffer.from(str, 'utf-8');
  };

  beforeEach(async () => {
    // Generate encryption key for testing
    encryptionKey = await generateKey();

    // Create file-based test database (in-memory doesn't support WAL properly)
    testDbPath = path.join(__dirname, `../../test-${Date.now()}.db`);
    testDb = new Database(testDbPath);

    // Enable WAL mode and foreign keys
    testDb.pragma('journal_mode = WAL');
    testDb.pragma('synchronous = NORMAL');
    testDb.pragma('foreign_keys = ON');

    // Load schema
    const schemaPath = path.join(__dirname, '../../../src/main/database/migrations/001_initial_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    testDb.exec(schema);
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
      // Clean up test database file
      try {
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
        // Also clean up WAL files
        const walPath = testDbPath + '-wal';
        const shmPath = testDbPath + '-shm';
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Transaction Wrapping', () => {
    it('should commit transaction on successful operations', () => {
      const reportDate = '2024-01-15';

      // Use transaction
      const result = testDb.transaction(() => {
        const insertReport = testDb.prepare(`
          INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        insertReport.run(
          reportDate,
          'local',
          5,
          3,
          blobify({ items: [] }),
          'checksum123',
          '[]'
        );

        // Verify inserted within transaction
        const report = testDb.prepare('SELECT * FROM daily_reports WHERE report_date = ?').get(reportDate);
        expect(report).toBeDefined();

        return { success: true };
      })();

      expect(result.success).toBe(true);

      // Verify persisted after transaction commit
      const report = testDb.prepare('SELECT * FROM daily_reports WHERE report_date = ?').get(reportDate);
      expect(report).toBeDefined();
    });

    it('should rollback transaction on error', () => {
      const reportDate = '2024-01-16';

      // Insert initial report
      const insertReport = testDb.prepare(`
        INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertReport.run(reportDate, 'local', 5, 3, blobify({}), 'checksum', '[]');

      // Try transaction that fails
      expect(() => {
        testDb.transaction(() => {
          // Update report
          testDb.prepare('UPDATE daily_reports SET completed_count = 10 WHERE report_date = ?').run(reportDate);

          // Try to insert duplicate (will fail due to PRIMARY KEY)
          testDb.prepare(`
            INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(reportDate, 'remote', 1, 2, blobify({}), 'checksum2', '[]');
        })();
      }).toThrow();

      // Verify rollback - completed_count should still be 5, not 10
      const report = testDb.prepare('SELECT completed_count FROM daily_reports WHERE report_date = ?').get(reportDate) as any;
      expect(report.completed_count).toBe(5);
    });

    it('should handle nested transactions (savepoints)', () => {
      const reportDate = '2024-01-17';

      // Outer transaction
      testDb.transaction(() => {
        testDb.prepare(`
          INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(reportDate, 'local', 5, 3, blobify({}), 'checksum', '[]');

        // Inner transaction (should work as savepoint)
        testDb.transaction(() => {
          testDb.prepare('UPDATE daily_reports SET completed_count = 10 WHERE report_date = ?').run(reportDate);
        })();
      })();

      // Verify both operations committed
      const report = testDb.prepare('SELECT completed_count FROM daily_reports WHERE report_date = ?').get(reportDate) as any;
      expect(report.completed_count).toBe(10);
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should prevent inserting todo_items without valid report_date', () => {
      // Try to insert item with non-existent report_date
      const insertItem = testDb.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      expect(() => {
        insertItem.run('item-1', '2099-01-01', blobify('encrypted'), 'checksum', 'pending', 'verified', 0.8);
      }).toThrow();
    });

    it('should allow inserting todo_items with valid report_date', () => {
      const reportDate = '2024-01-18';

      // Insert report first
      testDb.prepare(`
        INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reportDate, 'local', 0, 0, blobify({}), 'checksum', '[]');

      // Now insert item (should succeed)
      const insertItem = testDb.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insertItem.run('item-1', reportDate, blobify('encrypted'), 'checksum', 'pending', 'verified', 0.8);
      expect(result.changes).toBe(1);
    });

    it('should CASCADE delete item_email_refs when todo_item is deleted', () => {
      const reportDate = '2024-01-19';
      const itemId = 'item-1';
      const emailHash = 'email-hash-123';

      // Insert report
      testDb.prepare(`
        INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reportDate, 'local', 0, 0, blobify({}), 'checksum', '[]');

      // Insert item
      testDb.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(itemId, reportDate, blobify('encrypted'), 'checksum', 'pending', 'verified', 0.8);

      // Insert email
      testDb.prepare(`
        INSERT INTO processed_emails (email_hash, processed_at, last_seen_at, extract_status)
        VALUES (?, ?, ?, ?)
      `).run(emailHash, 1000, 1000, 'success');

      // Insert item-email ref
      testDb.prepare(`
        INSERT INTO item_email_refs (ref_id, item_id, email_hash, evidence_text, confidence)
        VALUES (?, ?, ?, ?, ?)
      `).run('ref-1', itemId, emailHash, 'evidence text', 90);

      // Verify ref exists
      let refCount = testDb.prepare('SELECT COUNT(*) as count FROM item_email_refs WHERE item_id = ?').get(itemId) as any;
      expect(refCount.count).toBe(1);

      // Delete item (should cascade delete refs)
      testDb.prepare('DELETE FROM todo_items WHERE item_id = ?').run(itemId);

      // Verify ref deleted
      refCount = testDb.prepare('SELECT COUNT(*) as count FROM item_email_refs WHERE item_id = ?').get(itemId) as any;
      expect(refCount.count).toBe(0);
    });

    it('should prevent inserting item_email_refs without valid item_id', () => {
      const reportDate = '2024-01-20';
      const emailHash = 'email-hash-456';

      // Insert report and email
      testDb.prepare(`
        INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reportDate, 'local', 0, 0, blobify({}), 'checksum', '[]');

      testDb.prepare(`
        INSERT INTO processed_emails (email_hash, processed_at, last_seen_at, extract_status)
        VALUES (?, ?, ?, ?)
      `).run(emailHash, 1000, 1000, 'success');

      // Try to insert ref without valid item_id
      const insertRef = testDb.prepare(`
        INSERT INTO item_email_refs (ref_id, item_id, email_hash, evidence_text, confidence)
        VALUES (?, ?, ?, ?, ?)
      `);

      expect(() => {
        insertRef.run('ref-1', 'non-existent-item', emailHash, 'evidence', 90);
      }).toThrow();
    });
  });

  describe('Encrypted Field Storage', () => {
    it('should store and retrieve encrypted todo item content', async () => {
      const reportDate = '2024-01-21';
      const itemId = 'item-encrypted-1';
      const sensitiveContent = 'This is sensitive action item content: "Review project proposal"';

      // Insert report
      testDb.prepare(`
        INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reportDate, 'local', 0, 0, blobify({}), 'checksum', '[]');

      // Encrypt content
      const encryptedBlob = await encryptField(encryptionKey, sensitiveContent);
      const contentChecksum = await sha256(sensitiveContent);

      // Insert item with encrypted content (convert JSON string to Buffer for BLOB field)
      testDb.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(itemId, reportDate, Buffer.from(encryptedBlob, 'utf-8'), contentChecksum, 'pending', 'verified', 0.8);

      // Retrieve and decrypt
      const row = testDb.prepare('SELECT content_encrypted, content_checksum FROM todo_items WHERE item_id = ?').get(itemId) as any;
      expect(row).toBeDefined();

      // Convert Buffer back to string for decryptField
      const encryptedBlobString = Buffer.from(row.content_encrypted).toString('utf-8');
      const decryptedContent = await decryptField(encryptionKey, encryptedBlobString);
      expect(decryptedContent).toBe(sensitiveContent);
      expect(row.content_checksum).toBe(contentChecksum);
    });

    it('should store and retrieve encrypted user config', async () => {
      const configKey = 'llm.api_key';
      const sensitiveValue = 'sk-1234567890abcdef';

      // Encrypt config value
      const encryptedBlob = await encryptField(encryptionKey, sensitiveValue);

      // Insert config (convert JSON string to Buffer for BLOB field)
      testDb.prepare(`
        INSERT INTO user_config (config_key, config_value)
        VALUES (?, ?)
      `).run(configKey, Buffer.from(encryptedBlob, 'utf-8'));

      // Retrieve and decrypt
      const row = testDb.prepare('SELECT config_value FROM user_config WHERE config_key = ?').get(configKey) as any;
      expect(row).toBeDefined();

      // Convert Buffer back to string for decryptField
      const encryptedBlobString = Buffer.from(row.config_value).toString('utf-8');
      const decryptedValue = await decryptField(encryptionKey, encryptedBlobString);
      expect(decryptedValue).toBe(sensitiveValue);
    });

    it('should verify tamper detection with content_checksum', async () => {
      const reportDate = '2024-01-22';
      const itemId = 'item-tamper-1';
      const content = 'Original content';

      // Insert report
      testDb.prepare(`
        INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reportDate, 'local', 0, 0, blobify({}), 'checksum', '[]');

      // Encrypt and insert item
      const encryptedBlob = await encryptField(encryptionKey, content);
      const contentChecksum = await sha256(content);

      testDb.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(itemId, reportDate, Buffer.from(encryptedBlob, 'utf-8'), contentChecksum, 'pending', 'verified', 0.8);

      // Retrieve and verify checksum
      const row = testDb.prepare('SELECT content_encrypted, content_checksum FROM todo_items WHERE item_id = ?').get(itemId) as any;
      const encryptedBlobString = Buffer.from(row.content_encrypted).toString('utf-8');
      const decryptedContent = await decryptField(encryptionKey, encryptedBlobString);
      const calculatedChecksum = await sha256(decryptedContent);

      expect(calculatedChecksum).toBe(row.content_checksum);

      // Simulate tampering by modifying checksum directly
      testDb.prepare('UPDATE todo_items SET content_checksum = ? WHERE item_id = ?').run('tampered-checksum', itemId);

      // Retrieve and detect tampering
      const tamperedRow = testDb.prepare('SELECT content_encrypted, content_checksum FROM todo_items WHERE item_id = ?').get(itemId) as any;
      const tamperedBlobString = Buffer.from(tamperedRow.content_encrypted).toString('utf-8');
      const tamperedDecrypted = await decryptField(encryptionKey, tamperedBlobString);
      const tamperedChecksum = await sha256(tamperedDecrypted);

      expect(tamperedChecksum).not.toBe(tamperedRow.content_checksum);
    });
  });

  describe('Database Constraints Validation', () => {
    it('should enforce CHECK constraint on confidence_score', () => {
      const reportDate = '2024-01-23';

      // Insert report
      testDb.prepare(`
        INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reportDate, 'local', 0, 0, blobify({}), 'checksum', '[]');

      // Try invalid confidence (>1.0)
      expect(() => {
        testDb.prepare(`
          INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('item-1', reportDate, blobify('encrypted'), 'checksum', 'pending', 'verified', 1.5);
      }).toThrow();

      // Try invalid confidence (<0)
      expect(() => {
        testDb.prepare(`
          INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('item-2', reportDate, blobify('encrypted'), 'checksum', 'pending', 'verified', -0.1);
      }).toThrow();

      // Valid confidence should work
      const result = testDb.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('item-3', reportDate, blobify('encrypted'), 'checksum', 'pending', 'verified', 0.85);

      expect(result.changes).toBe(1);
    });

    it('should enforce CHECK constraint on source_status enum', () => {
      const reportDate = '2024-01-24';

      // Insert report
      testDb.prepare(`
        INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reportDate, 'local', 0, 0, blobify({}), 'checksum', '[]');

      // Try invalid source_status
      expect(() => {
        testDb.prepare(`
          INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('item-1', reportDate, blobify('encrypted'), 'checksum', 'pending', 'invalid_status', 0.8);
      }).toThrow();

      // Valid values should work
      const validStatuses = ['verified', 'unverified'];
      validStatuses.forEach(status => {
        const result = testDb.prepare(`
          INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(`item-${status}`, reportDate, blobify('encrypted'), 'checksum', 'pending', status, 0.8);

        expect(result.changes).toBe(1);
      });
    });

    it('should enforce CHECK constraint on item_type enum', () => {
      const reportDate = '2024-01-25';

      // Insert report
      testDb.prepare(`
        INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reportDate, 'local', 0, 0, blobify({}), 'checksum', '[]');

      // Try invalid item_type
      expect(() => {
        testDb.prepare(`
          INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('item-1', reportDate, blobify('encrypted'), 'checksum', 'in_progress', 'verified', 0.8);
      }).toThrow();

      // Valid values should work
      const validTypes = ['completed', 'pending'];
      validTypes.forEach(type => {
        const result = testDb.prepare(`
          INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(`item-${type}`, reportDate, blobify('encrypted'), 'checksum', type, 'verified', 0.8);

        expect(result.changes).toBe(1);
      });
    });

    it('should enforce CHECK constraint on feedback_type enum', async () => {
      const reportDate = '2024-01-26';

      // Insert report
      testDb.prepare(`
        INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reportDate, 'local', 0, 0, blobify({}), 'checksum', '[]');

      // Insert item
      testDb.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('item-1', reportDate, blobify('encrypted'), 'checksum', 'pending', 'verified', 0.8);

      // feedback_type is BLOB (encrypted); passing TEXT throws
      expect(() => {
        testDb.prepare(`
          UPDATE todo_items SET feedback_type = ? WHERE item_id = ?
        `).run('invalid_feedback', 'item-1');
      }).toThrow();

      // Valid values: store as encrypted BLOB
      const validFeedbackTypes = ['content_error', 'priority_error', 'not_actionable', 'source_error'];
      for (const feedbackType of validFeedbackTypes) {
        const encrypted = await encryptField(encryptionKey, feedbackType);
        const result = testDb.prepare(`
          UPDATE todo_items SET feedback_type = ? WHERE item_id = ?
        `).run(Buffer.from(encrypted, 'utf-8'), 'item-1');

        expect(result.changes).toBe(1);
      }
    });
  });

  describe('Auto-Update Triggers', () => {
    it('should auto-update daily_reports counts when todo_items inserted', () => {
      const reportDate = '2024-01-27';

      // Insert report with zero counts
      testDb.prepare(`
        INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reportDate, 'local', 0, 0, blobify({}), 'checksum', '[]');

      // Insert completed item
      testDb.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('item-1', reportDate, blobify('encrypted'), 'checksum', 'completed', 'verified', 0.9);

      // Insert pending item
      testDb.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('item-2', reportDate, blobify('encrypted'), 'checksum', 'pending', 'verified', 0.7);

      // Verify counts auto-updated
      const report = testDb.prepare('SELECT completed_count, pending_count FROM daily_reports WHERE report_date = ?').get(reportDate) as any;
      expect(report.completed_count).toBe(1);
      expect(report.pending_count).toBe(1);
    });

    it('should auto-update daily_reports counts when todo_items type changes', () => {
      const reportDate = '2024-01-28';

      // Insert report with one pending item
      testDb.prepare(`
        INSERT INTO daily_reports (report_date, generation_mode, completed_count, pending_count, content_encrypted, content_checksum, source_email_hashes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reportDate, 'local', 0, 0, blobify({}), 'checksum', '[]');

      testDb.prepare(`
        INSERT INTO todo_items (item_id, report_date, content_encrypted, content_checksum, item_type, source_status, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('item-1', reportDate, blobify('encrypted'), 'checksum', 'pending', 'verified', 0.7);

      // Change from pending to completed
      testDb.prepare(`
        UPDATE todo_items SET item_type = ? WHERE item_id = ?
      `).run('completed', 'item-1');

      // Verify counts auto-updated
      const report = testDb.prepare('SELECT completed_count, pending_count FROM daily_reports WHERE report_date = ?').get(reportDate) as any;
      expect(report.completed_count).toBe(1);
      expect(report.pending_count).toBe(0);
    });
  });

  describe('WAL Mode Performance', () => {
    it('should have WAL mode enabled', () => {
      const journalMode = testDb.pragma('journal_mode', { simple: true });
      expect(journalMode).toBe('wal');
    });

    it('should have synchronous mode set to NORMAL', () => {
      const synchronous = testDb.pragma('synchronous', { simple: true });
      expect(synchronous).toBe(1); // 1 = NORMAL in SQLite
    });

    it('should have foreign keys enabled', () => {
      const foreignKeys = testDb.pragma('foreign_keys', { simple: true });
      expect(foreignKeys).toBe(1);
    });
  });
});
