/**
 * Confidence Calculator
 *
 * Implements dual-engine confidence calculation per plan.md R0-8 and FR-010.
 * Combines rule engine and LLM confidence scores with configurable weighting.
 *
 * @module main/llm/ConfidenceCalculator
 */

import { logger } from '../config/logger.js';
import type { ExtractedItem } from './LLMAdapter.js';

/**
 * Rule engine execution result
 *
 * Per plan.md Decision 2: Rule engine provides domain-specific confidence
 * (keywords, sender whitelist, deadline detection, priority detection).
 */
export interface RuleEngineResult {
  /** Rule-based confidence score (0-100) */
  score: number;

  /** Number of rules triggered */
  rulesTriggered: number;

  /** Rule execution details (for debugging) */
  details: {
    /** Deadline keyword detected */
    hasDeadlineKeyword: boolean;

    /** Priority keyword detected */
    hasPriorityKeyword: boolean;

    /** Sender in whitelist */
    isWhitelistedSender: boolean;

    /** Action verbs detected */
    actionVerbCount: number;
  };
}

/**
 * Confidence calculation options
 *
 * Per FR-010: Adjust weights when LLM output schema validation fails.
 */
export interface ConfidenceCalculationOptions {
  /** Whether LLM output schema validation failed (degradation mode) */
  isDegraded?: boolean;

  /** Custom weight for rule engine (default: 0.5 normal, 0.6 degraded) */
  ruleWeight?: number;

  /** Custom weight for LLM (default: 0.5 normal, 0.2 degraded) */
  llmWeight?: number;

  /** Maximum confidence cap (default: 0.6 per FR-010) */
  maxConfidence?: number;
}

/**
 * Confidence calculation result
 *
 * Contains final confidence score and breakdown for debugging/audit.
 */
export interface ConfidenceResult {
  /** Final confidence score (0.0-1.0) */
  confidence: number;

  /** Weighted rule engine contribution */
  ruleContribution: number;

  /** Weighted LLM contribution */
  llmContribution: number;

  /** Whether calculation was in degradation mode */
  isDegraded: boolean;

  /** Calculation details for debugging */
  details: {
    ruleScore: number;
    llmScore: number;
    ruleWeight: number;
    llmWeight: number;
    capApplied: boolean;
  };
}

/**
 * Default confidence calculation weights
 *
 * Per plan.md Decision 2 and FR-010:
 * - Normal mode: rules 50% + LLM 50%
 * - Degraded mode: rules 60% + LLM 20% (LLM weight halved)
 */
const DEFAULT_WEIGHTS = {
  normal: {
    rule: 0.5,
    llm: 0.5,
  },
  degraded: {
    rule: 0.6,
    llm: 0.2,
  },
} as const;

/**
 * Maximum confidence cap per FR-010
 *
 * Items marked with confidence < 0.6 have a user-confirmed error rate of ≥40%
 * (per SC-005), validating that low-confidence warning system works.
 */
const DEFAULT_MAX_CONFIDENCE = 0.6;

/**
 * Confidence Calculator
 *
 * Implements dual-engine confidence calculation combining rule engine and LLM scores.
 *
 * Per plan.md:
 * - R0-8: Dual-engine confidence calculation (rules 50% + LLM 50%)
 * - FR-010: Schema failure adjustment (rules 60% + LLM 20%, capped at 0.6)
 * - FR-013: Cap confidence at 0.6 for items from non-standard formats
 *
 * Example:
 * ```typescript
 * const ruleResult: RuleEngineResult = { score: 80, rulesTriggered: 3, details: {...} };
 * const llmItem: ExtractedItem = { confidence: 90, ... };
 * const result = ConfidenceCalculator.calculate(ruleResult, llmItem);
 * console.log(`Final confidence: ${result.confidence}`); // 0.5 * 0.8 + 0.5 * 0.9 = 0.85 → 0.6 (capped)
 * ```
 */
export class ConfidenceCalculator {
  /**
   * Calculate final confidence from rule engine and LLM scores
   *
   * @param ruleResult - Rule engine execution result (score 0-100)
   * @param llmItem - LLM-extracted item with confidence score (0-100)
   * @param options - Calculation options (weights, degradation mode, cap)
   * @returns Confidence result with final score and breakdown
   *
   * Calculation:
   * 1. Normalize scores to 0.0-1.0 range
   * 2. Apply weighted sum: (ruleScore × ruleWeight) + (llmScore × llmWeight)
   * 3. Cap at maxConfidence (default: 0.6 per FR-010)
   *
   * Per FR-010:
   * - Normal mode: rules 50% + LLM 50%
   * - Degraded mode (schema validation failed): rules 60% + LLM 20%
   * - Maximum confidence: 0.6
   *
   * Per FR-013:
   * - Items from non-standard formats (.html, .txt) capped at 0.6
   */
  static calculate(
    ruleResult: RuleEngineResult,
    llmItem: ExtractedItem,
    options: ConfidenceCalculationOptions = {}
  ): ConfidenceResult {
    // Determine weights based on degradation mode
    const isDegraded = options.isDegraded ?? false;
    const ruleWeight = options.ruleWeight ?? (isDegraded ? DEFAULT_WEIGHTS.degraded.rule : DEFAULT_WEIGHTS.normal.rule);
    const llmWeight = options.llmWeight ?? (isDegraded ? DEFAULT_WEIGHTS.degraded.llm : DEFAULT_WEIGHTS.normal.llm);
    const maxConfidence = options.maxConfidence ?? DEFAULT_MAX_CONFIDENCE;

    // Normalize scores to 0.0-1.0 range
    const ruleScoreNormalized = Math.min(Math.max(ruleResult.score / 100, 0), 1);
    const llmScoreNormalized = Math.min(Math.max(llmItem.confidence / 100, 0), 1);

    // Calculate weighted contributions
    const ruleContribution = ruleScoreNormalized * ruleWeight;
    const llmContribution = llmScoreNormalized * llmWeight;

    // Calculate raw confidence
    const rawConfidence = ruleContribution + llmContribution;

    // Apply confidence cap
    const cappedConfidence = Math.min(rawConfidence, maxConfidence);
    const capApplied = rawConfidence > maxConfidence;

    const result: ConfidenceResult = {
      confidence: cappedConfidence,
      ruleContribution,
      llmContribution,
      isDegraded,
      details: {
        ruleScore: ruleResult.score,
        llmScore: llmItem.confidence,
        ruleWeight,
        llmWeight,
        capApplied,
      },
    };

    logger.debug('ConfidenceCalculator', 'Confidence calculated', {
      ruleScore: ruleResult.score,
      llmScore: llmItem.confidence,
      ruleWeight,
      llmWeight,
      rawConfidence,
      cappedConfidence,
      isDegraded,
      capApplied,
      rulesTriggered: ruleResult.rulesTriggered,
    });

    return result;
  }

