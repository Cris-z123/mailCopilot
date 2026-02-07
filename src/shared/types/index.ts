/**
 * Shared TypeScript Types
 *
 * Type definitions shared between main and renderer processes.
 * These types provide type safety across IPC boundaries.
 */

import type { Item, TodoItemWithSources, DailyReportSummary, ItemSourceRef } from '../schemas/validation.js';

// Re-export frequently used types from schemas
export type { Item, TodoItemWithSources, DailyReportSummary, ItemSourceRef };

/**
 * Action item display type for renderer
 */
export interface DisplayItem {
  id: string; // UUID for React keys
  item_id: string;
  report_date: string;
  content: string;
  item_type: 'completed' | 'pending';
  source_status: 'verified' | 'unverified';
  confidence_score: number;
  tags: string[];
  feedback_type?: 'content_error' | 'priority_error' | 'not_actionable' | 'source_error';
  created_at: number;
  sources: ItemSourceRef[];
}

/**
 * Report view state
 */
export interface ReportViewState {
  items: DisplayItem[];
  loading: boolean;
  error: string | null;
  reportDate: string | null;
  summary: DailyReportSummary | null;
}

/**
 * Traceability info display type
 */
export interface TraceabilityDisplay {
  sender: string;
  date: string;
  subject: string;
  messageId?: string;
  fingerprint: string;
  filePath: string;
  searchString: string;
}

/**
 * IPC request/response types
 */
export interface IPCRequest<T = unknown> {
  channel: string;
  payload?: T;
}

export interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Electron API types for renderer process
 */
export interface ElectronAPI {
  llm: {
    generate: (request: {
      emails: Array<{ filePath: string; format: string }>;
      mode: 'local' | 'remote';
      reportDate: string;
    }) => Promise<{
      success: boolean;
      items: Item[];
      processed_emails: Array<{
        email_hash: string;
        search_string: string;
        file_path: string;
        extract_status: string;
      }>;
      skipped_emails: number;
      reprocessed_emails: number;
    }>;
  };
  db: {
    queryHistory: (request: {
      query: string;
      params?: Record<string, unknown>;
    }) => Promise<TodoItemWithSources[]>;
    export: (request: {
      format: 'markdown' | 'pdf';
      reportDate?: string;
      startDate?: string;
      endDate?: string;
      includeAll?: boolean;
    }) => Promise<{
      success: boolean;
      filePath: string;
      format: string;
      itemCount: number;
    }>;
  };
  config: {
    get: (keys?: string[]) => Promise<Record<string, unknown>>;
    set: (updates: Record<string, unknown>) => Promise<{
      success: boolean;
      updated: string[];
    }>;
  };
  app: {
    checkUpdate: (mode: 'auto' | 'manual') => Promise<{
      hasUpdate: boolean;
      version?: string;
      releaseNotes?: string;
      downloadUrl?: string;
    }>;
  };
  email: {
    fetchMeta: (filePath: string, format: string) => Promise<{
      success: boolean;
      metadata?: {
        from?: string;
        subject?: string;
        date?: string;
        attachmentCount?: number;
        size?: number;
        format?: string;
      };
      error?: string;
    }>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export default {};
