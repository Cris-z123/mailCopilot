/**
 * Mode Switch Card Component
 *
 * Provides UI for switching between local and remote LLM modes.
 * Per plan.md FR-033, FR-034, FR-035: Displays current mode, allows mode switching,
 * shows notification when switch is queued during batch processing.
 *
 * @module renderer/components/Settings/ModeSwitchCard
 */

import { useState, useEffect } from 'react';
import { Info, Loader2 } from 'lucide-react';
import ipcClient from '@renderer/services/ipc-client';

/**
 * Processing mode type
 */
type ProcessingMode = 'local' | 'remote';

/**
 * Mode switch state
 */
interface ModeState {
  currentMode: ProcessingMode;
  pendingMode: ProcessingMode | null;
  isProcessing: boolean;
  switchRequestedAt: number | null;
}

/**
 * Mode display configuration
 */
const MODE_CONFIG = {
  local: {
    label: '本地模式 (Local)',
    description: '使用本地 Ollama 服务，完全离线处理',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  remote: {
    label: '远程模式 (Remote)',
    description: '使用云端 LLM API，需要网络连接',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
} as const;

/**
 * ModeSwitchCard Component
 *
 * Displays current processing mode and allows switching between local/remote modes.
 * Shows notification banner when mode switch is queued during batch processing.
 *
 * Per FR-033: Wait for batch completion before switching
 * Per FR-034: Queue new tasks during switch
 * Per FR-035: Notify user of pending switch
 */
export function ModeSwitchCard() {
  const [modeState, setModeState] = useState<ModeState>({
    currentMode: 'remote',
    pendingMode: null,
    isProcessing: false,
    switchRequestedAt: null,
  });
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load current mode on mount
   */
  useEffect(() => {
    loadCurrentMode();

    // Listen for mode change events from main process
    const cleanupModeChanged = ipcClient.on(
      'mode-changed',
      (_event: Electron.IpcRendererEvent, data: { to: ProcessingMode }) => {
        setModeState((prev) => ({
          ...prev,
          currentMode: data.to,
          pendingMode: null,
          isProcessing: false,
          switchRequestedAt: null,
        }));
        setIsSwitching(false);
      }
    );

    const cleanupSwitchQueued = ipcClient.on(
      'mode-switch-queued',
      (_event: Electron.IpcRendererEvent, data: { to: ProcessingMode; requestedAt: number }) => {
        setModeState((prev) => ({
          ...prev,
          pendingMode: data.to,
          switchRequestedAt: data.requestedAt,
        }));
        setIsSwitching(false);
      }
    );

    const cleanupBatchStart = ipcClient.on('batch-start', (_event: Electron.IpcRendererEvent, _data: unknown) => {
      setModeState((prev) => ({
        ...prev,
        isProcessing: true,
      }));
    });

    const cleanupBatchComplete = ipcClient.on('batch-complete', (_event: Electron.IpcRendererEvent, _data: unknown) => {
      setModeState((prev) => ({
        ...prev,
        isProcessing: false,
      }));
    });

    return () => {
      cleanupModeChanged();
      cleanupSwitchQueued();
      cleanupBatchStart();
      cleanupBatchComplete();
    };
  }, []);

  /**
   * Load current mode from main process
   */
  async function loadCurrentMode() {
    try {
      const result = await ipcClient.invoke('mode:get');
      setModeState((prev) => ({
        ...prev,
        currentMode: result.mode,
        isProcessing: result.isProcessing || false,
      }));
    } catch (err) {
      console.error('Failed to load current mode:', err);
      setError('无法加载当前模式配置');
    }
  }

  /**
   * Request mode switch
   *
   * Sends switch request to main process via IPC.
   * Main process ModeManager determines if switch is immediate or queued.
   *
   * Per FR-033: Wait for batch completion before switching
   */
  async function handleModeSwitch(newMode: ProcessingMode) {
    if (isSwitching || newMode === modeState.currentMode) {
      return;
    }

    setIsSwitching(true);
    setError(null);

    try {
      const result = await ipcClient.invoke('mode:switch', { mode: newMode });

      if (result.success) {
        if (result.queued) {
          // Switch queued for batch completion
          setModeState((prev) => ({
            ...prev,
            pendingMode: newMode,
            switchRequestedAt: Date.now(),
          }));
        } else {
          // Switched immediately
          setModeState((prev) => ({
            ...prev,
            currentMode: newMode,
            pendingMode: null,
          }));
        }
      } else {
        setError(result.error || '模式切换失败');
        setIsSwitching(false);
      }
    } catch (err) {
      console.error('Mode switch failed:', err);
      setError('模式切换失败，请重试');
      setIsSwitching(false);
    }
  }

  /**
   * Cancel pending mode switch
   */
  async function handleCancelSwitch() {
    try {
      await ipcClient.invoke('mode:cancel');
      setModeState((prev) => ({
        ...prev,
        pendingMode: null,
        switchRequestedAt: null,
      }));
    } catch (err) {
      console.error('Failed to cancel switch:', err);
      setError('取消切换失败');
    }
  }

  const currentConfig = MODE_CONFIG[modeState.currentMode];
  const pendingMode = modeState.pendingMode;
  const hasPendingSwitch = pendingMode !== null;
  const pendingConfig = pendingMode !== null ? MODE_CONFIG[pendingMode] : null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">处理模式设置</h2>
        {modeState.isProcessing && (
          <div className="flex items-center text-sm text-amber-600">
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            <span>处理中...</span>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Pending Switch Notification */}
      {hasPendingSwitch && pendingConfig && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start">
            <Info className="w-5 h-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900 mb-1">
                当前任务处理完成后将切换模式，新任务已进入队列等待
              </p>
              <p className="text-xs text-amber-700 mb-2">
                将从 {currentConfig.label} 切换到 {pendingConfig.label}
              </p>
              <button
                onClick={handleCancelSwitch}
                className="text-xs text-amber-800 underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-amber-500 rounded"
              >
                取消切换
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Current Mode Display */}
      <div className={`mb-6 p-4 rounded-lg border ${currentConfig.bgColor} ${currentConfig.borderColor}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 mb-1">当前模式</p>
            <p className={`text-lg font-semibold ${currentConfig.color}`}>
              {currentConfig.label}
            </p>
            <p className="text-xs text-gray-500 mt-1">{currentConfig.description}</p>
          </div>
          <div className={`w-3 h-3 rounded-full ${currentConfig.color.replace('text', 'bg')}`} />
        </div>
      </div>

      {/* Mode Selector */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">选择处理模式</p>

        {/* Remote Mode Option */}
        <label
          className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
            modeState.currentMode === 'remote' && !hasPendingSwitch
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          } ${hasPendingSwitch ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            type="radio"
            name="mode"
            value="remote"
            checked={modeState.currentMode === 'remote' && !hasPendingSwitch}
            onChange={() => handleModeSwitch('remote')}
            disabled={isSwitching || hasPendingSwitch || modeState.currentMode === 'remote'}
            className="mt-1 mr-3"
          />
          <div className="flex-1">
            <p className="font-medium text-gray-900">远程模式 (Remote)</p>
            <p className="text-sm text-gray-600 mt-1">
              使用云端 LLM API 服务处理邮件内容，需要稳定的网络连接
            </p>
            <p className="text-xs text-gray-500 mt-2">
              • 自动检查更新 • 处理速度较快 (~18s/50封) • 需要网络连接
            </p>
          </div>
        </label>

        {/* Local Mode Option */}
        <label
          className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
            modeState.currentMode === 'local' && !hasPendingSwitch
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 hover:border-gray-300'
          } ${hasPendingSwitch ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            type="radio"
            name="mode"
            value="local"
            checked={modeState.currentMode === 'local' && !hasPendingSwitch}
            onChange={() => handleModeSwitch('local')}
            disabled={isSwitching || hasPendingSwitch || modeState.currentMode === 'local'}
            className="mt-1 mr-3"
          />
          <div className="flex-1">
            <p className="font-medium text-gray-900">本地模式 (Local)</p>
            <p className="text-sm text-gray-600 mt-1">
              使用本地 Ollama 服务，完全离线处理，需要先安装 Ollama
            </p>
            <p className="text-xs text-gray-500 mt-2">
              • 手动检查更新 • 处理速度稍慢 (~35s/50封) • 完全离线
            </p>
          </div>
        </label>
      </div>

      {/* Info Footer */}
      <div className="mt-6 p-3 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-600">
          <strong>提示：</strong>
          切换模式时会等待当前批次的邮件处理完成，新任务将自动进入队列。切换立即生效，无需重启应用。
        </p>
      </div>
    </div>
  );
}

export default ModeSwitchCard;
