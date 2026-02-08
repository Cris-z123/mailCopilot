/**
 * Performance Test: 50-Email Batch Processing
 *
 * Per T114: Load test for 50-email batch processing
 *
 * Tests batch processing performance to verify targets per plan.md:
 * - Remote mode: ~18s for 50 emails
 * - Local mode: ~35s for 50 emails
 * - Per SC-015: Local LLM processing ≤2s per email (50 emails × 2s = ~100s theoretical, but optimized for parallel)
 * - Per FR-057: Maximum batch size 50 emails
 *
 * Performance Goals (from plan.md):
 * - Batch processing: ~35s for 50 emails (local 7B) / ~18s (remote)
 * - Email metadata extraction: ≤100ms per email
 * - Local LLM processing: ≤2s per email (Ollama 7B)
 *
 * Test approach:
 * 1. Generate sample batch of 50 emails
 * 2. Process batch in remote mode (mock LLM API)
 * 3. Process batch in local mode (mock Ollama API)
 * 4. Measure total processing time
 * 5. Verify performance targets met
 * 6. Verify batch size limits enforced
 *
 * @module tests/integration/performance/batch-processing.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EmailProcessor } from '@/email/EmailProcessor';
import { ParserFactory } from '@/email/parsers/ParserFactory';
import { EmailSourceRepository } from '@/database/entities/EmailSource';
import { ActionItemRepository } from '@/database/entities/ActionItem';
import { generateKey } from '@/config/encryption';
import type { CryptoKey } from '@/config/encryption';
import type { LLMAdapter } from '@/llm/LLMAdapter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, '.temp', 'batch-perf-test.db');

/**
 * Performance targets from plan.md
 */
const PERFORMANCE_TARGETS = {
  /** Remote mode target for 50 emails */
  REMOTE_MODE_TARGET_MS: 18000, // ~18s

  /** Local mode target for 50 emails */
  LOCAL_MODE_TARGET_MS: 35000, // ~35s

  /** Maximum batch size per FR-057 */
  MAX_BATCH_SIZE: 50,

  /** Email metadata extraction per SC-014 */
  EMAIL_EXTRACTION_MAX_MS: 100,

  /** LLM processing per SC-015 */
  LLM_PROCESSING_MAX_MS: 2000,
};

/**
 * Generate sample .eml content with varying complexity
 */
function generateEmailContent(index: number): string {
  const senders = ['alice@example.com', 'bob@example.com', 'charlie@example.com', 'david@example.com'];
  const subjects = [
    'Project Update',
    'Task Assignment',
    'Meeting Request',
    'Deadline Reminder',
    'Status Report',
  ];
  const actionVerbs = ['complete', 'submit', 'review', 'schedule', 'update', 'prepare', 'finalize'];

  const sender = senders[index % senders.length];
  const subject = subjects[index % subjects.length];
  const action = actionVerbs[index % actionVerbs.length];
  const date = new Date(Date.now() + index * 60000); // 1 minute apart

  return `From: ${sender}
To: team@example.com
Subject: ${subject} #${index + 1}
Date: ${date.toISOString()}
Message-ID: <test-email-${index}@example.com>
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

Hi Team,

Please ${action} the following task by end of day:

- Review the attached documentation
- Update the project timeline
- Confirm receipt of this email

Task #${index + 1} requires immediate attention.

Best regards,
${sender.split('@')[0].charAt(0).toUpperCase() + sender.split('@')[0].slice(1)}
`;
}

/**
 * Create test batch of email files
 */
function createEmailBatch(count: number, tempDir: string): string[] {
  const emailFiles: string[] = [];

  for (let i = 0; i < count; i++) {
    const emailPath = path.join(tempDir, `email-${i.toString().padStart(3, '0')}.eml`);
    fs.writeFileSync(emailPath, generateEmailContent(i));
    emailFiles.push(emailPath);
  }

  return emailFiles;
}

/**
 * Create test database with schema
 */
