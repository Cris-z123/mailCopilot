/**
 * Confidence Thresholds Utility
 *
 * Provides confidence classification, aggregation, and filtering for action items.
 * Per plan.md FR-011:
 * - ≥0.8: High confidence (no special styling)
 * - 0.6-0.79: Medium confidence ("[建议复核]" badge)
 * - <0.6: Low confidence ("[来源待确认]" badge)
 *
 * @module main/llm/ConfidenceThresholds
 */

/**
 * Confidence level classification
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Classification result
 */
export interface ClassificationResult {
  level: ConfidenceLevel;
  label: string;
  needsWarning: boolean;
  needsReview: boolean;
}

/**
 * Visual configuration for styling
 */
export interface ClassConfig {
  backgroundColor: string;
  borderColor: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  badgeText: string;
}

/**
 * Summary statistics
 */
export interface ConfidenceSummary {
  highCount: number;
  mediumCount: number;
  lowCount: number;
  total: number;
  averageConfidence: number;
}

/**
 * Item with confidence score
 */
export interface ConfidenceItem {
  id?: number | string;
  confidence: number;
  [key: string]: unknown;
}

/**
 * Confidence Thresholds Utility Class
 */
export class ConfidenceThresholds {
  /**
   * Threshold constants
   */
  private static readonly HIGH_THRESHOLD = 0.8;
  private static readonly MEDIUM_THRESHOLD = 0.6;

  /**
   * Classify a confidence score into a level
   *
   * @param confidence - Confidence score between 0 and 1
   * @returns Classification result
   * @throws Error if confidence is invalid
   */
  static classify(confidence: number): ClassificationResult {
    // Validate input
    if (isNaN(confidence)) {
      throw new Error('Confidence score must be a valid number');
    }
    if (confidence < 0 || confidence > 1) {
      throw new Error('Confidence score must be between 0 and 1');
    }

    // High confidence (≥0.8)
    if (confidence >= this.HIGH_THRESHOLD) {
      return {
        level: 'high',
        label: '',
        needsWarning: false,
        needsReview: false,
      };
    }

    // Medium confidence (0.6-0.79)
    if (confidence >= this.MEDIUM_THRESHOLD) {
      return {
        level: 'medium',
        label: '[建议复核]',
        needsWarning: false,
        needsReview: true,
      };
    }

    // Low confidence (<0.6)
    return {
      level: 'low',
      label: '[来源待确认]',
      needsWarning: true,
      needsReview: false,
    };
  }

  /**
   * Get visual configuration for a confidence score
   *
   * @param confidence - Confidence score between 0 and 1
   * @returns Visual configuration
   */
  static getClassConfig(confidence: number): ClassConfig {
    const result = this.classify(confidence);

    switch (result.level) {
      case 'high':
        return {
          backgroundColor: 'transparent',
          borderColor: 'border-gray-200',
          badgeVariant: 'default',
          badgeText: '',
        };

      case 'medium':
        return {
          backgroundColor: 'bg-gray-50',
          borderColor: 'border-gray-300',
          badgeVariant: 'secondary',
          badgeText: '[建议复核]',
        };

      case 'low':
        return {
          backgroundColor: 'bg-yellow-50',
          borderColor: 'border-yellow-300',
          badgeVariant: 'destructive',
          badgeText: '[来源待确认]',
        };
    }
  }

  /**
   * Count items by confidence level
   *
   * @param items - Items with confidence scores
   * @returns Counts by level
   */
  static countByLevel(items: ConfidenceItem[]): Record<ConfidenceLevel, number> & { total: number } {
    const counts = {
      high: 0,
      medium: 0,
      low: 0,
      total: items.length,
    };

    for (const item of items) {
      const result = this.classify(item.confidence);
      counts[result.level]++;
    }

    return counts;
  }

  /**
   * Calculate summary statistics
   *
   * @param items - Items with confidence scores
   * @returns Summary statistics
   */
  static getSummary(items: ConfidenceItem[]): ConfidenceSummary {
    const counts = this.countByLevel(items);

    let totalConfidence = 0;
    for (const item of items) {
      totalConfidence += item.confidence;
    }

    const averageConfidence = items.length > 0 ? totalConfidence / items.length : 0;

    return {
      highCount: counts.high,
      mediumCount: counts.medium,
      lowCount: counts.low,
      total: counts.total,
      averageConfidence,
    };
  }

  /**
   * Sort items by confidence (ascending - lowest first)
   *
   * @param items - Items to sort
   * @returns Sorted items
   */
  static sortByConfidence<T extends ConfidenceItem>(items: T[]): T[] {
    return [...items].sort((a, b) => a.confidence - b.confidence);
  }

  /**
   * Filter items by confidence level
   *
   * @param items - Items to filter
   * @param level - Level(s) to include
   * @returns Filtered items
   */
  static filterByLevel<T extends ConfidenceItem>(
    items: T[],
    level: ConfidenceLevel | ConfidenceLevel[]
  ): T[] {
    const levels = Array.isArray(level) ? level : [level];

    return items.filter((item) => {
      const result = this.classify(item.confidence);
      return levels.includes(result.level);
    });
  }
}
