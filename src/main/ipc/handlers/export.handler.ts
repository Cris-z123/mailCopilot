/**
 * Feedback Export IPC Handler
 *
 * Handles IPC communication for feedback export operations.
 * Per plan.md US3: Export unencrypted feedback data as file.
 *
 * @module main/ipc/handlers/export.handler
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { logger } from '../../config/logger.js';
import DatabaseManager from '../../database/Database.js';
import { ConfigManager } from '../../config/ConfigManager.js';
import {
  FeedbackExportRequestSchema,
  type FeedbackExportResponse,
} from '../../../shared/schemas/validation.js';
import { promises as fs } from 'fs';

/**
 * Generate unique request ID for tracking
 *
 * @returns Request ID string
 */
function generateRequestId(): string {
  return `export_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Register Feedback Export IPC handlers
 *
 * Sets up IPC channel listeners for feedback export.
 * Must be called during application initialization (main/index.ts).
 *
 * Per plan.md US3:
 * - Channel: feedback:export
 * - Request: { format: "json" | "csv", start_date?: string, end_date?: string, include_correct?: boolean }
 * - Response: { success: boolean, file_path: string, format: string, item_count: number, message?: string }
 * - Export unencrypted feedback data (decrypt feedback_type before export)
 * - User sees warning: "导出文件未加密，请妥善保管"
 *
 * Usage:
 * ```typescript
 * import { registerExportHandlers } from './ipc/handlers/export.handler.js';
 * registerExportHandlers();
 * ```
 */
export function registerExportHandlers(): void {
  logger.info('ExportHandler', 'Registering feedback export IPC handlers');

  // Note: The actual IPC channel name should be added to channels.ts
  // For now, we'll use a custom channel
  const EXPORT_CHANNEL = 'feedback:export';

  ipcMain.handle(EXPORT_CHANNEL, async (event, request: unknown) => {
    const requestId = generateRequestId();

    logger.info('ExportHandler', 'Received feedback:export request', {
      requestId,
    });

    try {
      // Validate request schema
      const validationResult = FeedbackExportRequestSchema.safeParse(request);

      if (!validationResult.success) {
        logger.error('ExportHandler', 'Invalid request schema', {
          requestId,
          errors: validationResult.error.errors,
        });

        const response: FeedbackExportResponse = {
          success: false,
          file_path: '',
          format: 'json',
          item_count: 0,
          message: 'Invalid request schema',
        };
        return response;
      }

      const { format, start_date, end_date, include_correct } = validationResult.data;

      logger.info('ExportHandler', 'Request validated', {
        requestId,
        format,
        start_date,
        end_date,
        include_correct,
      });

      // Show save dialog for user to choose export location
      const window = BrowserWindow.fromWebContents(event.sender);

      if (!window) {
        throw new Error('Unable to access window for save dialog');
      }

      const fileExtension = format === 'json' ? 'json' : 'csv';
      const defaultFileName = `feedback_export_${new Date().toISOString().split('T')[0]}.${fileExtension}`;

      const result = await dialog.showSaveDialog(window, {
        title: '导出反馈数据',
        defaultPath: defaultFileName,
        filters: [
          {
            name: format === 'json' ? 'JSON Files' : 'CSV Files',
            extensions: [fileExtension],
          },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        logger.info('ExportHandler', 'Export cancelled by user', {
          requestId,
        });

        const response: FeedbackExportResponse = {
          success: false,
          file_path: '',
          format,
          item_count: 0,
          message: '用户取消导出',
        };
        return response;
      }

      // Ensure file has correct extension
      let filePath = result.filePath;
      if (!filePath.endsWith(`.${fileExtension}`)) {
        filePath = `${filePath}.${fileExtension}`;
      }

      // Query feedback data
      const feedbackData = await queryFeedbackData(start_date, end_date, include_correct);

      logger.info('ExportHandler', 'Feedback data queried', {
        requestId,
        item_count: feedbackData.length,
      });

      // Generate export file content
      let content: string;
      if (format === 'json') {
        content = generateJsonExport(feedbackData);
      } else {
        content = generateCsvExport(feedbackData);
      }

      // Write export file
      await fs.writeFile(filePath, content, 'utf-8');

      logger.info('ExportHandler', 'Export file written successfully', {
        requestId,
        file_path: filePath,
        item_count: feedbackData.length,
      });

      const response: FeedbackExportResponse = {
        success: true,
        file_path: filePath,
        format,
        item_count: feedbackData.length,
        message: `成功导出 ${feedbackData.length} 条反馈数据。注意：导出文件未加密，请妥善保管。`,
      };

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('ExportHandler', 'Feedback export failed', {
        requestId,
        error: errorMessage,
      });

      const response: FeedbackExportResponse = {
        success: false,
        file_path: '',
        format: 'json',
        item_count: 0,
        message: `导出失败: ${errorMessage}`,
      };

      return response;
    }
  });

  logger.info('ExportHandler', 'Feedback export IPC handlers registered successfully');
}

/**
 * Query feedback data from database
 *
 * Queries todo_items table and decrypts feedback_type.
 *
 * @param startDate - Start date in YYYY-MM-DD format (optional)
 * @param endDate - End date in YYYY-MM-DD format (optional)
 * @param includeCorrect - Whether to include items marked as correct (default: false)
 * @returns Array of feedback data items
 */
async function queryFeedbackData(
  startDate: string | undefined,
  endDate: string | undefined,
  includeCorrect: boolean
): Promise<
  Array<{
    item_id: string;
    content: string;
    item_type: string;
    confidence_score: number;
    source_status: string;
    feedback_type: string | null;
    created_at: string;
  }>
> {
  const db = DatabaseManager.getDatabase();

  // Build query with optional date filters
  let query = `
    SELECT
      item_id,
      content_encrypted,
      item_type,
      confidence_score,
      source_status,
      feedback_type,
      created_at
    FROM todo_items
    WHERE feedback_type IS NOT NULL
  `;
  const params: Array<string | number> = [];

  // Add date range filter if provided
  if (startDate) {
    const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
    query += ` AND created_at >= ?`;
    params.push(startTimestamp);
  }

  if (endDate) {
    const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000) + 86399; // End of day
    query += ` AND created_at <= ?`;
    params.push(endTimestamp);
  }

  query += ` ORDER BY created_at DESC`;

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Array<{
    item_id: string;
    content_encrypted: Buffer;
    item_type: string;
    confidence_score: number;
    source_status: string;
    feedback_type: Buffer | null;
    created_at: number;
  }>;

  // Decrypt content and feedback_type
  const feedbackData = await Promise.all(
    rows.map(async (row) => {
      try {
        // Decrypt content (convert Buffer to string if needed)
        const contentEncrypted = Buffer.isBuffer(row.content_encrypted)
          ? row.content_encrypted.toString('utf-8')
          : row.content_encrypted;
        const content = await ConfigManager.decryptField(contentEncrypted);

        // Decrypt feedback_type
        let feedback_type: string | null = null;
        if (row.feedback_type) {
          try {
            const feedbackTypeEncrypted = Buffer.isBuffer(row.feedback_type)
              ? row.feedback_type.toString('utf-8')
              : row.feedback_type;
            const decryptedFeedback = await ConfigManager.decryptField(feedbackTypeEncrypted);
            // If decryption succeeds and returns a value, it's incorrect feedback
            // If decryption returns null/empty, it was marked as correct
            feedback_type = decryptedFeedback || null;
          } catch (error) {
            logger.error('ExportHandler', 'Failed to decrypt feedback_type', {
              item_id: row.item_id,
              error: error instanceof Error ? error.message : String(error),
            });
            feedback_type = '[解密失败]';
          }
        }

        // Skip if user doesn't want correct items and this is correct
        if (!includeCorrect && !feedback_type) {
          return null;
        }

        // Convert Unix timestamp to ISO string
        const created_at = new Date(row.created_at * 1000).toISOString();

        return {
          item_id: row.item_id,
          content,
          item_type: row.item_type,
          confidence_score: row.confidence_score,
          source_status: row.source_status,
          feedback_type,
          created_at,
        };
      } catch (error) {
        logger.error('ExportHandler', 'Failed to decrypt content', {
          item_id: row.item_id,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    })
  );

  // Filter out null items (decryption failures or filtered correct items)
  return feedbackData.filter((item) => item !== null) as Array<{
    item_id: string;
    content: string;
    item_type: string;
    confidence_score: number;
    source_status: string;
    feedback_type: string | null;
    created_at: string;
  }>;
}

/**
 * Generate JSON export content
 *
 * @param feedbackData - Array of feedback data items
 * @returns JSON string
 */
function generateJsonExport(
  feedbackData: Array<{
    item_id: string;
    content: string;
    item_type: string;
    confidence_score: number;
    source_status: string;
    feedback_type: string | null;
    created_at: string;
  }>
): string {
  const exportData = {
    exported_at: new Date().toISOString(),
    warning: '此文件包含未加密的反馈数据，请妥善保管',
    total_items: feedbackData.length,
    items: feedbackData.map((item) => ({
      item_id: item.item_id,
      content: item.content,
      item_type: item.item_type,
      confidence_score: item.confidence_score,
      source_status: item.source_status,
      feedback_type: item.feedback_type || 'correct', // null means marked as correct
      created_at: item.created_at,
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Generate CSV export content
 *
 * @param feedbackData - Array of feedback data items
 * @returns CSV string
 */
function generateCsvExport(
  feedbackData: Array<{
    item_id: string;
    content: string;
    item_type: string;
    confidence_score: number;
    source_status: string;
    feedback_type: string | null;
    created_at: string;
  }>
): string {
  // CSV header
  const header = 'item_id,content,item_type,confidence_score,source_status,feedback_type,created_at';

  // CSV rows
  const rows = feedbackData.map((item) => {
    // Escape content field (may contain commas, quotes, newlines)
    const escapedContent = `"${item.content.replace(/"/g, '""')}"`;

    return [
      item.item_id,
      escapedContent,
      item.item_type,
      item.confidence_score.toString(),
      item.source_status,
      item.feedback_type || 'correct',
      item.created_at,
    ].join(',');
  });

  // Combine header and rows
  return [header, ...rows].join('\n');
}

/**
 * Unregister Feedback Export IPC handlers
 *
 * Removes IPC channel listeners. Called during application shutdown.
 */
export function unregisterExportHandlers(): void {
  logger.info('ExportHandler', 'Unregistering feedback export IPC handlers');

  const EXPORT_CHANNEL = 'feedback:export';
  ipcMain.removeAllListeners(EXPORT_CHANNEL);

  logger.info('ExportHandler', 'Feedback export IPC handlers unregistered');
}

export default {
  registerExportHandlers,
  unregisterExportHandlers,
  queryFeedbackData,
};
