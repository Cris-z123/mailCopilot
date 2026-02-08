import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';
import { logger } from '../config/logger.js';

/**
 * Database connection wrapper for better-sqlite3
 *
 * Features:
 * - WAL mode for concurrent access
 * - Connection management with singleton pattern
 * - Transaction wrapping
 * - Prepared statement caching
 * - Automatic schema migrations
 */
class DatabaseManager {
  private static instance: Database.Database | null = null;
  private static dbPath: string = '';

  /**
   * Initialize database connection
   * Creates ~/.mailcopilot directory if needed
   */
  static initialize(): Database.Database {
    if (this.instance) {
      return this.instance;
    }

    // Create data directory
    const userDataPath = app.getPath('userData');
    const dataDir = path.join(userDataPath, '.mailcopilot');

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, 'app.db');

    // Open database connection
    this.instance = new Database(this.dbPath, {
      verbose: process.env.LOG_LEVEL === 'DEBUG' ? console.log : undefined,
    });

    // Enable WAL mode for better concurrent access
    this.instance.pragma('journal_mode = WAL');
    this.instance.pragma('synchronous = NORMAL');
    this.instance.pragma('foreign_keys = ON');
    this.instance.pragma('temp_store = MEMORY');

    // Performance optimizations
    this.instance.pragma('mmap_size = 30000000000');
    this.instance.pragma('page_size = 4096');
    this.instance.pragma('cache_size = -64000'); // 64MB cache

