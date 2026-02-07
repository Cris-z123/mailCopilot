/**
 * FeedbackSettings Component (T062)
 *
 * User Story 3: Local Privacy-Preserving Feedback System
 *
 * Settings page for feedback data management with stats, retention config,
 * and export/destroy buttons.
 *
 * Features:
 * - "本月修正X处错误" statistics display
 * - Retention period selector: 30/90/180/365/永久 (-1 = permanent)
 * - Export feedback data button (unencrypted file)
 * - Destroy all feedback data button (with confirmation)
 * - Estimated storage usage display
 * - TailwindCSS v3.4 styling
 * - shadcn/ui components (Card, Button, Select, Label)
 *
 * Per plan.md:
 * - FR-026: Feedback data retention (90 days default, configurable)
 * - FR-042: Configurable retention with -1 permanent option
 * - FR-048: Manual cleanup button ("清理30天前数据")
 * - Data model: DataRetentionConfig entity with feedback_retention_days
 */

import { useState, useEffect } from 'react';
import { Card } from '@renderer/components/ui/card';
import { Button } from '@renderer/components/ui/button';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import {
  Trash2,
  Download,
  HardDrive,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

/**
 * Retention period options
 * Per plan.md FR-042: 30/90/180/365/-1 (where -1 = permanent)
 */
type RetentionDays = 30 | 90 | 180 | 365 | -1;

interface RetentionOption {
  value: RetentionDays;
  label: string;
  description: string;
}

const RETENTION_OPTIONS: RetentionOption[] = [
  { value: 30, label: '30天', description: '保留30天' },
  { value: 90, label: '90天', description: '保留90天（默认）' },
  { value: 180, label: '180天', description: '保留180天' },
  { value: 365, label: '365天', description: '保留365天' },
  { value: -1, label: '永久', description: '永久保留（不会自动删除）' },
];

/**
 * Feedback statistics
 */
interface FeedbackStats {
  /**
   * Number of error corrections this month
   */
  correctionsThisMonth: number;

  /**
   * Total feedback count
   */
  totalFeedbackCount: number;

  /**
   * Estimated storage usage in bytes
   */
  estimatedStorageBytes: number;
}

/**
 * FeedbackSettings props
 */
export interface FeedbackSettingsProps {
  /**
   * Current feedback retention period in days
   */
  currentRetentionDays: RetentionDays;

  /**
   * Feedback statistics
   */
  stats: FeedbackStats;

  /**
   * Callback when retention period is changed
   */
  onRetentionChange: (days: RetentionDays) => Promise<void>;

  /**
   * Callback when export button is clicked
   */
  onExport: () => Promise<void>;

  /**
   * Callback when destroy button is clicked
   */
  onDestroy: () => Promise<void>;

  /**
   * Is currently loading/processing
   */
  isLoading?: boolean;

  /**
   * Is currently exporting
   */
  isExporting?: boolean;

  /**
   * Is currently destroying
   */
  isDestroying?: boolean;

  /**
   * Export error message (if any)
   */
  exportError?: string | null;

  /**
   * Destroy error message (if any)
   */
  destroyError?: string | null;
}

/**
 * Format bytes to human readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * FeedbackSettings component
 *
 * Displays:
 * 1. Statistics card: "本月修正X处错误"
 * 2. Retention period selector
 * 3. Estimated storage usage
 * 4. Export feedback data button
 * 5. Destroy all feedback data button (with confirmation dialog)
 */
export const FeedbackSettings = ({
  currentRetentionDays,
  stats,
  onRetentionChange,
  onExport,
  onDestroy,
  isLoading = false,
  isExporting = false,
  isDestroying = false,
  exportError = null,
  destroyError = null,
}: FeedbackSettingsProps) => {
  const [selectedRetention, setSelectedRetention] = useState<RetentionDays>(currentRetentionDays);
  const [showDestroyConfirm, setShowDestroyConfirm] = useState(false);

  // Update local state when prop changes
  useEffect(() => {
    setSelectedRetention(currentRetentionDays);
  }, [currentRetentionDays]);

  /**
   * Handle retention period change
   */
  const handleRetentionChange = async (value: string) => {
    const days = parseInt(value, 10) as RetentionDays;
    setSelectedRetention(days);
    await onRetentionChange(days);
  };

  /**
   * Handle export button click
   */
  const handleExport = async () => {
    await onExport();
  };

  /**
   * Handle destroy button click (show confirmation)
   */
  const handleDestroyClick = () => {
    setShowDestroyConfirm(true);
  };

  /**
   * Handle destroy confirmation
   */
  const handleDestroyConfirm = async () => {
    await onDestroy();
    setShowDestroyConfirm(false);
  };

  /**
   * Handle destroy cancel
   */
  const handleDestroyCancel = () => {
    setShowDestroyConfirm(false);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Statistics Card */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">反馈统计</h3>
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Corrections This Month */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-700 mb-1">本月修正错误</p>
              <p className="text-2xl font-bold text-green-900">
                {stats.correctionsThisMonth}
              </p>
              <p className="text-xs text-green-600 mt-1">处</p>
            </div>

            {/* Total Feedback Count */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-700 mb-1">总反馈数量</p>
              <p className="text-2xl font-bold text-blue-900">
                {stats.totalFeedbackCount}
              </p>
              <p className="text-xs text-blue-600 mt-1">条</p>
            </div>

            {/* Estimated Storage */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <HardDrive className="h-4 w-4 text-gray-600" />
                <p className="text-sm text-gray-700">存储占用</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatBytes(stats.estimatedStorageBytes)}
              </p>
              <p className="text-xs text-gray-500 mt-1">约</p>
            </div>
          </div>
        </Card>

        {/* Retention Period Settings */}
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                数据保留期限
              </h3>
              <p className="text-sm text-gray-600">
                选择反馈数据的自动删除时间。超过保留期的数据将被自动清理。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="retention-select">保留期限</Label>
                <Select
                  value={selectedRetention.toString()}
                  onValueChange={handleRetentionChange}
                  disabled={isLoading}
                >
                  <SelectTrigger id="retention-select">
                    <SelectValue placeholder="选择保留期限" />
                  </SelectTrigger>
                  <SelectContent>
                    {RETENTION_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value.toString()}
                      >
                        {option.label}
                        <span className="ml-2 text-xs text-gray-500">
                          {option.description}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <div className="text-sm text-gray-600">
                  <p className="font-medium">当前设置</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {RETENTION_OPTIONS.find((opt) => opt.value === selectedRetention)
                      ?.description || '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Data Management */}
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                数据管理
              </h3>
              <p className="text-sm text-gray-600">
                导出反馈数据或永久删除所有反馈记录。删除操作无法撤销。
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Export Button */}
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={isExporting || isLoading}
                className="flex-1 sm:flex-none"
              >
                <Download className="h-4 w-4 mr-2" />
                {isExporting ? '导出中...' : '导出反馈数据'}
              </Button>

              {/* Destroy Button */}
              <Button
                variant="outline"
                onClick={handleDestroyClick}
                disabled={isDestroying || isLoading}
                className="flex-1 sm:flex-none text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isDestroying ? '删除中...' : '清空所有反馈'}
              </Button>
            </div>

            {/* Export Error */}
            {exportError && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{exportError}</span>
              </div>
            )}

            {/* Destroy Error */}
            {destroyError && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{destroyError}</span>
              </div>
            )}

            {/* Privacy Notice */}
            <div className="text-xs text-gray-500 leading-relaxed">
              <p>
                <strong>隐私说明：</strong>反馈数据仅存储在本地，不会上传到云端。
                导出时数据将以未加密格式保存为文件，请注意保管。
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Destroy Confirmation Dialog */}
      <Dialog open={showDestroyConfirm} onOpenChange={setShowDestroyConfirm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-red-900">确认清空反馈</DialogTitle>
            <DialogDescription className="text-gray-600">
              此操作将永久删除所有反馈数据，无法恢复。
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-md p-4">
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900 mb-1">
                  警告：不可逆操作
                </p>
                <p className="text-xs text-red-700 leading-relaxed">
                  清空操作将删除所有反馈记录，包括本月和历史上的所有反馈数据。
                  此操作无法撤销，请确认后继续。
                </p>
              </div>
            </div>

            {stats.totalFeedbackCount > 0 && (
              <div className="mt-4 text-sm text-gray-700">
                将删除 <strong>{stats.totalFeedbackCount}</strong> 条反馈记录
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleDestroyCancel}
              disabled={isDestroying}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleDestroyConfirm}
              disabled={isDestroying}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDestroying ? '删除中...' : '确认清空'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FeedbackSettings;
