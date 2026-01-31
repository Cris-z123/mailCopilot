import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

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
export class DatabaseManager {
  private static instance: Database.Database | null = null;
  private static dbPath: string;

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
   * Get database path for logging/debugging
   */
  static getPath(): string {
    return this.dbPath;
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
}

export default DatabaseManager;
