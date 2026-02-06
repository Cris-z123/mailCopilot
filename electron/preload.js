/**
 * Preload Script for Electron Renderer Process
 *
 * This script runs in the renderer process before the web page loads.
 * It uses Electron's contextBridge to expose a safe API to the renderer.
 *
 * @see https://www.electronjs.org/docs/latest/tutorial/context-isolation
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Exposed API for renderer process
 * Only specific IPC channels are exposed (whitelist approach per constitution Principle V)
 */
const electronAPI = {
  // LLM Operations
  llm: {
    generate: (emailBatch) => ipcRenderer.invoke('llm:generate', emailBatch),
  },

  // Database Operations
  database: {
    queryHistory: (params) => ipcRenderer.invoke('db:query:history', params),
    export: (reportDate) => ipcRenderer.invoke('db:export', reportDate),
  },

  // Configuration Management
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (config) => ipcRenderer.invoke('config:set', config),
  },

  // Application Updates
  app: {
    checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  },

  // Email Metadata Fetching
  email: {
    fetchMetadata: (emailHash) => ipcRenderer.invoke('email:fetch-meta', emailHash),
  },

  // Event listeners for renderer-to-main communication
  on: (channel, callback) => {
    const validChannels = [
      'llm:progress',
      'llm:complete',
      'llm:error',
      'config:changed',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  // Remove event listener
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
};

// Expose the API to renderer process via contextBridge
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