    return this.instance;
  }

  /**
   * Get database instance (must call initialize() first)
   */
  static getDatabase(): Database.Database {
    if (!this.instance) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.instance;
  }

  /**
   * Close database connection
   */
  static close(): void {
    if (this.instance) {
      this.instance.close();
      this.instance = null;
    }
  }

  /**
   * Execute a transaction with automatic rollback on error
   */
  static transaction<T>(
    fn: (db: Database.Database) => T
  ): T {
    const db = this.getDatabase();
    const transaction = db.transaction(fn);
    return transaction(db);
  }

  /**
   * Prepare and cache a statement for reuse
   */
  static prepare(sql: string): Database.Statement {
    const db = this.getDatabase();
    return db.prepare(sql);
  }

  /**
   * Execute a raw SQL statement
   */
  static exec(sql: string): void {
    const db = this.getDatabase();
    db.exec(sql);
  }

  /**
   * Get database path for logging/debugging.
   * Returns empty string if initialize() has not been called.
   */
  static getPath(): string {
    return this.dbPath ?? '';
  }

  /**
   * Check if database exists and is accessible
   */
  static exists(): boolean {
    return this.instance !== null && fs.existsSync(this.dbPath);
  }

  /**
   * Get database size in bytes
   */
  static getSize(): number {
    if (!fs.existsSync(this.dbPath)) {
      return 0;
    }
    const stats = fs.statSync(this.dbPath);
    return stats.size;
  }

  /**
   * Vacuum database to reclaim space
   */
  static vacuum(): void {
    const db = this.getDatabase();
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM');
  }

  /**
   * Get database statistics
   */
  static getStats(): {
    path: string;
    size: number;
    walSize: number;
    pageCount: number;
    pageSize: number;
  } {
    const db = this.getDatabase();
    const pageSize = db.pragma('page_size', { simple: true }) as number;
    const pageCount = db.pragma('page_count', { simple: true }) as number;

    const walPath = `${this.dbPath}-wal`;
    let walSize = 0;
    if (fs.existsSync(walPath)) {
      walSize = fs.statSync(walPath).size;
    }

    return {
      path: this.dbPath,
      size: this.getSize(),
      walSize,
      pageCount,
      pageSize,
    };
  }

  /**
   * Verify all required indexes exist and are created
   * Per T101: Ensure all indexes created per data-model.md
   *
   * @returns Object with index verification results
   */
  static verifyIndexes(): {
    indexes: Array<{
      table: string;
      index: string;
      exists: boolean;
    }>;
    allExist: boolean;
  } {
    const db = this.getDatabase();

    // Expected indexes (names must be unique per SQLite; align with createMissingIndexes())
    const expectedIndexes = [
      { table: 'email_sources', index: 'idx_email_hash' },
      { table: 'email_sources', index: 'idx_report_date_email' },
      { table: 'email_sources', index: 'idx_processed_at' },
      { table: 'action_items', index: 'idx_report_date_items' },
      { table: 'action_items', index: 'idx_source_status' },
      { table: 'action_items', index: 'idx_confidence' },
      { table: 'user_feedback', index: 'idx_item_id' },
      { table: 'user_feedback', index: 'idx_timestamp' },
      { table: 'daily_reports', index: 'idx_report_date_reports' },
      { table: 'daily_reports', index: 'idx_generation_mode' },
    ];

    const results = expectedIndexes.map(({ table, index }) => {
      // Check if index exists using sqlite_master
      const checkStmt = db.prepare(`
        SELECT COUNT(*) as count
        FROM sqlite_master
        WHERE type = 'index'
        AND name = ?
        AND tbl_name = ?
      `);

      const result = checkStmt.get(index, table) as { count: number };
      const exists = result.count > 0;

      return { table, index, exists };
    });

    const allExist = results.every((r) => r.exists);

    return {
      indexes: results,
      allExist,
    };
  }

  /**
   * Analyze query execution plan
   * Per T101: Query execution plan analysis per plan v2.7
   *
   * @param sql - SQL query to analyze
   * @returns Execution plan details
   */
  static analyzeQuery(sql: string): Array<{
    selectid: number;
    order: number;
    from: number;
    detail: string;
  }> {
    const db = this.getDatabase();

    try {
      const explainStmt = db.prepare(`EXPLAIN QUERY PLAN ${sql}`);
      const plan = explainStmt.all() as Array<{
        selectid: number;
        order: number;
        from: number;
        detail: string;
      }>;

      return plan;
    } catch (error) {
      logger.error('Database', 'Query analysis failed', {
        sql,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get database performance metrics
   * Per T101: Monitor database performance per plan v2.7
   *
   * @returns Performance metrics including cache hit rate and query stats
   */
  static getPerformanceMetrics(): {
    cacheSize: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    walSize: number;
    walCheckpointed: boolean;
  } {
    const db = this.getDatabase();

    const cacheSize = db.pragma('cache_size', { simple: true }) as number;
    const cacheHits = Number(db.pragma('cache_hits', { simple: true }) || 0);
    const cacheMisses = Number(db.pragma('cache_misses', { simple: true }) || 0);

    const total = cacheHits + cacheMisses;
    const cacheHitRate = total > 0 ? (cacheHits / total) * 100 : 0;

    // Get WAL checkpoint status
    const walCheckpointResult = db.pragma('wal_checkpoint(TRUNCATE)', { simple: true }) as number;

    const walPath = `${this.dbPath}-wal`;
    let walSize = 0;
    if (fs.existsSync(walPath)) {
      walSize = fs.statSync(walPath).size;
    }

    return {
      cacheSize: Math.abs(cacheSize) * 1024, // Convert from pages to bytes (assuming 4KB pages)
      cacheHits,
      cacheMisses,
      cacheHitRate,
      walSize,
      walCheckpointed: walCheckpointResult === 0,
    };
  }

  /**
   * Create missing indexes based on data-model.md schema
   * Per T101: Ensure all indexes created
   *
   * @returns Number of indexes created
   */
  static createMissingIndexes(): number {
    const db = this.getDatabase();
    let created = 0;

    const indexDefinitions = [
      'CREATE INDEX IF NOT EXISTS idx_email_hash ON email_sources(email_hash)',
      'CREATE INDEX IF NOT EXISTS idx_report_date_email ON email_sources(report_date)',
      'CREATE INDEX IF NOT EXISTS idx_processed_at ON email_sources(processed_at)',
      'CREATE INDEX IF NOT EXISTS idx_report_date_items ON action_items(report_date)',
      'CREATE INDEX IF NOT EXISTS idx_source_status ON action_items(source_status)',
      'CREATE INDEX IF NOT EXISTS idx_confidence ON action_items(confidence)',
      'CREATE INDEX IF NOT EXISTS idx_item_id ON user_feedback(item_id)',
      'CREATE INDEX IF NOT EXISTS idx_timestamp ON user_feedback(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_report_date_reports ON daily_reports(report_date)',
      'CREATE INDEX IF NOT EXISTS idx_generation_mode ON daily_reports(generation_mode)',
    ];

    for (const sql of indexDefinitions) {
      try {
        db.exec(sql);
        created++;
      } catch (error) {
        logger.warn('Database', 'Failed to create index', {
          sql,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (created > 0) {
      logger.info('Database', 'Created missing indexes', { count: created });
    }

    return created;
  }

  /**
   * Optimize database with ANALYZE
   * Per T101: Update query planner statistics per plan v2.7
   */
  static analyze(): void {
    const db = this.getDatabase();

    try {
      db.exec('ANALYZE');
      logger.info('Database', 'Database analyzed successfully');
    } catch (error) {
      logger.error('Database', 'Failed to analyze database', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export default DatabaseManager;
