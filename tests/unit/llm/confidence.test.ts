/**
 * Unit tests for Confidence Calculator
 *
 * Tests T037: ConfidenceCalculator implementation
 * Per plan.md:
 * - R0-8: Dual-engine confidence calculation (rules 50% + LLM 50%)
 * - FR-010: Schema failure adjustment (rules 60% + LLM 20%, capped at 0.6)
 * - SC-005: Low confidence items (<0.6) identify problematic items
 *
 * @module tests/unit/llm/confidence.test
 */

import { describe, it, expect } from 'vitest';
import { ConfidenceCalculator } from '@/llm/ConfidenceCalculator';
import type { RuleEngineResult } from '@/llm/ConfidenceCalculator';
import type { ExtractedItem } from '@/llm/LLMAdapter';

describe('ConfidenceCalculator', () => {
  describe('Normal mode calculation (rules 50% + LLM 50%)', () => {
    it('should calculate weighted average of rule and LLM scores', () => {
      const ruleResult: RuleEngineResult = {
        score: 80, // 0.8 normalized
        rulesTriggered: 3,
        details: {
          hasDeadlineKeyword: true,
          hasPriorityKeyword: false,
          isWhitelistedSender: false,
          actionVerbCount: 2,
        },
      };

      const llmItem: ExtractedItem = {
        content: 'Submit report by Friday',
        type: 'pending',
        source_email_indices: [0],
        evidence: 'Deadline keyword detected',
        confidence: 90, // 0.9 normalized
        source_status: 'verified',
      };

      const result = ConfidenceCalculator.calculate(ruleResult, llmItem);

      // Expected: (0.8 * 0.5) + (0.9 * 0.5) = 0.4 + 0.45 = 0.85
      // Capped at 0.6 per FR-010
      expect(result.confidence).toBe(0.6);
      expect(result.ruleContribution).toBe(0.4);
      expect(result.llmContribution).toBe(0.45);
      expect(result.isDegraded).toBe(false);
      expect(result.details.capApplied).toBe(true);
    });

    it('should not apply cap when confidence is below maximum', () => {
      const ruleResult: RuleEngineResult = {
        score: 40,
        rulesTriggered: 1,
        details: {
          hasDeadlineKeyword: false,
          hasPriorityKeyword: false,
          isWhitelistedSender: false,
          actionVerbCount: 1,
        },
      };

      const llmItem: ExtractedItem = {
        content: 'Low confidence item',
        type: 'pending',
        source_email_indices: [0],
        evidence: 'Minimal evidence',
        confidence: 30,
        source_status: 'verified',
      };

      const result = ConfidenceCalculator.calculate(ruleResult, llmItem);

      // Expected: (0.4 * 0.5) + (0.3 * 0.5) = 0.2 + 0.15 = 0.35
      // Not capped (below 0.6 threshold)
      expect(result.confidence).toBe(0.35);
      expect(result.details.capApplied).toBe(false);
    });

    it('should handle edge case with zero scores', () => {
      const ruleResult: RuleEngineResult = {
        score: 0,
        rulesTriggered: 0,
        details: {
          hasDeadlineKeyword: false,
          hasPriorityKeyword: false,
          isWhitelistedSender: false,
          actionVerbCount: 0,
        },
      };

      const llmItem: ExtractedItem = {
        content: 'No confidence item',
        type: 'pending',
        source_email_indices: [0],
        evidence: 'No evidence',
        confidence: 0,
        source_status: 'verified',
      };

      const result = ConfidenceCalculator.calculate(ruleResult, llmItem);

      expect(result.confidence).toBe(0);
      expect(result.ruleContribution).toBe(0);
      expect(result.llmContribution).toBe(0);
    });

    it('should normalize scores above 100 to 1.0', () => {
      const ruleResult: RuleEngineResult = {
        score: 120, // Above 100, should normalize to 1.0
        rulesTriggered: 5,
        details: {
          hasDeadlineKeyword: true,
          hasPriorityKeyword: true,
          isWhitelistedSender: true,
          actionVerbCount: 3,
        },
      };

      const llmItem: ExtractedItem = {
        content: 'Overconfident item',
        type: 'pending',
        source_email_indices: [0],
        evidence: 'Strong evidence',
        confidence: 150, // Above 100, should normalize to 1.0
        source_status: 'verified',
      };

      const result = ConfidenceCalculator.calculate(ruleResult, llmItem);

      // Expected: (1.0 * 0.5) + (1.0 * 0.5) = 1.0
      // Capped at 0.6
      expect(result.confidence).toBe(0.6);
      expect(result.ruleContribution).toBe(0.5);
      expect(result.llmContribution).toBe(0.5);
    });
  });

  describe('Degraded mode calculation (rules 60% + LLM 20% per FR-010)', () => {
    it('should adjust weights when LLM schema validation fails', () => {
      const ruleResult: RuleEngineResult = {
        score: 80,
        rulesTriggered: 3,
        details: {
          hasDeadlineKeyword: true,
          hasPriorityKeyword: true,
          isWhitelistedSender: false,
          actionVerbCount: 2,
        },
      };

      const llmItem: ExtractedItem = {
        content: 'Degraded mode item',
        type: 'pending',
        source_email_indices: [0],
        evidence: 'Schema validation failed',
        confidence: 90,
        source_status: 'unverified', // Degraded status
      };

      const result = ConfidenceCalculator.calculate(ruleResult, llmItem, {
        isDegraded: true,
      });

      // Expected: (0.8 * 0.6) + (0.9 * 0.2) = 0.48 + 0.18 = 0.66
      // Capped at 0.6
      expect(result.confidence).toBe(0.6);
      expect(result.ruleContribution).toBe(0.48);
      expect(result.llmContribution).toBeCloseTo(0.18, 10); // Floating-point precision
      expect(result.isDegraded).toBe(true);
      expect(result.details.ruleWeight).toBe(0.6);
      expect(result.details.llmWeight).toBe(0.2);
    });

    it('should heavily penalize low rule scores in degraded mode', () => {
      const ruleResult: RuleEngineResult = {
        score: 20,
        rulesTriggered: 0,
        details: {
          hasDeadlineKeyword: false,
          hasPriorityKeyword: false,
          isWhitelistedSender: false,
          actionVerbCount: 0,
        },
      };

      const llmItem: ExtractedItem = {
        content: 'Weak item',
        type: 'pending',
        source_email_indices: [0],
        evidence: 'Minimal evidence',
        confidence: 50,
        source_status: 'unverified',
      };

      const result = ConfidenceCalculator.calculate(ruleResult, llmItem, {
        isDegraded: true,
      });

      // Expected: (0.2 * 0.6) + (0.5 * 0.2) = 0.12 + 0.1 = 0.22
      expect(result.confidence).toBe(0.22);
      expect(result.isDegraded).toBe(true);
    });
  });

  describe('Confidence cap at 0.6 per FR-010', () => {
    it('should always cap confidence at 0.6 regardless of scores', () => {
      const ruleResult: RuleEngineResult = {
        score: 100,
        rulesTriggered: 5,
        details: {
          hasDeadlineKeyword: true,
          hasPriorityKeyword: true,
          isWhitelistedSender: true,
          actionVerbCount: 5,
        },
      };

      const llmItem: ExtractedItem = {
        content: 'Perfect item',
        type: 'pending',
        source_email_indices: [0],
        evidence: 'Strong evidence',
        confidence: 100,
        source_status: 'verified',
      };

      const result = ConfidenceCalculator.calculate(ruleResult, llmItem);

      // Even with perfect scores, cap at 0.6
      expect(result.confidence).toBe(0.6);
      expect(result.details.capApplied).toBe(true);
    });

    it('should allow custom max confidence via options', () => {
      const ruleResult: RuleEngineResult = {
        score: 80,
        rulesTriggered: 3,
        details: {
          hasDeadlineKeyword: true,
          hasPriorityKeyword: false,
          isWhitelistedSender: false,
          actionVerbCount: 2,
        },
      };

      const llmItem: ExtractedItem = {
        content: 'Custom cap item',
        type: 'pending',
        source_email_indices: [0],
        evidence: 'Evidence',
        confidence: 90,
        source_status: 'verified',
      };

      const result = ConfidenceCalculator.calculate(ruleResult, llmItem, {
        maxConfidence: 0.8,
      });

      expect(result.confidence).toBeLessThanOrEqual(0.8);
    });
  });

  describe('Custom weights via options', () => {
    it('should use custom weights when provided', () => {
      const ruleResult: RuleEngineResult = {
        score: 70,
        rulesTriggered: 2,
        details: {
          hasDeadlineKeyword: true,
          hasPriorityKeyword: false,
          isWhitelistedSender: false,
          actionVerbCount: 1,
        },
      };

      const llmItem: ExtractedItem = {
        content: 'Custom weights item',
        type: 'pending',
        source_email_indices: [0],
        evidence: 'Evidence',
        confidence: 80,
        source_status: 'verified',
      };

      const result = ConfidenceCalculator.calculate(ruleResult, llmItem, {
        ruleWeight: 0.7,
        llmWeight: 0.3,
      });

      // Expected: (0.7 * 0.7) + (0.8 * 0.3) = 0.49 + 0.24 = 0.73
      // Capped at 0.6
      expect(result.confidence).toBe(0.6);
      expect(result.details.ruleWeight).toBe(0.7);
      expect(result.details.llmWeight).toBe(0.3);
    });
  });

  describe('Batch calculation', () => {
    it('should calculate confidence for multiple items', () => {
      const ruleResults: RuleEngineResult[] = [
        {
          score: 80,
          rulesTriggered: 3,
          details: {
            hasDeadlineKeyword: true,
            hasPriorityKeyword: false,
            isWhitelistedSender: false,
            actionVerbCount: 2,
          },
        },
        {
          score: 40,
          rulesTriggered: 1,
          details: {
            hasDeadlineKeyword: false,
            hasPriorityKeyword: false,
            isWhitelistedSender: false,
            actionVerbCount: 1,
          },
        },
      ];

      const llmItems: ExtractedItem[] = [
        {
          content: 'High confidence item',
          type: 'pending',
          source_email_indices: [0],
          evidence: 'Strong evidence',
          confidence: 90,
          source_status: 'verified',
        },
        {
          content: 'Low confidence item',
          type: 'pending',
          source_email_indices: [0],
          evidence: 'Weak evidence',
          confidence: 30,
          source_status: 'verified',
        },
      ];

      const results = ConfidenceCalculator.calculateBatch(ruleResults, llmItems);

      expect(results).toHaveLength(2);
      expect(results[0].confidence).toBe(0.6); // Capped
      expect(results[1].confidence).toBeLessThan(0.6); // Below cap
    });

    it('should throw error when array lengths do not match', () => {
      const ruleResults: RuleEngineResult[] = [
        {
          score: 80,
          rulesTriggered: 3,
          details: {
            hasDeadlineKeyword: true,
            hasPriorityKeyword: false,
            isWhitelistedSender: false,
            actionVerbCount: 2,
          },
        },
      ];

      const llmItems: ExtractedItem[] = [];

      expect(() => {
        ConfidenceCalculator.calculateBatch(ruleResults, llmItems);
      }).toThrow('Rule results count (1) must match LLM items count (0)');
    });
  });

  describe('Confidence level classification per FR-011', () => {
    it('should classify high confidence (≥0.8)', () => {
      expect(ConfidenceCalculator.getConfidenceLevel(0.8)).toBe('high');
      expect(ConfidenceCalculator.getConfidenceLevel(0.9)).toBe('high');
      expect(ConfidenceCalculator.getConfidenceLevel(1.0)).toBe('high');
    });

    it('should classify medium confidence (0.6-0.79)', () => {
      expect(ConfidenceCalculator.getConfidenceLevel(0.6)).toBe('medium');
      expect(ConfidenceCalculator.getConfidenceLevel(0.7)).toBe('medium');
      expect(ConfidenceCalculator.getConfidenceLevel(0.79)).toBe('medium');
    });

    it('should classify low confidence (<0.6)', () => {
      expect(ConfidenceCalculator.getConfidenceLevel(0.59)).toBe('low');
      expect(ConfidenceCalculator.getConfidenceLevel(0.4)).toBe('low');
      expect(ConfidenceCalculator.getConfidenceLevel(0.0)).toBe('low');
    });
  });

  describe('Confidence display labels per FR-011', () => {
    it('should return empty label for high confidence', () => {
      expect(ConfidenceCalculator.getConfidenceLabel(0.8)).toBe('');
      expect(ConfidenceCalculator.getConfidenceLabel(0.9)).toBe('');
    });

    it('should return review label for medium confidence', () => {
      expect(ConfidenceCalculator.getConfidenceLabel(0.6)).toBe('[建议复核]');
      expect(ConfidenceCalculator.getConfidenceLabel(0.7)).toBe('[建议复核]');
    });

    it('should return confirmation label for low confidence', () => {
      expect(ConfidenceCalculator.getConfidenceLabel(0.59)).toBe('[来源待确认]');
      expect(ConfidenceCalculator.getConfidenceLabel(0.4)).toBe('[来源待确认]');
    });
  });

  describe('Validation', () => {
    it('should validate correct confidence result', () => {
      const result = {
        confidence: 0.6,
        ruleContribution: 0.4,
        llmContribution: 0.2,
        isDegraded: false,
        details: {
          ruleScore: 80,
          llmScore: 40,
          ruleWeight: 0.5,
          llmWeight: 0.5,
          capApplied: true,
        },
      };

      expect(ConfidenceCalculator.isValid(result)).toBe(true);
    });

    it('should reject invalid confidence (out of range)', () => {
      const invalidResult = {
        confidence: 1.5, // Above 1.0
        ruleContribution: 0.4,
        llmContribution: 0.2,
        isDegraded: false,
        details: {
          ruleScore: 80,
          llmScore: 40,
          ruleWeight: 0.5,
          llmWeight: 0.5,
          capApplied: false,
        },
      };

      expect(ConfidenceCalculator.isValid(invalidResult)).toBe(false);
    });

    it('should reject invalid weights (sum > 1)', () => {
      const invalidResult = {
        confidence: 0.6,
        ruleContribution: 0.6,
        llmContribution: 0.6,
        isDegraded: false,
        details: {
          ruleScore: 80,
          llmScore: 80,
          ruleWeight: 0.6,
          llmWeight: 0.6, // Sum = 1.2 > 1.0
          capApplied: true,
        },
      };

      expect(ConfidenceCalculator.isValid(invalidResult)).toBe(false);
    });
  });

  describe('Degraded rule result creation', () => {
    it('should create low confidence rule result on failure', () => {
      const degradedResult = ConfidenceCalculator.createDegradedRuleResult('Rule engine timeout');

      expect(degradedResult.score).toBe(30);
      expect(degradedResult.rulesTriggered).toBe(0);
      expect(degradedResult.details.hasDeadlineKeyword).toBe(false);
      expect(degradedResult.details.hasPriorityKeyword).toBe(false);
      expect(degradedResult.details.isWhitelistedSender).toBe(false);
      expect(degradedResult.details.actionVerbCount).toBe(0);
    });
  });

  describe('Default weights', () => {
    it('should return normal mode weights by default', () => {
      const weights = ConfidenceCalculator.getDefaultWeights(false);

      expect(weights.rule).toBe(0.5);
      expect(weights.llm).toBe(0.5);
    });

    it('should return degraded mode weights when requested', () => {
      const weights = ConfidenceCalculator.getDefaultWeights(true);

      expect(weights.rule).toBe(0.6);
      expect(weights.llm).toBe(0.2);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle negative scores', () => {
      const ruleResult: RuleEngineResult = {
        score: -10, // Negative score
        rulesTriggered: 0,
        details: {
          hasDeadlineKeyword: false,
          hasPriorityKeyword: false,
          isWhitelistedSender: false,
          actionVerbCount: 0,
        },
      };

      const llmItem: ExtractedItem = {
        content: 'Negative score test',
        type: 'pending',
        source_email_indices: [0],
        evidence: 'Test',
        confidence: 50,
        source_status: 'verified',
      };

      const result = ConfidenceCalculator.calculate(ruleResult, llmItem);

      // Negative score should be normalized to 0
      expect(result.confidence).toBe(0.25); // (0 * 0.5) + (0.5 * 0.5) = 0.25
    });

    it('should handle empty options object', () => {
      const ruleResult: RuleEngineResult = {
        score: 50,
        rulesTriggered: 1,
        details: {
          hasDeadlineKeyword: false,
          hasPriorityKeyword: false,
          isWhitelistedSender: false,
          actionVerbCount: 1,
        },
      };

      const llmItem: ExtractedItem = {
        content: 'Empty options test',
        type: 'pending',
        source_email_indices: [0],
        evidence: 'Test',
        confidence: 50,
        source_status: 'verified',
      };

      const result = ConfidenceCalculator.calculate(ruleResult, llmItem, {});

      // Should use default normal mode weights
      expect(result.isDegraded).toBe(false);
      expect(result.details.ruleWeight).toBe(0.5);
      expect(result.details.llmWeight).toBe(0.5);
    });
  });
});
