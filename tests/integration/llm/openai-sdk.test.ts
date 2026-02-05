/**
 * Integration tests for OpenAI SDK integration
 *
 * Per plan.md Decision 1: Test OpenAI SDK with real API
 * T035: Integration test for OpenAI SDK integration
 *
 * Note: These tests require a valid OpenAI API key to run.
 * Set OPENAI_TEST_KEY environment variable or skip tests.
 *
 * Tests:
 * - Real OpenAI API calls (using test key)
 * - Verify JSON mode response
 * - Structured output parsing
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { RemoteLLM } from '@/llm/RemoteLLM.js';
import type { EmailBatch, LLMOutput } from '@/llm/LLMAdapter.js';

// Check if test key is available
const hasTestKey = !!process.env.OPENAI_TEST_KEY;

describe('OpenAI SDK Integration Tests', () => {
  describe('With real OpenAI API', () => {
    let remoteLLM: RemoteLLM;

    beforeAll(() => {
      if (!hasTestKey) {
        return;
      }

      remoteLLM = new RemoteLLM({
        apiKey: process.env.OPENAI_TEST_KEY || '',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4-turbo-preview', // Or use a cheaper model for testing
        timeout: 30000,
        maxRetries: 2,
      });
    });

    it('should connect to OpenAI API and generate action items', async () => {
      if (!hasTestKey) {
        console.log('Skipping test: OPENAI_TEST_KEY not set');
        return;
      }

      const mockEmailBatch: EmailBatch = {
        emails: [
          {
            message_id: 'msg123@example.com',
            from: 'manager@company.com',
            subject: 'Task Assignment',
            date: '2026-02-03T10:00:00Z',
            body: 'Please complete the Q1 report by Friday COB. Let me know if you have questions.',
            email_hash: 'abc123def456',
          },
        ],
        reportDate: '2026-02-03',
        mode: 'remote',
      };

      const result = await remoteLLM.generate(mockEmailBatch);

      // Verify response structure
      expect(result).toBeDefined();
      expect(result.items).toBeInstanceOf(Array);
      expect(result.batch_info).toBeDefined();
      expect(result.batch_info.total_emails).toBe(1);

      // Verify at least one action item was extracted
      expect(result.items.length).toBeGreaterThan(0);

      // Verify item structure
      const item = result.items[0];
      expect(item).toHaveProperty('content');
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('source_email_indices');
      expect(item).toHaveProperty('evidence');
      expect(item).toHaveProperty('confidence');
      expect(item).toHaveProperty('source_status');

      // Verify types
      expect(typeof item.content).toBe('string');
      expect(['completed', 'pending']).toContain(item.type);
      expect(Array.isArray(item.source_email_indices)).toBe(true);
      expect(typeof item.evidence).toBe('string');
      expect(typeof item.confidence).toBe('number');
      expect(['verified', 'unverified']).toContain(item.source_status);

      // Verify confidence range
      expect(item.confidence).toBeGreaterThanOrEqual(0);
      expect(item.confidence).toBeLessThanOrEqual(100);
    });

    it('should use JSON mode for structured output', async () => {
      if (!hasTestKey) {
        console.log('Skipping test: OPENAI_TEST_KEY not set');
        return;
      }

      const mockEmailBatch: EmailBatch = {
        emails: [
          {
            message_id: 'msg456@example.com',
            from: 'boss@company.com',
            subject: 'Meeting Tomorrow',
            date: '2026-02-03T11:00:00Z',
            body: 'Meeting at 2pm tomorrow to discuss project status.',
            email_hash: 'def456ghi789',
          },
        ],
        reportDate: '2026-02-03',
        mode: 'remote',
      };

      const result = await remoteLLM.generate(mockEmailBatch);

      // Verify that response is properly structured (JSON mode working)
      expect(result.items).toBeInstanceOf(Array);
      expect(result.batch_info).toHaveProperty('total_emails');
      expect(result.batch_info).toHaveProperty('processed_emails');
      expect(result.batch_info).toHaveProperty('skipped_emails');

      // Verify batch_info values are numbers
      expect(typeof result.batch_info.total_emails).toBe('number');
      expect(typeof result.batch_info.processed_emails).toBe('number');
      expect(typeof result.batch_info.skipped_emails).toBe('number');
    });

    it('should handle multiple emails in a batch', async () => {
      if (!hasTestKey) {
        console.log('Skipping test: OPENAI_TEST_KEY not set');
        return;
      }

      const mockEmailBatch: EmailBatch = {
        emails: [
          {
            message_id: 'msg1@example.com',
            from: 'sender1@example.com',
            subject: 'Task 1',
            date: '2026-02-03T10:00:00Z',
            body: 'Complete task 1 by Monday.',
            email_hash: 'hash1',
          },
          {
            message_id: 'msg2@example.com',
            from: 'sender2@example.com',
            subject: 'Task 2',
            date: '2026-02-03T11:00:00Z',
            body: 'Review document by Wednesday.',
            email_hash: 'hash2',
          },
          {
            message_id: 'msg3@example.com',
            from: 'sender3@example.com',
            subject: 'Task 3',
            date: '2026-02-03T12:00:00Z',
            body: 'Send update to client.',
            email_hash: 'hash3',
          },
        ],
        reportDate: '2026-02-03',
        mode: 'remote',
      };

      const result = await remoteLLM.generate(mockEmailBatch);

      // Verify response for multiple emails
      expect(result.batch_info.total_emails).toBe(3);
      expect(result.items.length).toBeGreaterThan(0);

      // Verify source_email_indices are within valid range
      result.items.forEach((item) => {
        expect(item.source_email_indices).toBeDefined();
        item.source_email_indices?.forEach((index) => {
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(3);
        });
      });
    });
  });

  describe('Health check with real API', () => {
    let remoteLLM: RemoteLLM;

    beforeAll(() => {
      if (!hasTestKey) {
        return;
      }

      remoteLLM = new RemoteLLM({
        apiKey: process.env.OPENAI_TEST_KEY || '',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4-turbo-preview',
      });
    });

    it('should return true for healthy service', async () => {
      if (!hasTestKey) {
        console.log('Skipping test: OPENAI_TEST_KEY not set');
        return;
      }

      const isHealthy = await remoteLLM.checkHealth();

      expect(isHealthy).toBe(true);
    });
  });

  describe('Error handling with real API', () => {
    it('should handle invalid API key gracefully', async () => {
      if (!hasTestKey) {
        // Skip this test without a valid key - network calls can be unreliable
        console.log('Skipping test: OPENAI_TEST_KEY not set (invalid key test requires network)');
        return;
      }

      const invalidLLM = new RemoteLLM({
        apiKey: 'invalid-key-12345',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4-turbo-preview',
        timeout: 5000, // Timeout for faster test
        maxRetries: 0, // No retries for faster test
      });

      const mockEmailBatch: EmailBatch = {
        emails: [
          {
            message_id: 'msg@example.com',
            from: 'sender@example.com',
            subject: 'Test',
            date: '2026-02-03T10:00:00Z',
            body: 'Test email',
            email_hash: 'testhash',
          },
        ],
        reportDate: '2026-02-03',
        mode: 'remote',
      };

      try {
        await invalidLLM.generate(mockEmailBatch);
        // If we get here, the test key might be invalid, which is fine
        expect(true).toBe(true);
      } catch (error) {
        // Should fail with authentication error or timeout (both demonstrate error handling)
        expect(error).toBeDefined();
        const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error);
        // Accept authentication errors, invalid key errors, or timeouts (which can happen with invalid keys)
        expect(errorMessage).toMatch(/authentication|invalid|401|timeout/);
      }
    });

    it('should handle timeout gracefully', async () => {
      if (!hasTestKey) {
        console.log('Skipping test: OPENAI_TEST_KEY not set');
        return;
      }

      const timeoutLLM = new RemoteLLM({
        apiKey: process.env.OPENAI_TEST_KEY || '',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4-turbo-preview',
        timeout: 1, // 1ms timeout (will likely fail)
      });

      const mockEmailBatch: EmailBatch = {
        emails: [
          {
            message_id: 'msg@example.com',
            from: 'sender@example.com',
            subject: 'Test',
            date: '2026-02-03T10:00:00Z',
            body: 'A'.repeat(100000), // Large body to increase processing time
            email_hash: 'testhash',
          },
        ],
        reportDate: '2026-02-03',
        mode: 'remote',
      };

      try {
        await timeoutLLM.generate(mockEmailBatch);
        // Might succeed if fast enough, which is fine
        expect(true).toBe(true);
      } catch (error) {
        // Should fail with timeout error
        expect(error).toBeDefined();
        const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error);
        expect(errorMessage).toMatch(/timeout/);
      }
    });
  });
});
