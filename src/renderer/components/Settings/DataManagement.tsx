/**
 * Data Management Component
 *
 * Provides data management controls including retention settings, cleanup,
 * and update check functionality.
 *
 * Per plan.md FR-039: Local mode requires manual update check trigger.
 *
 * @module renderer/components/Settings/DataManagement
 */

import { useState, useEffect } from 'react';
import { RefreshCw, Download, Trash2, HardDrive, Loader2, CheckCircle, XCircle } from 'lucide-react';
import ipcClient, { IPC_CHANNELS } from '@renderer/services/ipc-client';

/**
 * Update check state
 */
interface UpdateState {
  isChecking: boolean;
  hasUpdate: boolean;
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  error?: string;
  lastChecked?: Date;
}

/**
 * Cleanup state
 */
interface CleanupState {
  isCleaning: boolean;
  message: string;
  error?: string;
}

/**
 * Storage usage info
 */
interface StorageUsage {
  emailMetadataBytes: number;
  feedbackDataBytes: number;
  totalBytes: number;
  lastCleanup?: Date;
}

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
 * DataManagement Component
 *
 * Provides data management controls including:
 * - Manual update check button (especially for local mode per FR-039)
 * - Storage usage display
 * - Manual cleanup button
 * - Export functionality
 */
export function DataManagement() {
  const [updateState, setUpdateState] = useState<UpdateState>({
    isChecking: false,
    hasUpdate: false,
  });
  const [cleanupState, setCleanupState] = useState<CleanupState>({
    isCleaning: false,
    message: '',
  });
  const [storageUsage, setStorageUsage] = useState<StorageUsage>({
    emailMetadataBytes: 0,
    feedbackDataBytes: 0,
    totalBytes: 0,
  });
  // TODO: call setStorageUsage in loadStorageUsage when db:storage-stats is implemented
  void setStorageUsage;

  /**
   * Load storage usage on mount
   */
  useEffect(() => {
    loadStorageUsage();

    // Listen for update events from main process
    const cleanupUpdateAvailable = ipcClient.on(
      'update-available',
      (_event: Electron.IpcRendererEvent, data: { version?: string; releaseDate?: string; releaseNotes?: string }) => {
        setUpdateState({
          isChecking: false,
          hasUpdate: true,
          version: data.version,
          releaseDate: data.releaseDate,
          releaseNotes: data.releaseNotes,
          lastChecked: new Date(),
        });
      }
    );

    const cleanupUpdateNotAvailable = ipcClient.on(
      'update-not-available',
      (_event: Electron.IpcRendererEvent, _data: unknown) => {
        setUpdateState((prev) => ({
          ...prev,
          isChecking: false,
          hasUpdate: false,
          lastChecked: new Date(),
        }));
      }
    );

    const cleanupUpdateError = ipcClient.on(
      'update-error',
      (_event: Electron.IpcRendererEvent, data: { error?: string }) => {
        setUpdateState((prev) => ({
          ...prev,
          isChecking: false,
          error: data.error,
          lastChecked: new Date(),
        }));
      }
    );

    return () => {
      cleanupUpdateAvailable();
      cleanupUpdateNotAvailable();
      cleanupUpdateError();
    };
  }, []);

  /**
   * Load storage usage information
   */
  async function loadStorageUsage() {
    try {
      const result = await ipcClient.invoke(IPC_CHANNELS.RETENTION_GET_STORAGE);

      setStorageUsage({
        emailMetadataBytes: result.email_metadata_bytes,
        feedbackDataBytes: result.feedback_data_bytes,
        totalBytes: result.total_bytes,
      });
    } catch (err) {
      console.error('Failed to load storage usage:', err);
    }
  }

  /**
   * Check for updates manually
   *
   * Per FR-039: Manual trigger for local mode update checks
   */
  async function handleCheckUpdates() {
    setUpdateState((prev) => ({
      ...prev,
      isChecking: true,
      error: undefined,
    }));

    try {
      const result = await ipcClient.invoke(IPC_CHANNELS.APP_CHECK_UPDATE, { manual: true });

      if (result.success) {
        setUpdateState((prev) => ({
          ...prev,
          isChecking: false,
          hasUpdate: result.hasUpdate,
          version: result.version,
          releaseDate: result.releaseDate,
          releaseNotes: result.releaseNotes,
          lastChecked: new Date(),
        }));
      } else {
        setUpdateState((prev) => ({
          ...prev,
          isChecking: false,
          error: result.error || '检查更新失败',
          lastChecked: new Date(),
        }));
      }
    } catch (err) {
      console.error('Update check failed:', err);
      setUpdateState((prev) => ({
        ...prev,
        isChecking: false,
        error: '检查更新失败，请重试',
        lastChecked: new Date(),
      }));
    }
  }

  /**
   * Download and install update
   */
  async function handleDownloadUpdate() {
    try {
      await ipcClient.invoke(IPC_CHANNELS.APP_DOWNLOAD_UPDATE);
      // TODO: Show download progress and install prompt
    } catch (err) {
      console.error('Failed to download update:', err);
    }
  }

  /**
   * Manual cleanup of old data
   *
   * Per FR-048: "清理30天前数据" button (one-time cleanup regardless of retention setting)
   */
  async function handleManualCleanup() {
    setCleanupState({
      isCleaning: true,
      message: '正在清理数据...',
    });

    try {
      const result = await ipcClient.invoke(IPC_CHANNELS.RETENTION_MANUAL_CLEANUP, {
        confirm: true,
      });

      if (result.success) {
        setCleanupState({
          isCleaning: false,
          message: result.message,
        });

        // Refresh storage usage
        await loadStorageUsage();

        // Clear message after 5 seconds
        setTimeout(() => {
          setCleanupState((prev) => ({
            ...prev,
            message: '',
          }));
        }, 5000);
      } else {
        setCleanupState({
          isCleaning: false,
          message: '',
          error: result.message || '清理失败',
        });
      }
    } catch (err) {
      console.error('Manual cleanup failed:', err);
      setCleanupState({
        isCleaning: false,
        message: '',
        error: '清理失败，请重试',
      });
    }
  }

  /**
   * Export data
   */
  async function handleExportData() {
    try {
      const result = await ipcClient.invoke('db:export', {
        format: 'json',
      });

      if (result.success) {
        setCleanupState({
          isCleaning: false,
          message: `数据已导出到 ${result.filePath}`,
        });

        setTimeout(() => {
          setCleanupState((prev) => ({
            ...prev,
            message: '',
          }));
        }, 5000);
      } else {
        setCleanupState({
          isCleaning: false,
          message: '',
          error: result.error || '导出失败',
        });
      }
    } catch (err) {
      console.error('Export failed:', err);
      setCleanupState({
        isCleaning: false,
        message: '',
        error: '导出失败，请重试',
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Update Check Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">更新检查</h3>

        {/* Update Status */}
        {updateState.hasUpdate && updateState.version && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start">
              <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  发现新版本 {updateState.version}
                </p>
                {updateState.releaseDate && (
                  <p className="text-xs text-blue-700 mb-2">
                    发布日期：{new Date(updateState.releaseDate).toLocaleDateString('zh-CN')}
                  </p>
                )}
                {updateState.releaseNotes && (
                  <div className="text-xs text-blue-700 mb-3">
                    <p className="font-medium mb-1">更新内容：</p>
                    <pre className="whitespace-pre-wrap font-sans">{updateState.releaseNotes}</pre>
                  </div>
                )}
                <button
                  onClick={handleDownloadUpdate}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <Download className="w-4 h-3 mr-1" />
                  下载并安装
                </button>
              </div>
            </div>
          </div>
        )}

        {!updateState.hasUpdate && updateState.lastChecked && !updateState.error && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-1">
                  已是最新版本
                </p>
                <p className="text-xs text-green-700">
                  最后检查时间：{updateState.lastChecked.toLocaleString('zh-CN')}
                </p>
              </div>
            </div>
          </div>
        )}

        {updateState.error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <XCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900 mb-1">
                  检查更新失败
                </p>
                <p className="text-xs text-red-700">{updateState.error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Manual Check Button */}
        <button
          onClick={handleCheckUpdates}
          disabled={updateState.isChecking}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {updateState.isChecking ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              正在检查...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              手动检查更新
            </>
          )}
        </button>

        <p className="text-xs text-gray-500 mt-2">
          {updateState.lastChecked
            ? `上次检查：${updateState.lastChecked.toLocaleString('zh-CN')}`
            : '尚未检查过更新'}
        </p>
      </div>

      {/* Storage Usage Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">存储使用情况</h3>

        <div className="flex items-center mb-4">
          <HardDrive className="w-5 h-5 text-gray-600 mr-3" />
          <div className="flex-1">
            <p className="text-sm text-gray-600">总存储使用</p>
            <p className="text-lg font-semibold text-gray-900">
              {formatBytes(storageUsage.totalBytes)}
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">邮件元数据</span>
            <span className="font-medium text-gray-900">
              {formatBytes(storageUsage.emailMetadataBytes)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">反馈数据</span>
            <span className="font-medium text-gray-900">
              {formatBytes(storageUsage.feedbackDataBytes)}
            </span>
          </div>
        </div>

        {/* Cleanup Status */}
        {cleanupState.message && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700">{cleanupState.message}</p>
          </div>
        )}

        {cleanupState.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{cleanupState.error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleManualCleanup}
            disabled={cleanupState.isCleaning}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cleanupState.isCleaning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                正在清理...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                清理30天前数据
              </>
            )}
          </button>

          <button
            onClick={handleExportData}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Download className="w-4 h-4 mr-2" />
            导出数据
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          清理操作将删除30天前的邮件元数据和反馈数据（无论当前保留设置如何）。
        </p>
      </div>
    </div>
  );
}

export default DataManagement;
