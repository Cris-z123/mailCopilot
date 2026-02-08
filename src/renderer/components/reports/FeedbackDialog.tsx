/**
 * FeedbackDialog Component (T061)
 *
 * User Story 3: Local Privacy-Preserving Feedback System
 *
 * Dialog for marking an action item as incorrect with error reason selection.
 * Displays privacy notice and 4 error reason options.
 *
 * Features:
 * - Privacy notice explaining local-only storage
 * - 4 error categories: content_error, priority_error, not_actionable, source_error
 * - Form validation (must select reason)
 * - TailwindCSS v3.4 styling
 * - shadcn/ui Dialog, Button, Label components
 *
 * Per plan.md:
 * - FR-021: Privacy notice in feedback dialog
 * - FR-022: 4 error type categories
 * - FR-023: Local-only feedback (no network transmission)
 * - FR-024: Encrypted feedback storage
 *
 * @module renderer/components/reports/FeedbackDialog
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Button } from '@renderer/components/ui/button';
import { Label } from '@renderer/components/ui/label';
import { Card } from '@renderer/components/ui/card';
import { Lock, AlertCircle } from 'lucide-react';

/**
 * Feedback type enum for error categories
 * Per plan.md FR-022
 */
export type FeedbackType = 'content_error' | 'priority_error' | 'not_actionable' | 'source_error';

/**
 * Feedback option for form selection
 */
interface FeedbackOption {
  value: FeedbackType;
  label: string;
  description: string;
  icon?: React.ReactNode;
}

/**
 * Feedback options for the 4 error categories
 * Displayed as selectable cards in the dialog
 */
const FEEDBACK_OPTIONS: FeedbackOption[] = [
  {
    value: 'content_error',
    label: '内容错误',
    description: '提取的项目内容不准确或与原文不符',
  },
  {
    value: 'priority_error',
    label: '类型错误',
    description: '已完成/待办状态标记错误',
  },
  {
    value: 'not_actionable',
    label: '非行动项',
    description: '这不是一个需要采取行动的任务',
  },
  {
    value: 'source_error',
    label: '来源错误',
    description: '关联的源邮件不正确',
  },
];

/**
 * FeedbackDialog props
 */
export interface FeedbackDialogProps {
  /**
   * Dialog open state
   */
  open: boolean;

  /**
   * Callback when dialog is closed
   */
  onOpenChange: (open: boolean) => void;

  /**
   * Callback when form is submitted with selected error reason
   */
  onSubmit: (feedbackType: FeedbackType) => void;

  /**
   * Is form currently submitting (disable buttons during async operation)
   */
  isSubmitting?: boolean;

  /**
   * Optional custom title
   */
  title?: string;

  /**
   * Optional custom description
   */
  description?: string;
}

/**
 * FeedbackDialog component
 *
 * Displays a modal dialog with:
 * 1. Privacy notice (locked icon, "本地存储，数据隐私受保护")
 * 2. 4 error reason options as selectable cards
 * 3. Submit button (disabled until selection made)
 * 4. Cancel button
 *
 * Privacy Notice:
 * "您的反馈将仅存储在本地，不会上传到云端或网络传输。
 * 所有反馈数据经过加密保护，确保您的隐私安全。"
 */
export const FeedbackDialog = ({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
  title = '标记错误',
  description = '请选择错误类型，帮助我们改进系统',
}: FeedbackDialogProps) => {
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackType | null>(null);

  /**
   * Handle option selection
   */
  const handleSelectOption = (value: FeedbackType) => {
    setSelectedFeedback(value);
  };

  /**
   * Handle form submission
   */
  const handleSubmit = () => {
    if (selectedFeedback) {
      onSubmit(selectedFeedback);
      setSelectedFeedback(null); // Reset selection
      onOpenChange(false); // Close dialog
    }
  };

  /**
   * Handle dialog close
   */
  const handleClose = () => {
    setSelectedFeedback(null);
    onOpenChange(false);
  };

  /**
   * Handle dialog open change (controlled component)
   */
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      handleClose();
    } else {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Privacy Notice */}
          <Card className="p-4 bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  本地存储，数据隐私受保护
                </p>
                <p className="text-xs text-blue-700 leading-relaxed">
                  您的反馈将仅存储在本地，不会上传到云端或网络传输。所有反馈数据经过加密保护，确保您的隐私安全。
                </p>
              </div>
            </div>
          </Card>

          {/* Error Type Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">错误类型</Label>

            <div className="grid grid-cols-1 gap-2">
              {FEEDBACK_OPTIONS.map((option) => {
                const isSelected = selectedFeedback === option.value;

                return (
                  <Card
                    key={option.value}
                    className={`p-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-red-50 border-red-300 ring-2 ring-red-200'
                        : 'hover:bg-gray-50 border-gray-200'
                    }`}
                    onClick={() => handleSelectOption(option.value)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex-1`}>
                        <p className="text-sm font-medium text-gray-900 mb-0.5">
                          {option.label}
                        </p>
                        <p className="text-xs text-gray-500 leading-relaxed">
                          {option.description}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="flex-shrink-0">
                          <div className="h-5 w-5 rounded-full bg-red-500 flex items-center justify-center">
                            <svg
                              className="h-3 w-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Validation Message */}
          {!selectedFeedback && (
            <div className="flex items-center gap-2 text-xs text-amber-600">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>请选择错误类型以提交反馈</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedFeedback || isSubmitting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isSubmitting ? '提交中...' : '提交反馈'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Helper function to get display label for feedback type
 */
export function getFeedbackTypeLabel(type: FeedbackType): string {
  const option = FEEDBACK_OPTIONS.find((opt) => opt.value === type);
  return option?.label || type;
}

/**
 * Helper function to get description for feedback type
 */
export function getFeedbackTypeDescription(type: FeedbackType): string {
  const option = FEEDBACK_OPTIONS.find((opt) => opt.value === type);
  return option?.description || '';
}

export default FeedbackDialog;
