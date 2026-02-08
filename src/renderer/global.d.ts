/**
 * Renderer Process Global Type Declarations
 *
 * Extends the global Window interface with Electron IPC APIs.
 */

import { IpcRendererEvent } from 'electron';

declare global {
  interface Window {
    /**
     * Electron IPC bridge for renderer-to-main communication
     */
    ipc: {
      /**
       * Invoke a main process handler and get a promise result
       */
      invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;

      /**
       * Send a message to main process (no response expected)
       */
      send(channel: string, ...args: unknown[]): void;

      /**
       * Listen to messages from main process
       */
      on(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): void;

      /**
       * Remove listener for main process messages
       */
      removeListener(channel: string, listener: (...args: unknown[]) => void): void;
    };
  }
}

export {};
