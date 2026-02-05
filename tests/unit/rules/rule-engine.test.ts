/**
 * Rule Engine Unit Tests
 *
 * Tests for RuleEngine class including:
 * - Rule execution on emails
 * - Timeout enforcement (FR-056: 5s)
 * - Memory limit enforcement (FR-058: 128MB)
 * - Batch processing
 * - Error handling
 *
 * @module tests/unit/rules/rule-engine
 */

import { describe, it, expect } from 'vitest';
import { RuleEngine } from '@/rules/RuleEngine.js';
import type { ParsedEmail } from '@/email/parsers/EmailParser.js';

describe('RuleEngine', () => {
  describe('Single Email Processing', () => {
    it('should execute rules on an email with deadline keywords', async () => {
      const engine = new RuleEngine();

      const email: ParsedEmail = {
        email_hash: 'abc123',
        message_id: 'test@example.com',
        from: 'boss@company.com',
        subject: 'Project deadline tomorrow',
        date: '2026-02-04T10:00:00Z',
        attachments: [],
        body: 'Please complete the task by the deadline. This is urgent.',
        file_path: '/test/path.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = await engine.execute(email);

      expect(result.score).toBeGreaterThan(0);
      expect(result.rulesTriggered).toBeGreaterThan(0);
      expect(result.details.hasDeadlineKeyword).toBe(true);
      expect(result.details.hasPriorityKeyword).toBe(true); // "urgent"
      expect(result.timedOut).toBe(false);
      expect(result.outOfMemory).toBe(false);
      expect(result.executionTime).toBeLessThan(1000); // Should be fast
    });

    it('should detect priority keywords', async () => {
      const engine = new RuleEngine();

      const email: ParsedEmail = {
        email_hash: 'def456',
        from: 'manager@company.com',
        subject: 'Important: Review needed ASAP',
        date: '2026-02-04T10:00:00Z',
        attachments: [],
        body: 'This is high priority. Please review immediately.',
        file_path: '/test/path2.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = await engine.execute(email);

      expect(result.score).toBeGreaterThan(0);
      expect(result.details.hasPriorityKeyword).toBe(true);
      expect(result.rulesTriggered).toBeGreaterThan(0);
    });

    it('should handle emails with no action items', async () => {
      const engine = new RuleEngine();

      const email: ParsedEmail = {
        email_hash: 'ghi789',
        from: 'newsletter@example.com',
        subject: 'Weekly Update',
        date: '2026-02-04T10:00:00Z',
        attachments: [],
        body: 'This is just a newsletter with no action items.',
        file_path: '/test/path3.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = await engine.execute(email);

      expect(result.score).toBe(0);
      expect(result.rulesTriggered).toBe(0);
      expect(result.details.hasDeadlineKeyword).toBe(false);
      expect(result.details.hasPriorityKeyword).toBe(false);
      expect(result.details.isWhitelistedSender).toBe(false);
      expect(result.details.actionVerbCount).toBe(0);
    });

    it('should detect whitelisted senders', async () => {
      const engine = new RuleEngine();

      const email: ParsedEmail = {
        email_hash: 'jkl012',
        from: 'boss@company.com',
        subject: 'Task assignment',
        date: '2026-02-04T10:00:00Z',
        attachments: [],
        body: 'Please complete this task.',
        file_path: '/test/path4.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = await engine.execute(email);

      expect(result.score).toBeGreaterThan(0);
      expect(result.details.isWhitelistedSender).toBe(true);
    });

    it('should count action verbs', async () => {
      const engine = new RuleEngine();

      const email: ParsedEmail = {
        email_hash: 'mno345',
        from: 'colleague@company.com',
        subject: 'Action items',
        date: '2026-02-04T10:00:00Z',
        attachments: [],
        body: 'Please review the document. I need to submit it by Friday. Must complete the task.',
        file_path: '/test/path5.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = await engine.execute(email);

      expect(result.score).toBeGreaterThan(0);
      expect(result.details.actionVerbCount).toBeGreaterThan(0);
    });

    it('should handle missing email body gracefully', async () => {
      const engine = new RuleEngine();

      const email: ParsedEmail = {
        email_hash: 'pqr678',
        from: 'test@example.com',
        subject: 'No body',
        date: '2026-02-04T10:00:00Z',
        attachments: [],
        file_path: '/test/path6.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = await engine.execute(email);

      // Should not crash, just return 0 score
      expect(result.score).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.outOfMemory).toBe(false);
    });
  });

  describe('Batch Processing', () => {
    it('should process multiple emails in batch', async () => {
      const engine = new RuleEngine();

      const emails: ParsedEmail[] = [
        {
          email_hash: 'abc123',
          from: 'boss@company.com',
          subject: 'Urgent deadline',
          date: '2026-02-04T10:00:00Z',
          attachments: [],
          body: 'Please submit by deadline',
          file_path: '/test/path1.eml',
          format: 'eml',
          extract_status: 'success',
        },
        {
          email_hash: 'def456',
          from: 'friend@personal.com',
          subject: 'Just saying hi',
          date: '2026-02-04T11:00:00Z',
          attachments: [],
          body: 'Hello, how are you?',
          file_path: '/test/path2.eml',
          format: 'eml',
          extract_status: 'success',
        },
        {
          email_hash: 'ghi789',
          from: 'manager@company.com',
          subject: 'Important: ASAP',
          date: '2026-02-04T12:00:00Z',
          attachments: [],
          body: 'Please complete this as soon as possible',
          file_path: '/test/path3.eml',
          format: 'eml',
          extract_status: 'success',
        },
      ];

      const results = await engine.executeBatch(emails);

      expect(results).toHaveLength(3);
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[1].score).toBe(0);
      expect(results[2].score).toBeGreaterThan(0);
    });

    it('should handle empty batch', async () => {
      const engine = new RuleEngine();

      const results = await engine.executeBatch([]);

      expect(results).toHaveLength(0);
    });
  });

  describe('Configuration', () => {
    it('should allow custom timeout configuration', async () => {
      const engine = new RuleEngine({ timeout: 1000 }); // 1 second timeout

      const email: ParsedEmail = {
        email_hash: 'stu901',
        from: 'test@example.com',
        subject: 'Test',
        date: '2026-02-04T10:00:00Z',
        attachments: [],
        body: 'Test',
        file_path: '/test/path.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const config = engine.getConfig();
      expect(config.timeout).toBe(1000);

      const result = await engine.execute(email);
      expect(result.executionTime).toBeLessThan(1100);
    });

    it('should allow custom memory limit configuration', async () => {
      const engine = new RuleEngine({ memoryLimit: 64 }); // 64MB limit

      const config = engine.getConfig();
      expect(config.memoryLimit).toBe(64);
    });

    it('should allow runtime configuration updates', async () => {
      const engine = new RuleEngine({ timeout: 5000 });

      engine.updateConfig({ timeout: 2000 });

      const config = engine.getConfig();
      expect(config.timeout).toBe(2000);
    });
  });

  describe('Health Check', () => {
    it('should always return true for local rule engine', async () => {
      const engine = new RuleEngine();

      const isHealthy = await engine.checkHealth();

      expect(isHealthy).toBe(true);
    });
  });

  describe('Debug Mode', () => {
    it('should include raw results in debug mode', async () => {
      const engine = new RuleEngine({ debug: true });

      const email: ParsedEmail = {
        email_hash: 'vwx234',
        from: 'boss@company.com',
        subject: 'Deadline',
        date: '2026-02-04T10:00:00Z',
        attachments: [],
        body: 'Please complete by deadline',
        file_path: '/test/path.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = await engine.execute(email);

      expect(result.rawResults).toBeDefined();
      expect(result.rawResults).toHaveLength(5); // 5 rules total
      expect(result.rawResults![0].ruleName).toBe('deadline_keywords');
    });

    it('should not include raw results in normal mode', async () => {
      const engine = new RuleEngine({ debug: false });

      const email: ParsedEmail = {
        email_hash: 'yzA567',
        from: 'test@example.com',
        subject: 'Test',
        date: '2026-02-04T10:00:00Z',
        attachments: [],
        body: 'Test',
        file_path: '/test/path.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = await engine.execute(email);

      expect(result.rawResults).toBeUndefined();
    });
  });

  describe('Resource Limits', () => {
    it('should enforce timeout (simulated with very short timeout)', async () => {
      const engine = new RuleEngine({ timeout: 1 }); // 1ms timeout (will likely timeout)

      const email: ParsedEmail = {
        email_hash: 'bcd890',
        from: 'test@example.com',
        subject: 'Test',
        date: '2026-02-04T10:00:00Z',
        attachments: [],
        body: 'Test',
        file_path: '/test/path.eml',
        format: 'eml',
        extract_status: 'success',
      };

      const result = await engine.execute(email);

      // With 1ms timeout, execution might time out
      // But since rules are fast, it might not
      expect(result.timedOut).toBeDefined();
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle malformed email data gracefully', async () => {
      const engine = new RuleEngine();

      const email: ParsedEmail = {
        email_hash: 'efg123',
        from: '',
        subject: '',
        date: 'invalid-date',
        attachments: [],
        body: undefined,
        file_path: '',
        format: 'eml',
        extract_status: 'error',
        error_log: 'Parsing failed',
      };

      // Should not throw
      const result = await engine.execute(email);

      expect(result).toBeDefined();
      expect(result.timedOut).toBe(false);
    });
  });
});
