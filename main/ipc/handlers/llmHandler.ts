/**
 * LLM IPC Handler
 *
 * Handles IPC communication for email batch processing via llm:generate channel.
 * Per plan.md: Email processing pipeline orchestrated by EmailProcessor.
 *
 * @module main/ipc/handlers/llmHandler
 */

import { ipcMain } from 'electron';
import { logger } from '@/config/logger.js';
import { IPC_CHANNELS } from '../channels.js';
import { EmailProcessor } from '@/email/EmailProcessor.js';
import type { LLMAdapter } from '@/llm/LLMAdapter.js';
import { validateData, safeValidateData } from '@shared/schemas/validation.js';
import type { LLMGenerateRequest, LLMGenerateResponse, ProcessedEmail } from '@shared/schemas/validation.js';

/**
 * LLM handler state
 *
 * Maintains singleton EmailProcessor instance per application lifecycle.
 */
interface LLMHandlerState {
  processor: EmailProcessor | null;
  isProcessing: boolean;
}

const state: LLMHandlerState = {
  processor: null,
  isProcessing: false,
};

/**
 * Register LLM IPC handlers
 *
 * Sets up IPC channel listeners for email batch processing.
 * Must be called during application initialization (main/index.ts).
 *
 * @param llmAdapter - LLM adapter instance (local or remote mode)
 *
 * Per plan.md IPC channel definitions:
 * - Channel: llm:generate
 * - Request: { emails: EmailInput[], mode: 'local' | 'remote', reportDate: string }
 * - Response: { success: boolean, items: Item[], processed_emails: ProcessedEmail[], ... }
 *
 * Usage:
 * ```typescript
 * import { registerLLMHandlers } from './ipc/handlers/llmHandler.js';
 * import { RemoteLLM } from './llm/RemoteLLM.js';
 *
 * const llmAdapter = new RemoteLLM({ apiKey: 'sk-...', timeout: 30000 });
 * registerLLMHandlers(llmAdapter);
 * ```
 */
export function registerLLMHandlers(llmAdapter: LLMAdapter): void {
  logger.info('LLMHandler', 'Registering LLM IPC handlers', {
    channel: IPC_CHANNELS.LLM_GENERATE,
  });

  // Register llm:generate handler
  ipcMain.handle(IPC_CHANNELS.LLM_GENERATE, async (_event, request: unknown) => {
    const requestId = generateRequestId();

    logger.info('LLMHandler', 'Received llm:generate request', {
      requestId,
      isProcessing: state.isProcessing,
    });

    // Check if already processing a batch
    if (state.isProcessing) {
      logger.warn('LLMHandler', 'Batch processing already in progress', {
        requestId,
      });

      return {
        success: false,
        items: [],
        processed_emails: [],
        skipped_emails: 0,
        reprocessed_emails: 0,
        error: 'Batch processing already in progress. Please wait for current batch to complete.',
      };
    }

    try {
      // Validate request schema
      const validationResult = safeValidateData(
        LLMGenerateRequestSchemaInternal,
        request
      );

      if (!validationResult) {
        logger.error('LLMHandler', 'Invalid request schema', {
          requestId,
          request,
        });

        return {
          success: false,
          items: [],
          processed_emails: [],
          skipped_emails: 0,
          reprocessed_emails: 0,
          error: 'Invalid request schema. Expected { emails: EmailInput[], mode: "local" | "remote", reportDate: "YYYY-MM-DD" }',
        };
      }

      const { emails, mode, reportDate } = validationResult;

      logger.info('LLMHandler', 'Request validated', {
        requestId,
        emailCount: emails.length,
        mode,
        reportDate,
      });

      // Set processing flag
      state.isProcessing = true;

      // Get or create processor
      if (!state.processor) {
        state.processor = new EmailProcessor(llmAdapter, {
          maxBatchSize: 50, // Per FR-057
          maxBodyLength: 100000, // Per FR-057
          debug: false,
        });

        logger.info('LLMHandler', 'EmailProcessor created', {
          requestId,
        });
      }

      // Extract file paths from email inputs
      const emailFiles = emails.map((e) => e.filePath);

      // Process batch
      const result = await state.processor.processBatch(emailFiles, reportDate, mode);

      // Clear processing flag
      state.isProcessing = false;

      // Map result to response schema
      const response = mapProcessorResultToResponse(result, requestId);

      logger.info('LLMHandler', 'Batch processing complete', {
        requestId,
        success: response.success,
        itemCount: response.items.length,
        processedCount: response.processed_emails.length,
        skippedEmails: response.skipped_emails,
        reprocessedEmails: response.reprocessed_emails,
      });

      return response;
    } catch (error) {
      // Clear processing flag on error
      state.isProcessing = false;

      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('LLMHandler', 'Batch processing failed', {
        requestId,
        error: errorMessage,
      });

      return {
        success: false,
        items: [],
        processed_emails: [],
        skipped_emails: 0,
        reprocessed_emails: 0,
        error: errorMessage,
      };
    }
  });

  logger.info('LLMHandler', 'LLM IPC handlers registered successfully');
}

