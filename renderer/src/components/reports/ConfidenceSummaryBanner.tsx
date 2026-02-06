/**
 * ConfidenceSummaryBanner Component
 *
 * Displays summary banner with confidence level counts.
 * Per FR-012: "✅ 高置信度：X条, ⚠️ 需复核：Y条, ❓ 来源待确认：Z条"
 *
 * Task: T052 [P] [US2]
 * @module renderer/components/reports/ConfidenceSummaryBanner
 */

import React from 'react';
import { Badge } from '@renderer/components/ui/badge';

/**
 * ConfidenceSummaryBanner props
 */
export interface ConfidenceSummaryBannerProps {
  /** Number of high confidence items (≥0.8) */
  highCount: number;
  /** Number of medium confidence items (0.6-0.79) */
  mediumCount: number;
  /** Number of low confidence items (<0.6) */
  lowCount: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ConfidenceSummaryBanner component
 *
 * Shows a summary banner at the top of the report with:
 * - Green badge: ✅ 高置信度：X条
 * - Gray badge: ⚠️ 需复核：Y条
 * - Red badge: ❓ 来源待确认：Z条
 */
export const ConfidenceSummaryBanner: React.FC<ConfidenceSummaryBannerProps> = ({
  highCount,
  mediumCount,
  lowCount,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 p-4 bg-card border-b rounded-lg mb-6 ${className}`}
      data-testid="confidence-summary-banner"
    >
      {/* High confidence */}
      <Badge
        variant="outline"
        className="text-green-600 border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium"
      >
        ✅ 高置信度：{highCount}条
      </Badge>

      {/* Medium confidence */}
      <Badge
        variant="outline"
        className="text-gray-600 border-gray-300 bg-gray-50 px-3 py-1.5 text-sm font-medium"
      >
        ⚠️ 需复核：{mediumCount}条
      </Badge>

      {/* Low confidence */}
      <Badge
        variant="outline"
        className="text-red-600 border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium"
      >
        ❓ 来源待确认：{lowCount}条
      </Badge>
    </div>
  );
};
