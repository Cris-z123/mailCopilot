/**
 * ReportView Component
 *
 * Main report view component for displaying action items with source traceability.
 *
 * Per US1 requirements:
 * - Display action items with complete source info
 * - Show sender, date, subject, Message-ID/fingerprint, file path
 * - Integrate with TraceabilityInfo component for search strings
 */

import React, { useEffect } from 'react';
import { useReportStore } from '../../stores/reportStore.js';
import { selectItems, selectLoading, selectError } from '../../stores/reportStore.js';
import TraceabilityInfo from './TraceabilityInfo.js';
import type { DisplayItem } from '../../../../shared/types/index.js';

/**
 * ReportView props
 */
interface ReportViewProps {
  reportDate?: string;
}

/**
 * ReportView component
 */
const ReportView: React.FC<ReportViewProps> = ({ reportDate }) => {
  const items = useReportStore(selectItems);
  const loading = useReportStore(selectLoading);
  const error = useReportStore(selectError);
  const loadReport = useReportStore((state) => state.loadReport);

  // Load report on mount if reportDate is provided
  useEffect(() => {
    if (reportDate) {
      loadReport(reportDate);
    }
  }, [reportDate, loadReport]);

  /**
   * Render loading state
   */
  if (loading) {
    return (
      <div className="report-view loading">
        <div className="loading-spinner" />
        <p>Processing emails...</p>
      </div>
    );
  }

  /**
   * Render error state
   */
  if (error) {
    return (
      <div className="report-view error">
        <h2>Error Loading Report</h2>
        <p className="error-message">{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  /**
   * Render empty state
   */
  if (items.length === 0) {
    return (
      <div className="report-view empty">
        <h2>No Action Items Found</h2>
        <p>No action items were extracted from the emails.</p>
      </div>
    );
  }

  /**
   * Render report with items
   */
  return (
    <div className="report-view">
      <header className="report-header">
        <h1>Daily Report</h1>
        {reportDate && <p className="report-date">{reportDate}</p>}
        <p className="item-count">{items.length} action items found</p>
      </header>

      <div className="report-items">
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

  return (
    <article
      className={`report-item ${confidenceLevel} ${isVerified ? 'verified' : 'unverified'} ${needsReview ? 'needs-review' : ''}`}
    >
      {/* Item content */}
      <div className="item-content">
        <h3 className="item-text">{item.content}</h3>

        {/* Confidence badge */}
        <div className="item-meta">
          <span className={`confidence-badge ${confidenceLevel}`}>
            {Math.round(item.confidence_score * 100)}% confidence
          </span>

          {/* Source status badge */}
          {!isVerified && (
            <span className="status-badge unverified">
              [来源待确认]
            </span>
          )}

          {/* Needs review badge */}
          {needsReview && isVerified && (
            <span className="status-badge review">
              [建议复核]
            </span>
          )}

          {/* Type badge */}
          <span className={`type-badge ${item.item_type}`}>
            {item.item_type === 'completed' ? '✓ Completed' : '○ Pending'}
          </span>
        </div>

        {/* Evidence */}
        {item.sources.length > 0 && item.sources[0].evidence_text && (
          <p className="item-evidence">
            <strong>Evidence:</strong> {item.sources[0].evidence_text}
          </p>
        )}
      </div>

      {/* Traceability info */}
      <div className="item-traceability">
        {item.sources.map((source) => (
          <TraceabilityInfo
            key={`${item.id}-source-${source.email_hash}`}
            source={source}
          />
        ))}
      </div>

      {/* Source details (expanded for low-confidence items) */}
      {needsReview && (
        <details className="source-details" open>
          <summary>Source Details (Low Confidence)</summary>
          <div className="source-details-content">
            <p><strong>Confidence Score:</strong> {Math.round(item.confidence_score * 100)}%</p>
            <p><strong>Source Status:</strong> {isVerified ? 'Verified' : 'Unverified'}</p>
            <p><strong>Number of Source Emails:</strong> {item.sources.length}</p>
            {item.sources.map((source, sourceIndex) => (
              <div key={source.email_hash} className="source-detail-item">
                <p><strong>Source {sourceIndex + 1}:</strong></p>
                <ul>
                  <li><strong>File Path:</strong> {source.file_path}</li>
                  <li><strong>Email Hash:</strong> {source.email_hash}</li>
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </article>
  );
};

/**
 * Get confidence level for styling
 */
function getConfidenceLevel(confidence: number): string {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

export default ReportView;
