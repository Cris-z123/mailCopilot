/**
 * IPC Client Service
 *
 * Service layer for IPC communication between renderer and main process.
 * Provides type-safe wrappers for all IPC channels.
 *
 * Per Constitution Principle V: Only whitelisted channels are used.
 */

import type {
  ElectronAPI,
  Item,
  TodoItemWithSources,
} from '@shared/types/index.js';

/**
 * IPC Client class
 *
 * Provides type-safe methods to communicate with main process via ElectronAPI
 */
class IPCClient {
  private api: ElectronAPI;

  constructor() {
    // Access ElectronAPI exposed by preload script
    this.api = window.electronAPI || this.createMockAPI();
  }

  /**
   * Create mock API for development/testing (when running without Electron)
   */
  private createMockAPI(): ElectronAPI {
    console.warn('[IPC] ElectronAPI not found, using mock API');
    return {
      llm: {
        generate: async () => ({
          success: false,
          items: [],
          processed_emails: [],
          skipped_emails: 0,
          reprocessed_emails: 0,
        }),
      },
      db: {
        queryHistory: async () => [],
        export: async () => ({
          success: false,
          filePath: '',
          format: 'markdown',
          itemCount: 0,
        }),
      },
      config: {
        get: async () => ({}),
        set: async () => ({ success: true, updated: [] }),
      },
      app: {
        checkUpdate: async () => ({ hasUpdate: false }),
      },
      email: {
        fetchMeta: async () => ({
          success: false,
          error: 'Mock API: Not running in Electron',
        }),
      },
    };
  }

  // =============================================================================
  // LLM Operations
  // =============================================================================

  /**
   * Generate action items from email batch
   * Channel: llm:generate
   */
  async generateItems(request: {
    emails: Array<{ filePath: string; format: string }>;
    mode: 'local' | 'remote';
    reportDate: string;
  }): Promise<{
    success: boolean;
    items: Item[];
    processed_emails: Array<{
      email_hash: string;
      search_string: string;
      file_path: string;
      extract_status: string;
    }>;
    skipped_emails: number;
    reprocessed_emails: number;
  }> {
    try {
      const response = await this.api.llm.generate(request);
      return response;
    } catch (error) {
      console.error('[IPC] LLM generate failed:', error);
      throw new Error(`LLM generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // =============================================================================
  // Database Operations
  // =============================================================================

  /**
   * Query database for reports or items
   * Channel: db:query:history
   */
  async queryHistory(request: {
    query: string;
    params?: Record<string, unknown>;
  }): Promise<TodoItemWithSources[]> {
    try {
      const items = await this.api.db.queryHistory(request);
      return items;
    } catch (error) {
      console.error('[IPC] DB query failed:', error);
      throw new Error(`Database query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export database to file
   * Channel: db:export
   */
  async exportData(request: {
    format: 'markdown' | 'pdf';
    reportDate?: string;
    startDate?: string;
    endDate?: string;
    includeAll?: boolean;
  }): Promise<{
    success: boolean;
    filePath: string;
    format: string;
    itemCount: number;
  }> {
    try {
      const response = await this.api.db.export(request);
      return response;
    } catch (error) {
      console.error('[IPC] DB export failed:', error);
      throw new Error(`Database export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // =============================================================================
  // Configuration Operations
  // =============================================================================

  /**
   * Get configuration values
   * Channel: config:get
   */
  async getConfig(keys?: string[]): Promise<Record<string, unknown>> {
    try {
      const config = await this.api.config.get(keys);
      return config;
    } catch (error) {
      console.error('[IPC] Config get failed:', error);
      throw new Error(`Config get failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Set configuration values
   * Channel: config:set
   */
  async setConfig(updates: Record<string, unknown>): Promise<{
    success: boolean;
    updated: string[];
  }> {
    try {
      const response = await this.api.config.set(updates);
      return response;
    } catch (error) {
      console.error('[IPC] Config set failed:', error);
      throw new Error(`Config set failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // =============================================================================
  // Application Operations
  // =============================================================================

  /**
   * Check for application updates
   * Channel: app:check-update
   */
  async checkUpdate(mode: 'auto' | 'manual'): Promise<{
    hasUpdate: boolean;
    version?: string;
    releaseNotes?: string;
    downloadUrl?: string;
  }> {
    try {
      const updateInfo = await this.api.app.checkUpdate(mode);
      return updateInfo;
    } catch (error) {
      console.error('[IPC] Update check failed:', error);
      throw new Error(`Update check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // =============================================================================
  // Email Operations
  // =============================================================================

  /**
   * Fetch email metadata without processing
   * Channel: email:fetch-meta
   */
  async fetchEmailMeta(filePath: string, format: string): Promise<{
    success: boolean;
    metadata?: {
      from?: string;
      subject?: string;
      date?: string;
      attachmentCount?: number;
      size?: number;
      format?: string;
    };
    error?: string;
  }> {
    try {
      const response = await this.api.email.fetchMeta(filePath, format);
      return response;
    } catch (error) {
      console.error('[IPC] Email metadata fetch failed:', error);
      throw new Error(`Email metadata fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const ipcClient = new IPCClient();

// Export class for testing
export default IPCClient;
