/**
 * TraceabilityInfo Component
 *
 * Displays traceability information for action items including:
 * - Sender email address
 * - Email date
 * - Subject (truncated to 30 chars)
 * - Message-ID or fingerprint
 * - File path to source email
 * - Copyable search string (per FR-004)
 *
 * Per US1 requirements: All items must display complete source information
 */

import React, { useState } from 'react';
import type { ItemSourceRef } from '../../../../shared/types/index.js';

/**
 * TraceabilityInfo component props
 */
interface TraceabilityInfoProps {
  source: ItemSourceRef;
}

/**
 * TraceabilityInfo component
 */
const TraceabilityInfo: React.FC<TraceabilityInfoProps> = ({ source }) => {
  const [copied, setCopied] = useState(false);

  /**
   * Copy search string to clipboard
   * Per FR-004: Copy Search Keywords button
   */
  const handleCopySearchString = async () => {
    try {
      await navigator.clipboard.writeText(source.search_string);
      setCopied(true);

      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('[TraceabilityInfo] Copy failed:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = source.search_string;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('[TraceabilityInfo] Fallback copy failed:', err);
      } finally {
        document.body.removeChild(textArea);
      }
    }
  };

  /**
   * Parse search string to extract components
   * Format: `from:sender subject:"snippet" date:YYYY-MM-DD`
   */
  const parseSearchString = () => {
    const fromMatch = source.search_string.match(/from:([^\s]+)/);
    const subjectMatch = source.search_string.match(/subject:"([^"]+)"/);
    const dateMatch = source.search_string.match(/date:(\d{4}-\d{2}-\d{2})/);

    return {
      sender: fromMatch ? fromMatch[1] : 'Unknown',
      subject: subjectMatch ? subjectMatch[1] : 'No subject',
      date: dateMatch ? dateMatch[1] : 'Unknown date',
    };
  };

  const parsed = parseSearchString();

  return (
    <div className="traceability-info">
      <h4 className="traceability-title">Source Information</h4>

      {/* Source metadata */}
      <div className="traceability-details">
        <div className="traceability-row">
          <span className="traceability-label">From:</span>
          <span className="traceability-value" title={parsed.sender}>
            {parsed.sender}
          </span>
        </div>

        <div className="traceability-row">
          <span className="traceability-label">Date:</span>
          <span className="traceability-value">{parsed.date}</span>
        </div>

        <div className="traceability-row">
          <span className="traceability-label">Subject:</span>
          <span className="traceability-value" title={parsed.subject}>
            {parsed.subject.length > 30
              ? `${parsed.subject.substring(0, 30)}...`
              : parsed.subject}
          </span>
        </div>

        <div className="traceability-row">
          <span className="traceability-label">Identifier:</span>
          <span
            className="traceability-value traceability-hash"
            title={source.email_hash}
          >
            {source.email_hash.substring(0, 16)}...
          </span>
        </div>

        <div className="traceability-row">
          <span className="traceability-label">File:</span>
          <span
            className="traceability-value traceability-filepath"
            title={source.file_path}
          >
            {source.file_path.length > 50
              ? `...${source.file_path.substring(source.file_path.length - 50)}`
              : source.file_path}
          </span>
        </div>
      </div>

      {/* Search string section */}
      <div className="search-string-section">
        <div className="search-string-header">
          <span className="search-string-label">Search Keywords:</span>
          <button
            className={`copy-button ${copied ? 'copied' : ''}`}
            onClick={handleCopySearchString}
            title="Copy search keywords to clipboard"
            type="button"
          >
            {copied ? '✓ Copied!' : '📋 Copy Search Keywords'}
          </button>
        </div>
        <code className="search-string-code" title={source.search_string}>
          {source.search_string}
        </code>
        <p className="search-string-hint">
          Paste this into your email client search to locate the source email
        </p>
      </div>

      {/* Confidence indicator */}
      {source.confidence !== undefined && (
        <div className="traceability-confidence">
          <span className="confidence-label">Source Confidence:</span>
          <span
            className={`confidence-indicator ${
              source.confidence >= 0.8
                ? 'high'
                : source.confidence >= 0.6
                  ? 'medium'
                  : 'low'
            }`}
          >
            {Math.round(source.confidence * 100)}%
          </span>
        </div>
      )}
    </div>
  );
};

export default TraceabilityInfo;
