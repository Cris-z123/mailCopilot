/**
 * Retention Config Component
 *
 * Per plan v2.7 FR-046: Configurable data retention with 30/90/180/365/-1 (permanent) options.
 * - Email metadata retention selector
 * - Feedback retention selector
 * - Estimated storage usage display
 * - Immediate cleanup on retention change
 *
 * @module renderer/components/Settings/RetentionConfig
 */

import { useState, useEffect } from 'react';
import { Clock, HardDrive, AlertTriangle, Loader2, CheckCircle } from 'lucide-react';
import ipcClient, { IPC_CHANNELS } from '@renderer/services/ipc-client';

/**
 * Retention period option
 */
interface RetentionOption {
  value: number;
  label: string;
}

/**
 * Retention configuration state
 */
interface RetentionConfig {
  email_metadata_retention_days: number;
  feedback_retention_days: number;
  last_cleanup_at: number;
  estimated_storage_bytes: number;
}

/**
 * Cleanup preview state
 */
interface CleanupPreview {
  email_count: number;
  feedback_count: number;
}

/**
 * Cleanup result state
 */
interface CleanupResult {
  email_metadata_deleted?: number;
  feedback_deleted?: number;
  cleanup_triggered?: boolean;
  message: string;
}

/**
 * Retention period options (per plan v2.7)
 */
const RETENTION_OPTIONS: RetentionOption[] = [
  { value: 30, label: '30天' },
  { value: 90, label: '90天' },
  { value: 180, label: '180天' },
  { value: 365, label: '365天' },
  { value: -1, label: '永久' },
];

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}

/**
 * Format timestamp to date string
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * RetentionConfig Component
 *
 * Provides UI for configuring data retention periods:
 * - Email metadata retention selector: 30/90/180/365/永久 (-1)
 * - Feedback retention selector: 30/90/180/365/永久 (-1)
 * - Estimated storage usage display
 * - Cleanup preview before changing retention
 * - Immediate cleanup on retention change
 */
