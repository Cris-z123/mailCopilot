/**
 * Feedback IPC Handler
 *
 * Handles IPC communication for user feedback operations via feedback:submit channel.
 * Per plan.md v2.7: Feedback is stored in todo_items.feedback_type field with encryption.
 *
 * @module main/ipc/handlers/feedback.handler
 */

import { ipcMain } from 'electron';
import { logger } from '@/config/logger.js';
import { IPC_CHANNELS } from '../channels.js';
import { ActionItemRepository, FeedbackType } from '@/database/entities/ActionItem.js';
import {
  FeedbackSubmitRequestSchema,
  type FeedbackSubmitResponse,
} from '@shared/schemas/validation.js';

/**
 * Generate unique request ID for tracking
 *
 * @returns Request ID string
 */
function generateRequestId(): string {
  return `feedback_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Register Feedback IPC handlers
 *
 * Sets up IPC channel listeners for feedback submission.
 * Must be called during application initialization (main/index.ts).
 *
 * Per plan.md US3:
 * - Channel: feedback:submit
 * - Request: { item_id: string, is_correct: boolean, feedback_type?: FeedbackType }
 * - Response: { success: boolean, message?: string }
 * - FR-023: Privacy notice (local-only, encrypted, no network traffic)
 * - FR-024: Store encrypted feedback_type in todo_items table
 *
 * Usage:
 * ```typescript
 * import { registerFeedbackHandlers } from './ipc/handlers/feedback.handler.js';
 * registerFeedbackHandlers();
 * ```
 */
export function registerFeedbackHandlers(): void {
  logger.info('FeedbackHandler', 'Registering feedback IPC handlers', {
    channel: IPC_CHANNELS.FEEDBACK_SUBMIT,
  });

  // Register feedback:submit handler
  ipcMain.handle(IPC_CHANNELS.FEEDBACK_SUBMIT, async (_event, request: unknown) => {
    const requestId = generateRequestId();

    logger.info('FeedbackHandler', 'Received feedback:submit request', {
      requestId,
    });

    try {
      // Validate request schema
      const validationResult = FeedbackSubmitRequestSchema.safeParse(request);

      if (!validationResult.success) {
        logger.error('FeedbackHandler', 'Invalid request schema', {
          requestId,
          errors: validationResult.error.errors,
        });

        const response: FeedbackSubmitResponse = {
          success: false,
          message: 'Invalid request schema. Expected { item_id: string, is_correct: boolean, feedback_type?: "content_error" | "priority_error" | "not_actionable" | "source_error" }',
        };
        return response;
      }

      const { item_id, is_correct, feedback_type } = validationResult.data;

      // Validation: If marking as incorrect, feedback_type is required
      if (!is_correct && !feedback_type) {
        logger.warn('FeedbackHandler', 'Feedback type required when marking incorrect', {
          requestId,
          item_id,
        });

        const response: FeedbackSubmitResponse = {
          success: false,
          message: '反馈类型不能为空。请选择错误原因：内容错误、优先级错误、不可执行或来源错误。',
        };
        return response;
      }

      // Validation: If marking as correct, feedback_type should not be provided
      if (is_correct && feedback_type) {
        logger.warn('FeedbackHandler', 'Feedback type should not be provided when marking correct', {
          requestId,
          item_id,
        });

        const response: FeedbackSubmitResponse = {
          success: false,
          message: '标记准确时不应提供反馈类型。',
        };
        return response;
      }

      // Submit feedback to repository
      // Per plan v2.7: feedback_type is encrypted at rest
      const updatedItem = await ActionItemRepository.submitFeedback(
        item_id,
        is_correct,
        feedback_type as FeedbackType
      );

      if (!updatedItem) {
        logger.warn('FeedbackHandler', 'Item not found', {
          requestId,
          item_id,
        });

        const response: FeedbackSubmitResponse = {
          success: false,
          message: '项目未找到。请检查项目ID是否正确。',
        };
        return response;
      }

      logger.info('FeedbackHandler', 'Feedback submitted successfully', {
        requestId,
        item_id,
        is_correct,
        feedback_type: !is_correct ? feedback_type : null,
      });

      const response: FeedbackSubmitResponse = {
        success: true,
        message: is_correct ? '已标记为准确' : '已提交错误反馈',
      };
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('FeedbackHandler', 'Feedback submission failed', {
        requestId,
        error: errorMessage,
      });

      const response: FeedbackSubmitResponse = {
        success: false,
        message: `反馈提交失败: ${errorMessage}`,
      };
      return response;
    }
  });

  logger.info('FeedbackHandler', 'Feedback IPC handlers registered successfully');
}

/**
 * Unregister Feedback IPC handlers
 *
 * Removes IPC channel listeners. Called during application shutdown.
 */
export function unregisterFeedbackHandlers(): void {
  logger.info('FeedbackHandler', 'Unregistering feedback IPC handlers');

  ipcMain.removeAllListeners(IPC_CHANNELS.FEEDBACK_SUBMIT);

  logger.info('FeedbackHandler', 'Feedback IPC handlers unregistered');
}

export default {
  registerFeedbackHandlers,
  unregisterFeedbackHandlers,
};
