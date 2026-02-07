/**
 * Unit tests for OutputValidator
 *
 * Per plan.md R0-5: Test Zod validation, retry with reinforcement, degradation fallback
 * T036: Unit test for OutputValidator in tests/unit/llm/validator.test.ts
 *
 * Tests:
 * - Zod validation
 * - Retry with reinforcement
 * - Degradation fallback
 */

import { describe, it, expect } from 'vitest';
import { OutputValidator } from '@/llm/OutputValidator.js';
import type { LLMOutput } from '@/llm/LLMAdapter.js';

describe('OutputValidator', () => {
  describe('validate', () => {
    const validOutput: LLMOutput = {
      items: [
        {
          content: 'Complete the task by Friday',
          type: 'pending',
          source_email_indices: [0],
          evidence: 'Deadline keyword detected',
          confidence: 85,
          source_status: 'verified',
        },
        {
          content: 'Review document',
          type: 'completed',
          source_email_indices: [1],
          evidence: 'Past tense indicates completion',
          confidence: 90,
          source_status: 'verified',
        },
      ],
      batch_info: {
        total_emails: 2,
        processed_emails: 2,
        skipped_emails: 0,
      },
    };

    it('should validate correct output successfully', async () => {
      const result = await OutputValidator.validate(validOutput);

      expect(result.isValid).toBe(true);
      expect(result.isDegraded).toBe(false);
      expect(result.retryCount).toBe(0);
      expect(result.output).toEqual(validOutput);
    });

    it('should degrade output with missing required fields', async () => {
      const invalidOutput: LLMOutput = {
        items: [
          {
            content: 'Test item',
            type: 'pending',
            source_email_indices: [], // Empty array (min 1 required)
            evidence: 'Test',
            confidence: 75,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      const result = await OutputValidator.validate(invalidOutput);

      expect(result.isValid).toBe(false);
      expect(result.isDegraded).toBe(true);
      expect(result.retryCount).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should cap confidence at 60 for degraded items', async () => {
      const invalidOutput: LLMOutput = {
        items: [
          {
            content: 'High confidence item',
            type: 'pending',
            source_email_indices: [], // Empty array violates min(1)
            evidence: 'Test',
            confidence: 95, // Should be capped to 60
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      const result = await OutputValidator.validate(invalidOutput);

      expect(result.isDegraded).toBe(true);
      expect(result.output.items[0].confidence).toBeLessThanOrEqual(60);
      expect(result.output.items[0].source_status).toBe('unverified');
    });

    it('should set source_status to unverified for degraded items', async () => {
      const output: LLMOutput = {
        items: [
          {
            content: 'Test item',
            type: 'pending',
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 50,
            source_status: 'verified', // Should be changed to unverified
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      // Make it invalid to trigger degradation (empty array violates min constraint)
      const invalidOutput: any = { ...output };
      invalidOutput.items[0].source_email_indices = [];

      const result = await OutputValidator.validate(invalidOutput);

      expect(result.isDegraded).toBe(true);
      expect(result.output.items[0].source_status).toBe('unverified');
    });

    it('should preserve items even on validation failure (Principle II)', async () => {
      const invalidOutput: LLMOutput = {
        items: [
          {
            content: 'Item 1',
            type: 'pending',
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 70,
            source_status: 'verified',
          },
          {
            content: 'Item 2',
            type: 'completed',
            source_email_indices: [1],
            evidence: 'Test',
            confidence: 80,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 2,
          processed_emails: 2,
          skipped_emails: 0,
        },
      };

      // Make it invalid (empty source_email_indices violates min constraint)
      const invalidOutputAny: any = { ...invalidOutput };
      invalidOutputAny.items[0].source_email_indices = [];
      invalidOutputAny.items[1].confidence = 'invalid'; // Also make one item invalid

      const result = await OutputValidator.validate(invalidOutputAny);

      // Items should still be present (not dropped)
      expect(result.output.items).toHaveLength(2);
      expect(result.output.items[0].content).toBe('Item 1');
      expect(result.output.items[1].content).toBe('Item 2');
    });

    it('should handle missing batch_info gracefully', async () => {
      const invalidOutput: any = {
        items: [
          {
            content: 'Test item',
            type: 'pending',
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 75,
            source_status: 'verified',
          },
        ],
        // Missing batch_info
      };

      const result = await OutputValidator.validate(invalidOutput);

      expect(result.isDegraded).toBe(true);
      expect(result.errors).toBeDefined();
    });

    it('should handle empty items array', async () => {
      const emptyOutput: LLMOutput = {
        items: [],
        batch_info: {
          total_emails: 0,
          processed_emails: 0,
          skipped_emails: 0,
        },
      };

      const result = await OutputValidator.validate(emptyOutput);

      // Empty items is technically valid, though might not be useful
      expect(result.isValid).toBe(true);
      expect(result.output.items).toHaveLength(0);
    });

    it('should handle items with invalid type values', async () => {
      const invalidOutput: any = {
        items: [
          {
            content: 'Test item',
            type: 'invalid_type', // Invalid enum value
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 75,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      const result = await OutputValidator.validate(invalidOutput);

      expect(result.isDegraded).toBe(true);
    });

    it('should handle items with out-of-range confidence values', async () => {
      const invalidOutput: any = {
        items: [
          {
            content: 'Test item',
            type: 'pending',
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 150, // Out of range (> 100)
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      const result = await OutputValidator.validate(invalidOutput);

      expect(result.isDegraded).toBe(true);
    });
  });

  describe('validateItem', () => {
    const validItem = {
      content: 'Complete task by Friday',
      type: 'pending' as const,
      source_email_indices: [0],
      evidence: 'Deadline detected',
      confidence: 85,
      source_status: 'verified' as const,
    };

    it('should validate a correct item successfully', () => {
      const result = OutputValidator.validateItem(validItem);

      expect(result.success).toBe(true);
    });

    it('should reject item with missing required fields', () => {
      const invalidItem = { ...validItem };
      (invalidItem as any).source_email_indices = []; // Empty array violates min(1)

      const result = OutputValidator.validateItem(invalidItem);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject item with invalid type', () => {
      const invalidItem: any = {
        ...validItem,
        type: 'invalid_type',
      };

      const result = OutputValidator.validateItem(invalidItem);

      expect(result.success).toBe(false);
    });

    it('should reject item with invalid confidence', () => {
      const invalidItem: any = {
        ...validItem,
        confidence: 150,
      };

      const result = OutputValidator.validateItem(invalidItem);

      expect(result.success).toBe(false);
    });

    it('should reject item with empty source_email_indices', () => {
      const invalidItem: any = {
        ...validItem,
        source_email_indices: [], // Empty array violates min(1)
      };

      const result = OutputValidator.validateItem(invalidItem);

      expect(result.success).toBe(false);
    });
  });

  describe('isDegraded', () => {
    it('should return true for degraded validation result', async () => {
      const invalidOutput: any = {
        items: [
          {
            content: 'Test',
            type: 'pending',
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 75,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      const result = await OutputValidator.validate(invalidOutput);

      expect(OutputValidator.isDegraded(result)).toBe(result.isDegraded);
    });

    it('should return false for valid validation result', async () => {
      const validOutput: LLMOutput = {
        items: [
          {
            content: 'Test',
            type: 'pending',
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 75,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      const result = await OutputValidator.validate(validOutput);

      expect(OutputValidator.isDegraded(result)).toBe(false);
    });
  });

  describe('isValid', () => {
    it('should return true for valid validation result', async () => {
      const validOutput: LLMOutput = {
        items: [
          {
            content: 'Test',
            type: 'pending',
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 75,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      const result = await OutputValidator.validate(validOutput);

      expect(OutputValidator.isValid(result)).toBe(true);
    });

    it('should return false for degraded validation result', async () => {
      const invalidOutput: any = {
        items: [
          {
            content: 'Test',
            type: 'pending',
            source_email_indices: [], // Empty array violates min(1)
            evidence: 'Test',
            confidence: 75,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      const result = await OutputValidator.validate(invalidOutput);

      expect(OutputValidator.isValid(result)).toBe(false);
    });
  });

  describe('getReinforcementPrompt', () => {
    it('should return a reinforcement prompt string', () => {
      const prompt = OutputValidator.getReinforcementPrompt();

      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('CRITICAL');
      expect(prompt).toContain('Previous response was invalid');
      expect(prompt).toContain('source_email_indices');
      expect(prompt).toContain('type');
      expect(prompt).toContain('confidence');
    });
  });

  describe('sanitize', () => {
    it('should fix missing source_email_indices (undefined)', () => {
      const dirtyOutput: LLMOutput = {
        items: [
          {
            content: 'Test item',
            type: 'pending',
            source_email_indices: undefined as any, // Missing
            evidence: 'Test',
            confidence: 75,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      const sanitized = OutputValidator.sanitize(dirtyOutput);

      // sanitize should set empty array when undefined
      expect(sanitized.items[0].source_email_indices).toEqual([]);
    });

    it('should fix invalid item type', () => {
      const dirtyOutput: LLMOutput = {
        items: [
          {
            content: 'Test item',
            type: 'invalid_type' as any, // Invalid
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 75,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      const sanitized = OutputValidator.sanitize(dirtyOutput);

      expect(sanitized.items[0].type).toBe('pending');
    });

    it('should fix invalid confidence', () => {
      const dirtyOutput: LLMOutput = {
        items: [
          {
            content: 'Test item',
            type: 'pending',
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 'invalid' as any, // Wrong type
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      const sanitized = OutputValidator.sanitize(dirtyOutput);

      expect(typeof sanitized.items[0].confidence).toBe('number');
      expect(sanitized.items[0].confidence).toBe(50); // Default value
    });

    it('should set default source_status if missing', () => {
      const dirtyOutput: LLMOutput = {
        items: [
          {
            content: 'Test item',
            type: 'pending',
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 75,
            source_status: undefined as any, // Missing
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      const sanitized = OutputValidator.sanitize(dirtyOutput);

      expect(sanitized.items[0].source_status).toBe('verified');
    });

    it('should fix invalid batch_info values', () => {
      const dirtyOutput: LLMOutput = {
        items: [
          {
            content: 'Test item',
            type: 'pending',
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 75,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 'invalid' as any,
          processed_emails: undefined as any,
          skipped_emails: null as any,
        },
      };

      const sanitized = OutputValidator.sanitize(dirtyOutput);

      expect(typeof sanitized.batch_info.total_emails).toBe('number');
      expect(typeof sanitized.batch_info.processed_emails).toBe('number');
      expect(typeof sanitized.batch_info.skipped_emails).toBe('number');
    });
  });

  describe('validateBatch', () => {
    const validOutputs: LLMOutput[] = [
      {
        items: [
          {
            content: 'Item 1',
            type: 'pending',
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 75,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      },
      {
        items: [
          {
            content: 'Item 2',
            type: 'completed',
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 80,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      },
    ];

    it('should validate multiple outputs', async () => {
      const results = await OutputValidator.validateBatch(validOutputs);

      expect(results).toHaveLength(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
    });

    it('should handle mix of valid and invalid outputs', async () => {
      const mixedOutputs: LLMOutput[] = [
        ...validOutputs,
        {
          items: [
            {
              content: 'Invalid item',
              type: 'pending',
              source_email_indices: [0],
              evidence: 'Test',
              confidence: 75,
              source_status: 'verified',
            },
          ],
          batch_info: {
            total_emails: 1,
            processed_emails: 1,
            skipped_emails: 0,
          },
        },
      ];

      // Make the last one invalid
      (mixedOutputs[2] as any).items[0].confidence = 'invalid';

      const results = await OutputValidator.validateBatch(mixedOutputs);

      expect(results).toHaveLength(3);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
      expect(results[2].isValid).toBe(false);
    });
  });
});
