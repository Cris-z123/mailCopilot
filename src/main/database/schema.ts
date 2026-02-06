import DatabaseManager from './Database.js';
import fs from 'fs';
import path from 'path';

/**
 * Database schema manager
 *
 * Features:
 * - Migration execution with versioning
 * - Schema initialization from SQL files
 * - Version tracking in app_metadata table
 */
export class SchemaManager {
  private static readonly MIGRATIONS_DIR = path.join(__dirname, 'migrations');
  private static readonly CURRENT_SCHEMA_VERSION = '1.0';

  /**
   * Initialize database schema
   * - Creates tables if they don't exist
   * - Runs migrations if needed
   */
  static async initialize(): Promise<void> {
    const db = DatabaseManager.getDatabase();

    // Check if schema needs initialization
    const schemaVersion = db
      .prepare('SELECT value FROM app_metadata WHERE key = ?')
      .get('schema_version') as { value: string } | undefined;

    if (!schemaVersion) {
      // First run - execute initial schema
      await this.runInitialSchema();
    } else if (schemaVersion.value !== this.CURRENT_SCHEMA_VERSION) {
      // Schema version mismatch - would run migrations here
      // For now, we'll just log a warning
      console.warn(`Schema version mismatch: expected ${this.CURRENT_SCHEMA_VERSION}, got ${schemaVersion.value}`);
    }
  }

  /**
   * Run initial schema creation
   */
  private static async runInitialSchema(): Promise<void> {
    const migrationPath = path.join(this.MIGRATIONS_DIR, '001_initial_schema.sql');

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf-8');

    try {
      DatabaseManager.exec(sql);
      console.log('Database schema initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database schema:', error);
      throw error;
    }
  }

  /**
   * Get current schema version
   */
  static getVersion(): string {
    const db = DatabaseManager.getDatabase();
    const result = db
      .prepare('SELECT value FROM app_metadata WHERE key = ?')
      .get('schema_version') as { value: string } | undefined;

    return result?.value || 'unknown';
  }

  /**
   * Check if specific table exists
   */
  static tableExists(tableName: string): boolean {
    const db = DatabaseManager.getDatabase();
    const result = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      )
      .get(tableName) as { name: string } | undefined;

    return !!result;
  }

  /**
   * Check if specific index exists
   */
  static indexExists(indexName: string): boolean {
    const db = DatabaseManager.getDatabase();
    const result = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name=?"
      )
      .get(indexName) as { name: string } | undefined;

    return !!result;
  }

  /**
   * Get table row count
   */
  static getRowCount(tableName: string): number {
    const db = DatabaseManager.getDatabase();
    const result = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
    return result.count;
  }

  /**
   * Validate schema integrity
   * - Checks all required tables exist
   * - Checks all required indexes exist
   */
  static validateIntegrity(): {
    isValid: boolean;
    missingTables: string[];
    missingIndexes: string[];
  } {
    const requiredTables = [
      'app_metadata',
      'user_config',
      'daily_reports',
      'todo_items',
      'item_email_refs',
      'processed_emails',
      'app_logs',
    ];

    const requiredIndexes = [
      'idx_reports_created',
      'idx_items_report_date',
      'idx_items_type',
      'idx_items_source_status',
      'idx_refs_item',
      'idx_refs_email',
      'idx_emails_report',
      'idx_logs_timestamp',
    ];

    const missingTables = requiredTables.filter((table) => !this.tableExists(table));
    const missingIndexes = requiredIndexes.filter((index) => !this.indexExists(index));

    return {
      isValid: missingTables.length === 0 && missingIndexes.length === 0,
      missingTables,
      missingIndexes,
    };
  }

  /**
   * Get database statistics
   */
  static getStatistics(): {
    version: string;
    tables: Record<string, number>;
    totalItems: number;
    totalEmails: number;
    totalReports: number;
  } {
    const tables: Record<string, number> = {};

    for (const table of [
      'daily_reports',
      'todo_items',
      'processed_emails',
      'item_email_refs',
      'user_config',
      'app_logs',
    ]) {
      try {
        tables[table] = this.getRowCount(table);
      } catch {
        tables[table] = 0;
      }
    }

    return {
      version: this.getVersion(),
      tables,
      totalItems: tables.todo_items || 0,
      totalEmails: tables.processed_emails || 0,
      totalReports: tables.daily_reports || 0,
    };
  }

  /**
   * Reset database (development/testing only)
   *
   * WARNING: This will delete ALL data
   */
  static reset(): void {
    const db = DatabaseManager.getDatabase();

    // Drop all tables
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;

    for (const table of tables) {
      if (table.name !== 'sqlite_sequence') {
        db.prepare(`DROP TABLE IF EXISTS ${table.name}`).run();
      }
    }

    // Drop all indexes
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as Array<{ name: string }>;

    for (const index of indexes) {
      db.prepare(`DROP INDEX IF EXISTS ${index.name}`).run();
    }

    console.log('Database reset complete');
  }
}

export default SchemaManager;
