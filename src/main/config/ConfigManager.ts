import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import DatabaseManager from '../database/Database.js';
import * as encryption from './encryption.js';
import type { CryptoKey } from './encryption.js';

/** Directory for storing encrypted key files (userData) */
function getKeyStorageDir(): string {
  return path.join(app.getPath('userData'), 'keys');
}

/** Path for encrypted encryption key file */
function getEncryptionKeyPath(): string {
  return path.join(getKeyStorageDir(), 'encryption.key');
}

/** Path for encrypted HMAC key file */
function getHmacKeyPath(): string {
  return path.join(getKeyStorageDir(), 'hmac.key');
}

/**
 * Configuration Manager with device-bound encryption
 *
 * Features:
 * - Electron safeStorage for key management
 * - Device-bound keys (no export/migration)
 * - AES-256-GCM field encryption
 * - HMAC-SHA256 integrity protection
 * - Auto-initialization on first run
 */
export class ConfigManager {
  private static encryptionKey: CryptoKey | null = null;
  private static hmacKey: CryptoKey | null = null;
  private static isInitialized = false;

  /**
   * Initialize config manager
   * - Generates or loads encryption key from safeStorage
   * - Creates HMAC key for integrity checking
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('SafeStorage encryption is not available on this system');
      }

      const keyDir = getKeyStorageDir();
      const encryptionKeyPath = getEncryptionKeyPath();
      const hmacKeyPath = getHmacKeyPath();

      // Ensure key directory exists
      if (!fs.existsSync(keyDir)) {
        fs.mkdirSync(keyDir, { recursive: true });
      }

      // Load or generate encryption key (using Electron safeStorage + file)
      if (fs.existsSync(encryptionKeyPath)) {
        const encrypted = fs.readFileSync(encryptionKeyPath);
        const plain = safeStorage.decryptString(encrypted);
        this.encryptionKey = await encryption.importKey(plain);
      } else {
        this.encryptionKey = await encryption.generateKey();
        const exportedKey = await encryption.exportKey(this.encryptionKey);
        const encrypted = safeStorage.encryptString(exportedKey);
        fs.writeFileSync(encryptionKeyPath, encrypted);
      }

      // Load or generate HMAC key
      if (fs.existsSync(hmacKeyPath)) {
        const encrypted = fs.readFileSync(hmacKeyPath);
        const plain = safeStorage.decryptString(encrypted);
        this.hmacKey = await encryption.importHMACKey(plain);
      } else {
        this.hmacKey = await encryption.generateHMACKey();
        const exportedHmacKey = await encryption.exportKey(this.hmacKey as CryptoKey);
        const encrypted = safeStorage.encryptString(exportedHmacKey);
        fs.writeFileSync(hmacKeyPath, encrypted);
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to access encryption key. Device environment may have changed.', error);
      throw new Error('CONFIG_KEY_ACCESS_FAILED');
    }
  }

  /**
   * Get configuration value(s)
   *
   * @param keys - Optional array of keys to retrieve (returns all if not specified)
   * @returns Decrypted config values
   */
  static async get(keys?: string[]): Promise<Record<string, any>> {
    await this.ensureInitialized();

    const db = DatabaseManager.getDatabase();
    let query = 'SELECT config_key, config_value FROM user_config';

    const params: string[] = [];
    if (keys && keys.length > 0) {
      query += ' WHERE config_key IN (' + keys.map(() => '?').join(',') + ')';
      params.push(...keys);
    }

    const rows = db.prepare(query).all(...params) as Array<{
      config_key: string;
      config_value: string | Buffer;
    }>;

    const config: Record<string, any> = {};

    for (const row of rows) {
      try {
        const blob = row.config_value;
        const configValueStr =
          typeof blob === 'string' ? blob : Buffer.from(blob).toString('utf8');
        const decrypted = await encryption.decryptField(
          this.encryptionKey!,
          configValueStr
        );
        config[row.config_key] = JSON.parse(decrypted);
      } catch (error) {
        console.error(`Failed to decrypt config key: ${row.config_key}`, error);
        config[row.config_key] = null;
      }
    }

    return config;
  }

