/**
 * Unit tests for confidence threshold classification
 *
 * Tests T049: Confidence threshold classification logic
 * Per plan.md FR-011:
 * - ≥0.8: Normal confidence (no special styling)
 * - 0.6-0.79: "[建议复核]" (gray badge, "needs review")
 * - <0.6: "[来源待确认]" (prominent badge, "source unconfirmed")
 *
 * @module tests/unit/llm/thresholds.test
 */

import { describe, it, expect } from 'vitest';
import { ConfidenceThresholds } from '@/llm/ConfidenceThresholds';

describe('ConfidenceThresholds', () => {
  describe('High confidence classification (≥0.8)', () => {
    it('should classify 0.8 as high confidence', () => {
      const result = ConfidenceThresholds.classify(0.8);

      expect(result.level).toBe('high');
      expect(result.label).toBe('');
      expect(result.needsWarning).toBe(false);
      expect(result.needsReview).toBe(false);
    });

    it('should classify 0.9 as high confidence', () => {
      const result = ConfidenceThresholds.classify(0.9);

      expect(result.level).toBe('high');
      expect(result.label).toBe('');
      expect(result.needsWarning).toBe(false);
      expect(result.needsReview).toBe(false);
    });

    it('should classify 1.0 as high confidence', () => {
      const result = ConfidenceThresholds.classify(1.0);

      expect(result.level).toBe('high');
      expect(result.label).toBe('');
      expect(result.needsWarning).toBe(false);
      expect(result.needsReview).toBe(false);
    });

    it('should return no visual styling for high confidence', () => {
      const result = ConfidenceThresholds.getClassConfig(0.85);

      expect(result.backgroundColor).toBe('transparent');
      expect(result.borderColor).toBe('border-gray-200');
      expect(result.badgeVariant).toBe('default');
    });
  });

  describe('Medium confidence classification (0.6-0.79)', () => {
    it('should classify 0.6 as medium confidence', () => {
      const result = ConfidenceThresholds.classify(0.6);

      expect(result.level).toBe('medium');
      expect(result.label).toBe('[建议复核]');
      expect(result.needsWarning).toBe(false);
      expect(result.needsReview).toBe(true);
    });

    it('should classify 0.7 as medium confidence', () => {
      const result = ConfidenceThresholds.classify(0.7);

      expect(result.level).toBe('medium');
      expect(result.label).toBe('[建议复核]');
      expect(result.needsWarning).toBe(false);
      expect(result.needsReview).toBe(true);
    });

    it('should classify 0.79 as medium confidence', () => {
      const result = ConfidenceThresholds.classify(0.79);

      expect(result.level).toBe('medium');
      expect(result.label).toBe('[建议复核]');
      expect(result.needsWarning).toBe(false);
      expect(result.needsReview).toBe(true);
    });

    it('should return gray badge styling for medium confidence', () => {
      const result = ConfidenceThresholds.getClassConfig(0.65);

      expect(result.backgroundColor).toBe('bg-gray-50');
      expect(result.borderColor).toBe('border-gray-300');
      expect(result.badgeVariant).toBe('secondary');
      expect(result.badgeText).toBe('[建议复核]');
    });
  });

  describe('Low confidence classification (<0.6)', () => {
    it('should classify 0.59 as low confidence', () => {
      const result = ConfidenceThresholds.classify(0.59);

      expect(result.level).toBe('low');
      expect(result.label).toBe('[来源待确认]');
      expect(result.needsWarning).toBe(true);
      expect(result.needsReview).toBe(false);
    });

    it('should classify 0.4 as low confidence', () => {
      const result = ConfidenceThresholds.classify(0.4);

      expect(result.level).toBe('low');
      expect(result.label).toBe('[来源待确认]');
      expect(result.needsWarning).toBe(true);
      expect(result.needsReview).toBe(false);
    });

    it('should classify 0.0 as low confidence', () => {
      const result = ConfidenceThresholds.classify(0.0);

      expect(result.level).toBe('low');
      expect(result.label).toBe('[来源待确认]');
      expect(result.needsWarning).toBe(true);
      expect(result.needsReview).toBe(false);
    });

    it('should return prominent styling for low confidence', () => {
      const result = ConfidenceThresholds.getClassConfig(0.5);

      expect(result.backgroundColor).toBe('bg-yellow-50');
      expect(result.borderColor).toBe('border-yellow-300');
      expect(result.badgeVariant).toBe('destructive');
      expect(result.badgeText).toBe('[来源待确认]');
    });
  });

  describe('Boundary conditions', () => {
    it('should handle exact threshold 0.8 as high', () => {
      const result = ConfidenceThresholds.classify(0.8);

      expect(result.level).toBe('high');
      expect(result.label).toBe('');
    });

    it('should handle exact threshold 0.6 as medium', () => {
      const result = ConfidenceThresholds.classify(0.6);

      expect(result.level).toBe('medium');
      expect(result.label).toBe('[建议复核]');
    });

    it('should handle value just below 0.6 as low', () => {
      const result = ConfidenceThresholds.classify(0.599);

      expect(result.level).toBe('low');
      expect(result.label).toBe('[来源待确认]');
    });

    it('should handle value just above 0.8 as high', () => {
      const result = ConfidenceThresholds.classify(0.801);

      expect(result.level).toBe('high');
      expect(result.label).toBe('');
    });

    it('should handle value just below 0.8 as medium', () => {
      const result = ConfidenceThresholds.classify(0.799);

      expect(result.level).toBe('medium');
      expect(result.label).toBe('[建议复核]');
    });
  });

  describe('Invalid inputs', () => {
    it('should throw on negative confidence', () => {
      expect(() => {
        ConfidenceThresholds.classify(-0.1);
      }).toThrow('Confidence score must be between 0 and 1');
    });

    it('should throw on confidence > 1.0', () => {
      expect(() => {
        ConfidenceThresholds.classify(1.1);
      }).toThrow('Confidence score must be between 0 and 1');
    });

    it('should throw on NaN', () => {
      expect(() => {
        ConfidenceThresholds.classify(NaN);
      }).toThrow('Confidence score must be a valid number');
    });
  });

  describe('Aggregation helpers', () => {
    it('should count items by confidence level', () => {
      const items = [
        { confidence: 0.9 },
        { confidence: 0.85 },
        { confidence: 0.7 },
        { confidence: 0.65 },
        { confidence: 0.5 },
        { confidence: 0.4 },
      ];

      const counts = ConfidenceThresholds.countByLevel(items);

      expect(counts.high).toBe(2);
      expect(counts.medium).toBe(2);
      expect(counts.low).toBe(2);
      expect(counts.total).toBe(6);
    });

    it('should calculate summary statistics', () => {
      const items = [
        { confidence: 0.9 },
        { confidence: 0.7 },
        { confidence: 0.5 },
      ];

      const summary = ConfidenceThresholds.getSummary(items);

      expect(summary.highCount).toBe(1);
      expect(summary.mediumCount).toBe(1);
      expect(summary.lowCount).toBe(1);
      expect(summary.total).toBe(3);
      expect(summary.averageConfidence).toBeCloseTo(0.7, 1);
    });

    it('should handle empty array for aggregation', () => {
      const counts = ConfidenceThresholds.countByLevel([]);
      const summary = ConfidenceThresholds.getSummary([]);

      expect(counts.high).toBe(0);
      expect(counts.medium).toBe(0);
      expect(counts.low).toBe(0);
      expect(counts.total).toBe(0);

      expect(summary.highCount).toBe(0);
      expect(summary.mediumCount).toBe(0);
      expect(summary.lowCount).toBe(0);
      expect(summary.total).toBe(0);
      expect(summary.averageConfidence).toBe(0);
    });
  });

  describe('Sorting and filtering', () => {
    it('should sort items by confidence ascending', () => {
      const items = [
        { id: 1, confidence: 0.9 },
        { id: 2, confidence: 0.5 },
        { id: 3, confidence: 0.7 },
      ];

      const sorted = ConfidenceThresholds.sortByConfidence(items);

      expect(sorted[0].id).toBe(2);
      expect(sorted[0].confidence).toBe(0.5);
      expect(sorted[1].id).toBe(3);
      expect(sorted[1].confidence).toBe(0.7);
      expect(sorted[2].id).toBe(1);
      expect(sorted[2].confidence).toBe(0.9);
    });

    it('should filter items by confidence level', () => {
      const items = [
        { id: 1, confidence: 0.9 },
        { id: 2, confidence: 0.7 },
        { id: 3, confidence: 0.5 },
      ];

      const lowConfidence = ConfidenceThresholds.filterByLevel(items, 'low');

      expect(lowConfidence.length).toBe(1);
      expect(lowConfidence[0].id).toBe(3);
    });

    it('should filter multiple levels', () => {
      const items = [
        { id: 1, confidence: 0.9 },
        { id: 2, confidence: 0.7 },
        { id: 3, confidence: 0.5 },
      ];

      const needsAttention = ConfidenceThresholds.filterByLevel(items, ['medium', 'low']);

      expect(needsAttention.length).toBe(2);
      expect(needsAttention.map((i) => i.id).sort()).toEqual([2, 3]);
    });
  });
});