/**
 * Unregister LLM IPC handlers
 *
 * Removes IPC channel listeners. Called during application shutdown.
 */
export function unregisterLLMHandlers(): void {
  logger.info('LLMHandler', 'Unregistering LLM IPC handlers');

  ipcMain.removeAllListeners(IPC_CHANNELS.LLM_GENERATE);

  // Cleanup processor
  if (state.processor) {
    state.processor = null;
  }

  state.isProcessing = false;

  logger.info('LLMHandler', 'LLM IPC handlers unregistered');
}

/**
 * Get current processing state
 *
 * @returns Current handler state
 */
export function getLLMHandlerState(): LLMHandlerState {
  return { ...state };
}

/**
 * Map EmailProcessor result to IPC response schema
 *
 * @param result - EmailProcessor result
 * @param requestId - Request ID for logging
 * @returns IPC response matching LLMGenerateResponseSchema
 */
function mapProcessorResultToResponse(
  result: {
    items: Array<{
      item_id: string;
      content: string;
      item_type: 'completed' | 'pending';
      confidence: number;
      source_status: 'verified' | 'unverified';
      evidence: string;
    }>;
    batch_info: {
      total_emails: number;
      processed_emails: number;
      skipped_emails: number;
      same_batch_duplicates: number;
      cross_batch_duplicates: number;
    };
    success: boolean;
    error?: string;
  },
  requestId: string
): LLMGenerateResponse {
  // Map items to ItemSchema format
  const items = result.items.map((item) => ({
    content: item.content,
    type: item.item_type,
    source_email_indices: [], // Not tracked in current implementation
    evidence: item.evidence,
    confidence: item.confidence * 100, // Convert 0-1 to 0-100
    source_status: item.source_status,
  }));

  // Map processed emails to ProcessedEmailSchema format
  // Note: We don't track individual email processing results in current implementation
  // This would need to be enhanced to track which emails succeeded/failed
  const processed_emails: ProcessedEmail[] = [];

  // Calculate reprocessed emails (cross-batch duplicates)
  const reprocessed_emails = result.batch_info.cross_batch_duplicates;

  return {
    success: result.success,
    items,
    processed_emails,
    skipped_emails: result.batch_info.skipped_emails,
    reprocessed_emails,
    error: result.error,
  };
}

/**
 * Generate unique request ID for tracking
 *
 * @returns Request ID string
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Internal LLM generate request schema
 *
 * Matches IPC schema from shared/schemas/validation.ts
 */
const LLMGenerateRequestSchemaInternal = {
  emails: [
    {
      filePath: 'string',
      format: 'eml|msg|pst|ost|mbox|html',
      content: 'string?',
    },
  ],
  mode: 'local|remote',
  reportDate: '\\d{4}-\\d{2}-\\d{2}',
} as const;

/**
 * Validate LLM generate request
 *
 * @param request - Request to validate
 * @returns Validation result
 */
export function validateLLMGenerateRequest(request: unknown): {
  valid: boolean;
  error?: string;
  data?: LLMGenerateRequest;
} {
  try {
    // Basic validation (Zod schema would be better)
    if (typeof request !== 'object' || request === null) {
      return {
        valid: false,
        error: 'Request must be an object',
      };
    }

    const req = request as Record<string, unknown>;

    if (!Array.isArray(req.emails)) {
      return {
        valid: false,
        error: 'emails field must be an array',
      };
    }

    if (req.mode !== 'local' && req.mode !== 'remote') {
      return {
        valid: false,
        error: 'mode must be "local" or "remote"',
      };
    }

    if (typeof req.reportDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(req.reportDate)) {
      return {
        valid: false,
        error: 'reportDate must be in YYYY-MM-DD format',
      };
    }

    return {
      valid: true,
      data: req as unknown as LLMGenerateRequest,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default {
  registerLLMHandlers,
  unregisterLLMHandlers,
  getLLMHandlerState,
  validateLLMGenerateRequest,
};