function setupTestDatabase(): Database.Database {
  const testDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const db = new Database(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -64000'); // 64MB cache

  // Create tables
  const schemaPath = path.join(__dirname, '../../../src/main/database/migrations/001_initial_schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  return db;
}

/**
 * Cleanup test database and temporary files
 */
function cleanupTestDatabase(db: Database.Database, tempDir: string) {
  if (db) {
    db.close();
  }

  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const walPath = `${TEST_DB_PATH}-wal`;
  const shmPath = `${TEST_DB_PATH}-shm`;

  if (fs.existsSync(walPath)) {
    fs.unlinkSync(walPath);
  }

  if (fs.existsSync(shmPath)) {
    fs.unlinkSync(shmPath);
  }

  // Clean up temp email files
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Mock LLM adapter that simulates API latency
 */
function createMockLLMAdapter(latencyMs: number = 50): LLMAdapter {
  return {
    async generate(batch) {
      // Simulate network/processing latency
      await new Promise(resolve => setTimeout(resolve, latencyMs));

      // Generate mock items for each email
      const items = batch.emails.flatMap(email => [
        {
          content: `Complete task from ${email.from}`,
          item_type: 'pending' as const,
          evidence: 'Clear action verb and deadline',
        },
        {
          content: `Review documentation for ${email.subject}`,
          item_type: 'pending' as const,
          evidence: 'Specific task with context',
        },
      ]);

      return { items };
    },

    async checkHealth() {
      return {
        available: true,
        model: latencyMs < 100 ? 'gpt-4' : 'ollama-7b',
        endpoint: latencyMs < 100 ? 'https://api.openai.com' : 'http://localhost:11434',
      };
    },

    getConfig() {
      return {
        mode: latencyMs < 100 ? 'remote' : 'local',
        endpoint: latencyMs < 100 ? 'https://api.openai.com' : 'http://localhost:11434',
        model: latencyMs < 100 ? 'gpt-4' : 'ollama-7b',
        maxRetries: 2,
        timeout: 30000,
      };
    },

    async updateConfig(config) {
      return { success: true };
    },
  };
}

describe('T114: Batch Processing Performance Tests', () => {
  let db: Database.Database;
  let encryptionKey: CryptoKey;
  let tempDir: string;

  beforeAll(async () => {
    db = setupTestDatabase();
    encryptionKey = await generateKey();
    tempDir = path.join(__dirname, '.temp', 'batch-emails');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    cleanupTestDatabase(db, tempDir);
  });

  beforeEach(() => {
    // Clear database tables before each test
    db.exec('DELETE FROM item_email_refs');
    db.exec('DELETE FROM todo_items');
    db.exec('DELETE FROM processed_emails');
  });

  describe('Batch Size Limits', () => {
    it('should enforce maximum batch size of 50 emails per FR-057', async () => {
      // Create batch exceeding limit (60 emails)
      const emailFiles = createEmailBatch(60, tempDir);

      const llmAdapter = createMockLLMAdapter(50);
      const processor = new EmailProcessor(llmAdapter, db, encryptionKey, {
        maxBatchSize: PERFORMANCE_TARGETS.MAX_BATCH_SIZE,
      });

      // Attempt to process batch exceeding limit
      const result = await processor.processBatch(
        emailFiles,
        '2026-01-27',
        'remote'
      );

      // Verify batch was limited to 50 emails
      expect(result.batch_info.total_emails).toBe(60);
      expect(result.batch_info.processed_emails).toBeLessThanOrEqual(PERFORMANCE_TARGETS.MAX_BATCH_SIZE);
      expect(result.batch_info.skipped_emails).toBeGreaterThan(0);
    });

    it('should process exactly 50 emails in maximum batch', async () => {
      const emailFiles = createEmailBatch(50, tempDir);

      const llmAdapter = createMockLLMAdapter(50);
      const processor = new EmailProcessor(llmAdapter, db, encryptionKey, {
        maxBatchSize: 50,
      });

      const result = await processor.processBatch(
        emailFiles,
        '2026-01-27',
        'remote'
      );

      expect(result.batch_info.total_emails).toBe(50);
      expect(result.batch_info.processed_emails).toBe(50);
      expect(result.batch_info.skipped_emails).toBe(0);
      expect(result.success).toBe(true);
    });
  });

  describe('Remote Mode Performance', () => {
    it('should process 50 emails in ~18s (remote mode with low latency)', async () => {
      const emailFiles = createEmailBatch(50, tempDir);

      // Mock remote LLM adapter with low latency (simulates fast API)
      const llmAdapter = createMockLLMAdapter(50); // 50ms per batch = ~2.5s total LLM time
      const processor = new EmailProcessor(llmAdapter, db, encryptionKey, {
        maxBatchSize: 50,
      });

      // Measure processing time
      const startTime = Date.now();
      const result = await processor.processBatch(
        emailFiles,
        '2026-01-27',
        'remote'
      );
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Verify all emails processed
      expect(result.success).toBe(true);
      expect(result.batch_info.processed_emails).toBe(50);

      // Verify performance target (remote mode: ~18s)
      // Note: In test environment, this should be much faster
      // In production, this includes network latency to LLM API
      expect(processingTime).toBeLessThan(PERFORMANCE_TARGETS.REMOTE_MODE_TARGET_MS * 2); // 2x tolerance for test environment

      // Log actual performance for analysis
      console.log(`[Performance] Remote mode 50-email batch: ${processingTime}ms (target: ${PERFORMANCE_TARGETS.REMOTE_MODE_TARGET_MS}ms)`);
      console.log(`[Performance] Per-email average: ${(processingTime / 50).toFixed(2)}ms`);
    });

    it('should maintain consistent performance across multiple batches', async () => {
      const batchSizes = [10, 25, 50];
      const processingTimes: number[] = [];

      for (const size of batchSizes) {
        // Create batch
        const batchDir = path.join(tempDir, `batch-${size}`);
        if (!fs.existsSync(batchDir)) {
          fs.mkdirSync(batchDir, { recursive: true });
        }
        const emailFiles = createEmailBatch(size, batchDir);

        // Clear database
        db.exec('DELETE FROM item_email_refs');
        db.exec('DELETE FROM todo_items');
        db.exec('DELETE FROM processed_emails');

        // Process batch
        const llmAdapter = createMockLLMAdapter(50);
        const processor = new EmailProcessor(llmAdapter, db, encryptionKey, {
          maxBatchSize: 50,
        });

        const startTime = Date.now();
        const result = await processor.processBatch(
          emailFiles,
          '2026-01-27',
          'remote'
        );
        const endTime = Date.now();

        expect(result.success).toBe(true);
        expect(result.batch_info.processed_emails).toBe(size);

        const batchTime = endTime - startTime;
        processingTimes.push(batchTime);

        console.log(`[Performance] Batch size ${size}: ${batchTime}ms (${(batchTime / size).toFixed(2)}ms per email)`);
      }

      // Verify processing time scales roughly linearly with batch size
      // (allowing for some overhead variance)
      const timePerEmail10 = processingTimes[0] / 10;
      const timePerEmail50 = processingTimes[2] / 50;

      // Per-email time should be consistent (within 2x variance)
      expect(timePerEmail50).toBeLessThan(timePerEmail10 * 2);
    });
  });

  describe('Local Mode Performance', () => {
    it('should process 50 emails in ~35s (local mode with higher latency)', async () => {
      const emailFiles = createEmailBatch(50, tempDir);

      // Mock local LLM adapter with higher latency (simulates Ollama)
      const llmAdapter = createMockLLMAdapter(200); // 200ms per batch = ~10s total LLM time
      const processor = new EmailProcessor(llmAdapter, db, encryptionKey, {
        maxBatchSize: 50,
      });

      // Measure processing time
      const startTime = Date.now();
      const result = await processor.processBatch(
        emailFiles,
        '2026-01-27',
        'local'
      );
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Verify all emails processed
      expect(result.success).toBe(true);
      expect(result.batch_info.processed_emails).toBe(50);

      // Verify performance target (local mode: ~35s)
      // Note: Test environment should be faster than production Ollama
      expect(processingTime).toBeLessThan(PERFORMANCE_TARGETS.LOCAL_MODE_TARGET_MS * 2); // 2x tolerance for test environment

      // Log actual performance for analysis
      console.log(`[Performance] Local mode 50-email batch: ${processingTime}ms (target: ${PERFORMANCE_TARGETS.LOCAL_MODE_TARGET_MS}ms)`);
      console.log(`[Performance] Per-email average: ${(processingTime / 50).toFixed(2)}ms`);
    });

    it('should handle Ollama unavailability gracefully', async () => {
      const emailFiles = createEmailBatch(10, tempDir);

      // Mock unavailable Ollama service
      const unavailableLLM: LLMAdapter = {
        async generate() {
          throw new Error('Ollama service unavailable');
        },
        async checkHealth() {
          return {
            available: false,
            model: 'ollama-7b',
            endpoint: 'http://localhost:11434',
          };
        },
        getConfig() {
          return {
            mode: 'local',
            endpoint: 'http://localhost:11434',
            model: 'ollama-7b',
            maxRetries: 2,
            timeout: 30000,
          };
        },
        async updateConfig() {
          return { success: true };
        },
      };

      const processor = new EmailProcessor(unavailableLLM, db, encryptionKey, {
        maxBatchSize: 50,
      });

      // Attempt to process batch
      const result = await processor.processBatch(
        emailFiles,
        '2026-01-27',
        'local'
      );

      // Verify failure handled gracefully per FR-036
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('unavailable');
    });
  });

  describe('Email Metadata Extraction Performance', () => {
    it('should extract metadata from single email within 100ms per SC-014', async () => {
      const emailFiles = createEmailBatch(1, tempDir);

      // Measure parsing time
      const startTime = Date.now();
      const parser = ParserFactory.getParser(emailFiles[0]);
      const parsedEmail = await parser.parse(emailFiles[0]);
      const endTime = Date.now();

      const extractionTime = endTime - startTime;

      // Verify extraction success
      expect(parsedEmail.extract_status).toBe('success');
      expect(parsedEmail.message_id).toBeDefined();
      expect(parsedEmail.from).toBeDefined();
      expect(parsedEmail.subject).toBeDefined();

      // Verify performance target
      expect(extractionTime).toBeLessThan(PERFORMANCE_TARGETS.EMAIL_EXTRACTION_MAX_MS);

      console.log(`[Performance] Email metadata extraction: ${extractionTime}ms (target: <${PERFORMANCE_TARGETS.EMAIL_EXTRACTION_MAX_MS}ms)`);
    });

    it('should extract metadata from 50 emails efficiently', async () => {
      const emailFiles = createEmailBatch(50, tempDir);

      // Measure total parsing time
      const startTime = Date.now();

      for (const emailFile of emailFiles) {
        const parser = ParserFactory.getParser(emailFile);
        const parsedEmail = await parser.parse(emailFile);
        expect(parsedEmail.extract_status).toBe('success');
      }

      const endTime = Date.now();
      const totalExtractionTime = endTime - startTime;
      const avgExtractionTime = totalExtractionTime / 50;

      // Verify average extraction time per email
      expect(avgExtractionTime).toBeLessThan(PERFORMANCE_TARGETS.EMAIL_EXTRACTION_MAX_MS);

      console.log(`[Performance] 50-email metadata extraction: ${totalExtractionTime}ms total (${avgExtractionTime.toFixed(2)}ms per email)`);
    });
  });

  describe('LLM Processing Performance', () => {
    it('should complete LLM processing within 2s per email per SC-015', async () => {
      const emailFiles = createEmailBatch(5, tempDir);

      // Mock LLM adapter with realistic latency
      const llmAdapter = createMockLLMAdapter(500); // 500ms per batch
      const processor = new EmailProcessor(llmAdapter, db, encryptionKey, {
        maxBatchSize: 50,
      });

      // Measure processing time
      const startTime = Date.now();
      const result = await processor.processBatch(
        emailFiles,
        '2026-01-27',
        'remote'
      );
      const endTime = Date.now();

      const processingTime = endTime - startTime;
      const avgTimePerEmail = processingTime / 5;

      // Verify LLM processing target (2s per email)
      expect(avgTimePerEmail).toBeLessThan(PERFORMANCE_TARGETS.LLM_PROCESSING_MAX_MS);

      console.log(`[Performance] LLM processing: ${avgTimePerEmail.toFixed(2)}ms per email (target: <${PERFORMANCE_TARGETS.LLM_PROCESSING_MAX_MS}ms)`);
    });
  });

  describe('Batch Processing Efficiency', () => {
    it('should process small batch (10 emails) efficiently', async () => {
      const emailFiles = createEmailBatch(10, tempDir);

      const llmAdapter = createMockLLMAdapter(50);
      const processor = new EmailProcessor(llmAdapter, db, encryptionKey, {
        maxBatchSize: 50,
      });

      const startTime = Date.now();
      const result = await processor.processBatch(
        emailFiles,
        '2026-01-27',
        'remote'
      );
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.batch_info.processed_emails).toBe(10);

      const processingTime = endTime - startTime;
      console.log(`[Performance] Small batch (10 emails): ${processingTime}ms`);
    });

    it('should process medium batch (25 emails) efficiently', async () => {
      const emailFiles = createEmailBatch(25, tempDir);

      const llmAdapter = createMockLLMAdapter(50);
      const processor = new EmailProcessor(llmAdapter, db, encryptionKey, {
        maxBatchSize: 50,
      });

      const startTime = Date.now();
      const result = await processor.processBatch(
        emailFiles,
        '2026-01-27',
        'remote'
      );
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.batch_info.processed_emails).toBe(25);

      const processingTime = endTime - startTime;
      console.log(`[Performance] Medium batch (25 emails): ${processingTime}ms`);
    });
  });

  describe('Database Performance', () => {
    it('should efficiently store 50 emails and associated items', async () => {
      const emailFiles = createEmailBatch(50, tempDir);

      const llmAdapter = createMockLLMAdapter(50);
      const processor = new EmailProcessor(llmAdapter, db, encryptionKey, {
        maxBatchSize: 50,
      });

      // Process batch
      const result = await processor.processBatch(
        emailFiles,
        '2026-01-27',
        'remote'
      );

      expect(result.success).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);

      // Measure database query time
      const startTime = Date.now();
      const allEmails = EmailSourceRepository.findAll(db);
      const allItems = ActionItemRepository.findByReportDate(db, '2026-01-27');
      const endTime = Date.now();

      const queryTime = endTime - startTime;

      // Verify data stored
      expect(allEmails.length).toBe(50);
      expect(allItems.length).toBeGreaterThan(0);

      // Verify query performance (<100ms per SC-017)
      expect(queryTime).toBeLessThan(100);

      console.log(`[Performance] Database query (50 emails, ${allItems.length} items): ${queryTime}ms`);
    });
  });
});
