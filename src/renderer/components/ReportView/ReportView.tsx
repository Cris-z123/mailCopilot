/**
 * ReportView Component
 *
 * Main report view component for displaying action items with source traceability.
 *
 * Per US1 requirements:
 * - Display action items with complete source info
 * - Show sender, date, subject, Message-ID/fingerprint, file path
 * - Integrate with TraceabilityInfo component for search strings
 *
 * Per US2 requirements (T053):
 * - Apply light yellow background for <0.6 confidence items
 * - Display expanded source info for low confidence items
 * - Show ConfidenceSummaryBanner at top
 * - Use ConfidenceBadge for confidence indicators
 */

import React, { useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { useReportStore } from '@renderer/stores/reportStore';
import { selectItems, selectLoading, selectError } from '@renderer/stores/reportStore';
import { TraceabilityInfo } from './TraceabilityInfo';
import { ConfidenceBadge, ConfidenceSummaryBanner } from '@renderer/components/reports';
import { ConfidenceThresholds } from '@shared/utils/ConfidenceThresholds';
import { Button } from '@renderer/components/ui/button';
import { Card, CardContent } from '@renderer/components/ui/card';
import { Badge } from '@renderer/components/ui/badge';
import type { DisplayItem } from '@shared/types';

/**
 * ReportView props
 */
export interface ReportViewProps {
  reportDate?: string;
  items?: DisplayItem[]; // For testing purposes
  emails?: any[]; // For testing purposes
}

/**
 * ReportView component
 */
const ReportView: React.FC<ReportViewProps> = ({ reportDate, items: itemsProp, emails: emailsProp }) => {
  // Use items from props if provided (for testing), otherwise from store
  const storeItems = useReportStore(selectItems);
  const loading = useReportStore(selectLoading);
  const error = useReportStore(selectError);
  const loadReport = useReportStore((state) => state.loadReport);

  // Use prop items for testing, otherwise store items
  const items = itemsProp ?? storeItems;

  // Calculate confidence summary for the banner (T052)
  const summary = useMemo(() => {
    return ConfidenceThresholds.getSummary(items);
  }, [items]);

  // Load report on mount if reportDate is provided and items not from props
  useEffect(() => {
    if (reportDate && !itemsProp) {
      loadReport(reportDate);
    }
  }, [reportDate, loadReport, itemsProp]);

  /**
   * Render loading state
   */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground text-lg">Processing emails...</p>
        <p className="text-sm text-muted-foreground mt-2">This may take a few moments</p>
      </div>
    );
  }

  /**
   * Render error state
   */
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold text-foreground mb-2">Error Loading Report</h2>
        <p className="text-muted-foreground text-center mb-6 max-w-md">{error}</p>
        <Button onClick={() => window.location.reload()} variant="default" size="lg">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  /**
   * Render empty state
   */
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Inbox className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold text-foreground mb-2">No Action Items Found</h2>
        <p className="text-muted-foreground text-center max-w-md">
          No action items were extracted from the emails.
        </p>
      </div>
    );
  }

  /**
   * Render report with items
   */
  return (
    <div className="min-h-screen bg-background" data-testid="daily-report">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Daily Report</h1>
              {reportDate && (
                <p className="text-muted-foreground mt-1">{reportDate}</p>
              )}
            </div>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </Badge>
          </div>
        </div>
      </header>

      {/* Confidence Summary Banner (T052) */}
      <div className="container mx-auto px-4 pt-6">
        <ConfidenceSummaryBanner
          highCount={summary.highCount}
          mediumCount={summary.mediumCount}
          lowCount={summary.lowCount}
        />
      </div>

      {/* Report items */}
      <div className="container mx-auto px-4 pb-6 space-y-4">
        {items.map((item) => (
          <ReportItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
};

/**
 * Individual report item component
 */
interface ReportItemProps {
  item: DisplayItem;
}

const ReportItem: React.FC<ReportItemProps> = ({ item }) => {
  const isVerified = item.source_status === 'verified';
  const confidenceLevel = getConfidenceLevel(item.confidence_score);
  const needsReview = item.confidence_score < 0.8;
  const isLowConfidence = item.confidence_score < 0.6;

  // Background color for low confidence items (per US2 requirement - T053)
  const cardBgClass = isLowConfidence ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800' : '';

  return (
    <Card className={`overflow-hidden ${cardBgClass}`} data-item-id={item.item_id}>
      <CardContent className="p-6">
        {/* Item content */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground mb-3">{item.content}</h3>

          {/* Badges - updated to use ConfidenceBadge (T051) */}
          <div className="flex flex-wrap gap-2 mb-3">
            {/* Confidence badge from new component */}
            <ConfidenceBadge confidence={item.confidence_score} />

            {/* Source status badge */}
            {!isVerified && (
              <Badge variant="outline" className="border-orange-500 text-orange-700 dark:text-orange-400">
                [来源待确认]
              </Badge>
            )}

            {/* Type badge */}
            <Badge
              variant={item.item_type === 'completed' ? 'default' : 'outline'}
              className={item.item_type === 'completed' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {item.item_type === 'completed' ? '✓ Completed' : '○ Pending'}
            </Badge>
          </div>

          {/* Evidence */}
          {item.sources.length > 0 && item.sources[0].evidence_text && (
            <div className="bg-muted/50 rounded-md p-3 mt-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Evidence:</span> {item.sources[0].evidence_text}
              </p>
            </div>
          )}
        </div>

        {/* Traceability info */}
        <div className="space-y-4">
          {item.sources.map((source, index) => (
            <div key={`${item.id}-source-${source.email_hash}`} className={index > 0 ? 'pt-4 border-t' : ''}>
              <TraceabilityInfo source={source} sourceIndex={index} />
            </div>
          ))}
        </div>

        {/* Source details (expanded for low confidence items per T053) */}
        {needsReview && (
          <details className="mt-4 group" open={isLowConfidence}>
            <summary className="cursor-pointer list-none flex items-center justify-between p-3 bg-muted/50 rounded-md hover:bg-muted transition-colors">
              <span className="font-medium text-foreground">
                Source Details {isLowConfidence && '(Low Confidence)'}
              </span>
              <Badge variant="outline" className="text-xs">
                {isLowConfidence ? 'Shown by default' : 'Click to expand'}
              </Badge>
            </summary>
            <div className="mt-3 p-4 bg-muted/30 rounded-md space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-foreground">Confidence Score:</span>{' '}
                  <span className="text-muted-foreground">{Math.round(item.confidence_score * 100)}%</span>
                </div>
                <div>
                  <span className="font-medium text-foreground">Source Status:</span>{' '}
                  <span className={isVerified ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}>
                    {isVerified ? 'Verified' : 'Unverified'}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-foreground">Number of Sources:</span>{' '}
                  <span className="text-muted-foreground">{item.sources.length}</span>
                </div>
              </div>
              {item.sources.map((source, sourceIndex) => (
                <div key={source.email_hash} className="mt-3 pt-3 border-t">
                  <p className="font-medium text-foreground mb-1">Source {sourceIndex + 1}:</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>
                      <span className="font-medium text-foreground">File Path:</span> {source.file_path}
                    </li>
                    <li className="font-mono text-xs">
                      <span className="font-medium text-foreground">Email Hash:</span> {source.email_hash}
                    </li>
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Get confidence level for styling
 */
function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

export default ReportView;