  /**
   * Set configuration value(s)
   *
   * @param updates - Key-value pairs to update
   * @returns List of keys that were updated
   */
  static async set(updates: Record<string, any>): Promise<string[]> {
    await this.ensureInitialized();

    const db = DatabaseManager.getDatabase();
    const entries: Array<{ key: string; encrypted: string }> = [];

    for (const [key, value] of Object.entries(updates)) {
      const jsonValue = JSON.stringify(value);
      const encrypted = await encryption.encryptField(
        this.encryptionKey!,
        jsonValue
      );
      await encryption.hmacSha256(this.hmacKey!, jsonValue);
      entries.push({ key, encrypted });
    }

    DatabaseManager.transaction(() => {
      for (const { key, encrypted } of entries) {
        const existing = db
          .prepare('SELECT config_key FROM user_config WHERE config_key = ?')
          .get(key);

        const blob = Buffer.from(encrypted, 'utf8');
        if (existing) {
          db.prepare(
            "UPDATE user_config SET config_value = ?, updated_at = strftime('%s', 'now') WHERE config_key = ?"
          ).run(blob, key);
        } else {
          db.prepare(
            "INSERT INTO user_config (config_key, config_value, updated_at) VALUES (?, ?, strftime('%s', 'now'))"
          ).run(key, blob);
        }
      }
    });

    return entries.map((e) => e.key);
  }

  /**
   * Delete configuration key(s)
   *
   * @param keys - Keys to delete
   */
  static async delete(keys: string[]): Promise<void> {
    await this.ensureInitialized();

    const db = DatabaseManager.getDatabase();
    const placeholders = keys.map(() => '?').join(',');

    db.prepare(`DELETE FROM user_config WHERE config_key IN (${placeholders})`).run(...keys);
  }

  /**
   * Check if device environment has changed (keyring access failure)
   *
   * @returns true if keys are accessible, false if device changed
   */
  static async checkDeviceIntegrity(): Promise<boolean> {
    try {
      await this.initialize();
      return true;
    } catch (error) {
      if ((error as Error).message === 'CONFIG_KEY_ACCESS_FAILED') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get default configuration
   */
  static getDefaults(): Record<string, any> {
    return {
      'llm.mode': 'remote', // Default to remote mode per FR-031
      'llm.localEndpoint': 'http://localhost:11434',
      'storage.retentionDays': 90,
      'storage.feedbackRetentionDays': 30,
      'update.autoCheck': true,
      'update.lastCheck': null,
      'ui.theme': 'system',
      'ui.language': 'zh-CN',
    };
  }

  /**
   * Initialize default config on first run
   */
  static async initializeDefaults(): Promise<void> {
    const existing = await this.get();
    const defaults = this.getDefaults();

    const newDefaults: Record<string, any> = {};

    for (const [key, value] of Object.entries(defaults)) {
      if (!(key in existing)) {
        newDefaults[key] = value;
      }
    }

    if (Object.keys(newDefaults).length > 0) {
      await this.set(newDefaults);
    }
  }

  /**
   * Ensure manager is initialized before operations
   */
  private static async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Clear all config (development/testing only)
   *
   * WARNING: This will delete all user configuration
   */
  static async clearAll(): Promise<void> {
    const db = DatabaseManager.getDatabase();
    db.prepare('DELETE FROM user_config').run();
  }

  /**
   * Reset to defaults (development/testing only)
   */
  static async resetToDefaults(): Promise<void> {
    await this.clearAll();
    await this.initializeDefaults();
  }

  /**
   * Export config for debugging (NOT for production - keys are device-bound)
   *
   * @returns Plain text config (WARNING: unencrypted)
   */
  static async exportDebug(): Promise<Record<string, any>> {
    return await this.get();
  }

  /**
   * Get encryption key for field-level encryption
   *
   * Used by entities to encrypt/decrypt sensitive fields.
   * Must be called after initialize().
   *
   * @returns CryptoKey for AES-256-GCM encryption
   * @throws Error if ConfigManager not initialized
   */
  static getEncryptionKey(): CryptoKey {
    if (!this.isInitialized || !this.encryptionKey) {
      throw new Error('ConfigManager not initialized. Call ConfigManager.initialize() first.');
    }
    return this.encryptionKey;
  }

  /**
   * Encrypt a field value using the encryption key
   *
   * Convenience method for entities to encrypt sensitive fields.
   *
   * @param value - Plain text value to encrypt
   * @returns JSON string of encrypted data
   */
  static async encryptField(value: string): Promise<string> {
    const key = this.getEncryptionKey();
    return await encryption.encryptField(key, value);
  }

  /**
   * Decrypt a field value using the encryption key
   *
   * Convenience method for entities to decrypt sensitive fields.
   *
   * @param blob - JSON string of encrypted data
   * @returns Decrypted plain text value
   */
  static async decryptField(blob: string): Promise<string> {
    const key = this.getEncryptionKey();
    return await encryption.decryptField(key, blob);
  }
}