  /**
   * Calculate confidence for multiple items (batch processing)
   *
   * @param ruleResults - Array of rule engine results (one per item)
   * @param llmItems - Array of LLM-extracted items
   * @param options - Calculation options
   * @returns Array of confidence results
   *
   * Validates input arrays have matching lengths before calculation.
   */
  static calculateBatch(
    ruleResults: RuleEngineResult[],
    llmItems: ExtractedItem[],
    options: ConfidenceCalculationOptions = {}
  ): ConfidenceResult[] {
    if (ruleResults.length !== llmItems.length) {
      throw new Error(
        `Rule results count (${ruleResults.length}) must match LLM items count (${llmItems.length})`
      );
    }

    logger.info('ConfidenceCalculator', 'Calculating confidence for batch', {
      itemCount: llmItems.length,
      isDegraded: options.isDegraded ?? false,
    });

    const results: ConfidenceResult[] = [];

    for (let i = 0; i < llmItems.length; i++) {
      const result = this.calculate(ruleResults[i], llmItems[i], options);
      results.push(result);
    }

    const avgConfidence =
      results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

    logger.info('ConfidenceCalculator', 'Batch confidence calculation complete', {
      itemCount: results.length,
      avgConfidence: avgConfidence.toFixed(3),
      minConfidence: Math.min(...results.map((r) => r.confidence)).toFixed(3),
      maxConfidence: Math.max(...results.map((r) => r.confidence)).toFixed(3),
    });

    return results;
  }

  /**
   * Get default weights for normal or degraded mode
   *
   * @param isDegraded - Whether to return degraded mode weights
   * @returns Rule and LLM weights
   */
  static getDefaultWeights(isDegraded = false): { rule: number; llm: number } {
    return isDegraded ? { ...DEFAULT_WEIGHTS.degraded } : { ...DEFAULT_WEIGHTS.normal };
  }

  /**
   * Check if confidence score is low (needs user verification)
   *
   * Per spec.md FR-011:
   * - Confidence ≥0.8: Normal display
   * - Confidence 0.6-0.79: Gray "[建议复核]" (Suggested Review) label
   * - Confidence <0.6: Light yellow background, "[来源待确认]" (Source Pending Confirmation) label
   *
   * @param confidence - Confidence score (0.0-1.0)
   * @returns 'high' | 'medium' | 'low'
   */
  static getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
    if (confidence >= 0.8) {
      return 'high';
    } else if (confidence >= 0.6) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get display label for confidence level
   *
   * Per spec.md FR-011:
   * - High confidence (≥0.8): No label
   * - Medium confidence (0.6-0.79): "[建议复核]" (Suggested Review)
   * - Low confidence (<0.6): "[来源待确认]" (Source Pending Confirmation)
   *
   * @param confidence - Confidence score (0.0-1.0)
   * @returns Display label or empty string
   */
  static getConfidenceLabel(confidence: number): string {
    const level = this.getConfidenceLevel(confidence);

    switch (level) {
      case 'high':
        return '';
      case 'medium':
        return '[建议复核]';
      case 'low':
        return '[来源待确认]';
    }
  }

  /**
   * Validate confidence calculation result
   *
   * @param result - Confidence result to validate
   * @returns True if result is valid
   */
  static isValid(result: ConfidenceResult): boolean {
    return (
      result.confidence >= 0 &&
      result.confidence <= 1 &&
      result.ruleContribution >= 0 &&
      result.llmContribution >= 0 &&
      result.details.ruleWeight >= 0 &&
      result.details.llmWeight >= 0 &&
      result.details.ruleWeight + result.details.llmWeight <= 1
    );
  }

  /**
   * Create degraded mode rule result (fallback when rule engine fails)
   *
   * @param errorReason - Reason for rule engine failure
   * @returns Minimal rule result with low confidence
   */
  static createDegradedRuleResult(errorReason: string): RuleEngineResult {
    logger.warn('ConfidenceCalculator', 'Creating degraded rule result', {
      errorReason,
    });

    return {
      score: 30, // Low confidence fallback
      rulesTriggered: 0,
      details: {
        hasDeadlineKeyword: false,
        hasPriorityKeyword: false,
        isWhitelistedSender: false,
        actionVerbCount: 0,
      },
    };
  }
}

export default ConfidenceCalculator;
