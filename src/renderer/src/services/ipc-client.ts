/**
 * IPC Client Service
 *
 * Provides type-safe IPC communication layer between renderer and main processes.
 * Wraps Electron's IPC API with Promise-based interface and event handling.
 *
 * @module renderer/services/ipc-client
 */

import { ipcRenderer } from 'electron';

/**
 * IPC channel names (whitelist per constitution Principle V)
 */
export const IPC_CHANNELS = {
  MODE_GET: 'mode:get',
  MODE_SWITCH: 'mode:switch',
  MODE_CANCEL: 'mode:cancel',
  LLM_GENERATE: 'llm:generate',
  DB_QUERY_HISTORY: 'db:query:history',
  DB_EXPORT: 'db:export',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  APP_CHECK_UPDATE: 'app:check-update',
  EMAIL_FETCH_META: 'email:fetch-meta',
} as const;

/**
 * IPC request/response types
 */
export interface ModeSwitchRequest {
  mode: 'local' | 'remote';
}

export interface ModeSwitchResponse {
  success: boolean;
  queued?: boolean;
  currentMode?: 'local' | 'remote';
  pendingMode?: 'local' | 'remote' | null;
  error?: string;
}

export interface ModeGetResponse {
  mode: 'local' | 'remote';
  isProcessing: boolean;
  pendingMode?: 'local' | 'remote' | null;
}

/**
 * IPC Client class
 *
 * Provides Promise-based IPC communication with main process.
 * Handles both invoke (request-response) and on (event) patterns.
 */
class IPCClient {
  /**
   * Send IPC request and wait for response
   *
   * @param channel - IPC channel name
   * @param data - Request data
   * @returns Promise with response data
   */
  async invoke<T = any>(channel: string, data?: any): Promise<T> {
    try {
      const response = await ipcRenderer.invoke(channel, data);
      return response as T;
    } catch (error) {
      console.error(`IPC invoke failed (${channel}):`, error);
      throw error;
    }
  }

  /**
   * Listen to IPC event from main process
   *
   * @param channel - Event channel name
   * @param callback - Event handler callback
   * @returns Cleanup function to remove listener
   */
  on(channel: string, callback: (event: Electron.IpcRendererEvent, ...args: any[]) => void): () => void {
    ipcRenderer.on(channel, callback);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(channel, callback);
    };
  }

  /**
   * Listen to IPC event once
   *
   * @param channel - Event channel name
   * @param callback - Event handler callback
   * @returns Cleanup function to remove listener
   */
  once(channel: string, callback: (event: Electron.IpcRendererEvent, ...args: any[]) => void): () => void {
    ipcRenderer.once(channel, callback);

    // Return cleanup function (though once removes itself after firing)
    return () => {
      ipcRenderer.removeListener(channel, callback);
    };
  }

  /**
   * Send IPC message without waiting for response
   *
   * @param channel - IPC channel name
   * @param data - Message data
   */
  send(channel: string, data?: any): void {
    try {
      ipcRenderer.send(channel, data);
    } catch (error) {
      console.error(`IPC send failed (${channel}):`, error);
      throw error;
    }
  }
}

/**
 * Singleton IPC client instance
 */
const ipcClient = new IPCClient();

export default ipcClient;
