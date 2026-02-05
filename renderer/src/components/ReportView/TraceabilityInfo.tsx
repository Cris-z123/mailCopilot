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
import { Copy, Check, Mail, Calendar, FileText, Hash } from 'lucide-react';
import { Button } from '@renderer/components/ui/button.js';
import { Badge } from '@renderer/components/ui/badge.js';
import type { ItemSourceRef } from '@shared/types/index.js';

/**
 * TraceabilityInfo component props
 */
interface TraceabilityInfoProps {
  source: ItemSourceRef;
  sourceIndex?: number;
}

/**
 * TraceabilityInfo component
 */
const TraceabilityInfo: React.FC<TraceabilityInfoProps> = ({ source, sourceIndex = 0 }) => {
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
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">
          Source Information {sourceIndex > 0 && `#${sourceIndex + 1}`}
        </h4>
        {source.confidence !== undefined && (
          <Badge
            variant="outline"
            className={
              source.confidence >= 0.8
                ? 'border-green-500 text-green-700 dark:text-green-400'
                : source.confidence >= 0.6
                  ? 'border-blue-500 text-blue-700 dark:text-blue-400'
                  : 'border-orange-500 text-orange-700 dark:text-orange-400'
            }
          >
            {Math.round(source.confidence * 100)}% confidence
          </Badge>
        )}
      </div>

      {/* Source metadata grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        {/* Sender */}
        <div className="flex items-start gap-2">
          <Mail className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground block mb-0.5">From</span>
            <span className="text-foreground font-mono text-xs break-all" title={parsed.sender}>
              {parsed.sender}
            </span>
          </div>
        </div>

        {/* Date */}
        <div className="flex items-start gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground block mb-0.5">Date</span>
            <span className="text-foreground">{parsed.date}</span>
          </div>
        </div>

        {/* Subject */}
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground block mb-0.5">Subject</span>
            <span className="text-foreground text-xs break-words" title={parsed.subject}>
              {parsed.subject.length > 30
                ? `${parsed.subject.substring(0, 30)}...`
                : parsed.subject}
            </span>
          </div>
        </div>

        {/* Email Hash (Message-ID or fingerprint) */}
        <div className="flex items-start gap-2">
          <Hash className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground block mb-0.5">Identifier</span>
            <span
              className="text-foreground font-mono text-xs break-all"
              title={source.email_hash}
            >
              {source.email_hash.substring(0, 16)}...
            </span>
          </div>
        </div>
      </div>

      {/* File path */}
      <div className="bg-muted/50 rounded-md p-3">
        <span className="text-xs text-muted-foreground block mb-1">File Path</span>
        <span
          className="text-xs font-mono text-foreground break-all"
          title={source.file_path}
        >
          {source.file_path.length > 60
            ? `...${source.file_path.substring(source.file_path.length - 60)}`
            : source.file_path}
        </span>
      </div>

      {/* Search string section */}
      <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Search Keywords</span>
          <Button
            size="sm"
            variant={copied ? 'default' : 'outline'}
            onClick={handleCopySearchString}
            className="h-8"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 mr-1" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 mr-1" />
                Copy
              </>
            )}
          </Button>
        </div>
        <code
          className="block text-xs font-mono bg-background p-3 rounded border border-border break-all"
          title={source.search_string}
        >
          {source.search_string}
        </code>
        <p className="text-xs text-muted-foreground mt-2">
          💡 Paste this into your email client search to locate the source email
        </p>
      </div>
    </div>
  );
};

export default TraceabilityInfo;