export function RetentionConfig() {
  const [config, setConfig] = useState<RetentionConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [pendingRetention, setPendingRetention] = useState<{
    emailDays: number;
    feedbackDays: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load current configuration on mount
  useEffect(() => {
    loadConfig();
  }, []);

  /**
   * Load current retention configuration
   */
  async function loadConfig() {
    setIsLoading(true);
    setError(null);

    try {
      const result = await ipcClient.invoke(IPC_CHANNELS.RETENTION_GET_CONFIG);
      setConfig(result);
    } catch (err) {
      console.error('Failed to load retention config:', err);
      setError('加载保留配置失败');
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Get cleanup preview before changing retention
   */
  async function getCleanupPreview(
    emailRetentionDays: number,
    feedbackRetentionDays: number
  ) {
    try {
      const result = await ipcClient.invoke(IPC_CHANNELS.RETENTION_GET_PREVIEW, {
        email_metadata_retention_days: emailRetentionDays,
        feedback_retention_days: feedbackRetentionDays,
      });

      setPreview(result);
      setShowPreview(true);
    } catch (err) {
      console.error('Failed to get cleanup preview:', err);
      setError('获取清理预览失败');
    }
  }

  /**
   * Handle retention period change with preview
   */
  function handleRetentionChange(
    field: 'email_metadata_retention_days' | 'feedback_retention_days',
    value: number
  ) {
    if (!config) return;

    // Calculate what the new config would be
    const newEmailRetention = field === 'email_metadata_retention_days' ? value : config.email_metadata_retention_days;
    const newFeedbackRetention = field === 'feedback_retention_days' ? value : config.feedback_retention_days;

    // Only show preview if retention period is getting shorter (more aggressive cleanup)
    const currentEmailRetention = config.email_metadata_retention_days;
    const currentFeedbackRetention = config.feedback_retention_days;

    const emailGettingShorter = field === 'email_metadata_retention_days' && value !== -1 && (currentEmailRetention === -1 || value < currentEmailRetention);
    const feedbackGettingShorter = field === 'feedback_retention_days' && value !== -1 && (currentFeedbackRetention === -1 || value < currentFeedbackRetention);

    if (emailGettingShorter || feedbackGettingShorter) {
      // Store pending retention so confirm uses new values
      setPendingRetention({ emailDays: newEmailRetention, feedbackDays: newFeedbackRetention });
      getCleanupPreview(newEmailRetention, newFeedbackRetention);
      setCleanupResult({
        message: '即将修改保留期，请确认是否继续',
      });
    } else {
      // No cleanup needed, apply immediately without preview
      applyRetentionChange(newEmailRetention, newFeedbackRetention, false);
    }
  }

  /**
   * Apply retention period change
   */
  async function applyRetentionChange(
    emailRetentionDays: number,
    feedbackRetentionDays: number,
    performImmediateCleanup: boolean
  ) {
    setIsSaving(true);
    setError(null);
    setCleanupResult(null);
    setPendingRetention(null);

    try {
      const result = await ipcClient.invoke(IPC_CHANNELS.RETENTION_SET_PERIODS, {
        email_metadata_retention_days: emailRetentionDays,
        feedback_retention_days: feedbackRetentionDays,
        perform_immediate_cleanup: performImmediateCleanup,
        show_confirmation: false,
      });

      if (result.success) {
        // Reload config
        await loadConfig();

        // Show result
        setCleanupResult({
          email_metadata_deleted: result.email_metadata_deleted,
          feedback_deleted: result.feedback_deleted,
          cleanup_triggered: result.cleanup_triggered,
          message: result.message,
        });

        setShowPreview(false);
        setPreview(null);
        setPendingRetention(null);
      } else {
        setError(result.message);
      }
    } catch (err) {
      console.error('Failed to set retention periods:', err);
      setError('设置保留期失败');
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Confirm retention change with cleanup
   * Uses pending retention values (the new period user selected), not current config.
   */
  function handleConfirmCleanup() {
    if (!pendingRetention || !preview) return;

    applyRetentionChange(
      pendingRetention.emailDays,
      pendingRetention.feedbackDays,
      true
    );
  }

  /**
   * Cancel retention change
   */
  function handleCancelCleanup() {
    setShowPreview(false);
    setPreview(null);
    setCleanupResult(null);
    setPendingRetention(null);
    loadConfig();
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <p className="text-sm text-red-600">加载配置失败</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">数据保留设置</h3>
        <Clock className="w-5 h-5 text-gray-600" />
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Cleanup Result */}
      {cleanupResult && !showPreview && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start">
            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-900 mb-1">
                {cleanupResult.message}
              </p>
              {(cleanupResult.email_metadata_deleted !== undefined || cleanupResult.feedback_deleted !== undefined) && (
                <p className="text-xs text-green-700">
                  {cleanupResult.email_metadata_deleted !== undefined && `邮件元数据：${cleanupResult.email_metadata_deleted} 条`}
                  {cleanupResult.email_metadata_deleted !== undefined && cleanupResult.feedback_deleted !== undefined && '，'}
                  {cleanupResult.feedback_deleted !== undefined && `反馈数据：${cleanupResult.feedback_deleted} 条`}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cleanup Preview Confirmation */}
      {showPreview && preview && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-900 mb-2">
                即将删除旧数据
              </p>
              <p className="text-xs text-yellow-800 mb-3">
                此操作将删除以下旧数据（无法恢复）：
              </p>
              <div className="space-y-1 mb-3">
                <div className="flex justify-between text-xs text-yellow-800">
                  <span>邮件元数据：</span>
                  <span className="font-semibold">{preview.email_count} 条</span>
                </div>
                <div className="flex justify-between text-xs text-yellow-800">
                  <span>反馈数据：</span>
                  <span className="font-semibold">{preview.feedback_count} 条</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmCleanup}
                  disabled={isSaving}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      清理中...
                    </>
                  ) : (
                    '确认并清理'
                  )}
                </button>
                <button
                  onClick={handleCancelCleanup}
                  disabled={isSaving}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Metadata Retention */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          邮件元数据保留期
        </label>
        <select
          value={config.email_metadata_retention_days}
          onChange={(e) => handleRetentionChange('email_metadata_retention_days', parseInt(e.target.value, 10))}
          disabled={isSaving || showPreview}
          className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {RETENTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          邮件元数据包括发件人、日期、主题等（不包含邮件正文）
        </p>
      </div>

      {/* Feedback Retention */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          反馈数据保留期
        </label>
        <select
          value={config.feedback_retention_days}
          onChange={(e) => handleRetentionChange('feedback_retention_days', parseInt(e.target.value, 10))}
          disabled={isSaving || showPreview}
          className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {RETENTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          用户对项目准确性的反馈数据
        </p>
      </div>

      {/* Storage Usage */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center mb-4">
          <HardDrive className="w-5 h-5 text-gray-600 mr-3" />
          <div className="flex-1">
            <p className="text-sm text-gray-600">估计存储使用</p>
            <p className="text-lg font-semibold text-gray-900">
              {formatBytes(config.estimated_storage_bytes)}
            </p>
          </div>
        </div>

        {/* Last Cleanup */}
        <div className="flex items-center">
          <Clock className="w-5 h-5 text-gray-600 mr-3" />
          <div className="flex-1">
            <p className="text-sm text-gray-600">上次清理时间</p>
            <p className="text-sm font-medium text-gray-900">
              {formatDate(config.last_cleanup_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Info Notice */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-800">
          <strong>注意：</strong>保留期缩短时会自动触发清理，删除超过新保留期的数据。
          永久保留（-1）不会自动删除数据。
        </p>
      </div>
    </div>
  );
}

export default RetentionConfig;
