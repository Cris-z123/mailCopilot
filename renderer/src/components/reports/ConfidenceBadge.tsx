/**
 * ConfidenceBadge Component
 *
 * Displays confidence level badge for action items.
 * Per FR-011:
 * - ≥0.8: No badge (high confidence)
 * - 0.6-0.79: Gray "[建议复核]" badge (needs review)
 * - <0.6: Prominent red "[来源待确认]" badge (source unconfirmed)
 *
 * Task: T051 [US2]
 * @module renderer/components/reports/ConfidenceBadge
 */

import React from 'react';
import { Badge } from '@renderer/components/ui/badge';
import { ConfidenceThresholds } from '@shared/utils/ConfidenceThresholds';

/**
 * ConfidenceBadge props
 */
export interface ConfidenceBadgeProps {
  /** Confidence score (0-1) */
  confidence: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ConfidenceBadge component
 *
 * Shows appropriate badge based on confidence level:
 * - High confidence (≥0.8): No badge
 * - Medium confidence (0.6-0.79): Gray "[建议复核]"
 * - Low confidence (<0.6): Prominent red "[来源待确认]"
 */
export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({
  confidence,
  className = '',
}) => {
  const classification = ConfidenceThresholds.classify(confidence);

  // High confidence: no badge shown
  if (classification.level === 'high') {
    return null;
  }

  // Medium confidence: gray badge
  if (classification.level === 'medium') {
    return (
      <Badge
        variant="secondary"
        className={`bg-gray-100 text-gray-700 border border-gray-300 font-medium ${className}`}
        data-testid="confidence-badge"
      >
        {classification.label}
      </Badge>
    );
  }

  // Low confidence: prominent red badge
  return (
    <Badge
      variant="destructive"
      className={`bg-red-100 text-red-700 border-2 border-red-300 font-semibold ${className}`}
      data-testid="confidence-badge"
    >
      {classification.label}
    </Badge>
  );
};

export default ConfidenceBadge;
