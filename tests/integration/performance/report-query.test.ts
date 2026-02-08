/**
 * Performance Test: 1000-Report Query
 *
 * Per T103: Performance test for 1000-report query to verify <100ms execution per SC-017
 *
 * SC-017: Query performance target
 * - 1000 reports query must execute in <100ms
 * - Measured on reference hardware (i5 processor, 8GB RAM)
 * - Tests database query optimization (indexes, WAL mode, caching)
 *
 * Test approach:
 * 1. Insert 1000 report records into database
 * 2. Execute query to fetch all reports
 * 3. Measure query execution time
 * 4. Verify execution time < 100ms
 * 5. Verify query execution plan uses indexes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, '.temp', 'performance-test.db');

/**
 * Performance test suite for report query performance
 */
describe('Report Query Performance (T103)', () => {
  let db: Database.Database;

  /**
   * Setup test database with schema and sample data
   */
  beforeAll(() => {
    // Create test database directory
    const testDir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Remove existing test database if present
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Create test database
    db = new Database(TEST_DB_PATH);

    // Enable performance optimizations (same as production)
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    db.pragma('temp_store = MEMORY');
    db.pragma('mmap_size = 30000000000');
    db.pragma('page_size = 4096');
    db.pragma('cache_size = -64000'); // 64MB cache

    // Create tables based on data-model.md schema
    createSchema(db);

    // Create indexes based on data-model.md
    createIndexes(db);

    // Insert 1000 sample reports
    insertSampleReports(db, 1000);

    // Run ANALYZE to update query planner statistics
    db.exec('ANALYZE');
  });

  /**
   * Cleanup test database
   */
  afterAll(() => {
    if (db) {
      db.close();
    }

    // Remove test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Remove WAL files
    const walPath = `${TEST_DB_PATH}-wal`;
    const shmPath = `${TEST_DB_PATH}-shm`;

    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }

    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
    }
  });

  /**
   * Test: Query 1000 reports should execute in <100ms per SC-017
   */
  it('should query 1000 reports in less than 100ms (SC-017)', () => {
    const query = `
      SELECT
        report_date,
        generation_mode,
        completed_count,
        pending_count,
        created_at,
        updated_at
      FROM daily_reports
      ORDER BY report_date DESC
    `;

    // Measure query execution time
    const startTime = performance.now();
    const stmt = db.prepare(query);
    const result = stmt.all();
    const endTime = performance.now();
    const executionTime = endTime - startTime;

    // Verify result count
    expect(result).toHaveLength(1000);

    // Verify performance target: <100ms per SC-017
    expect(executionTime).toBeLessThan(100);

    // Log performance metrics for reference
    console.log(`[SC-017] Query Performance:`);
    console.log(`  Reports: ${result.length}`);
    console.log(`  Execution Time: ${executionTime.toFixed(2)}ms`);
    console.log(`  Target: <100ms`);
    console.log(`  Status: ${executionTime < 100 ? '✓ PASS' : '✗ FAIL'}`);
  });

  /**
   * Test: Query with date filter should execute in <100ms
   */
  it('should query reports by date range in less than 100ms', () => {
    const query = `
      SELECT
        report_date,
        generation_mode,
        completed_count,
        pending_count
      FROM daily_reports
      WHERE report_date BETWEEN '2024-01-01' AND '2024-12-31'
      ORDER BY report_date DESC
    `;

    const startTime = performance.now();
    const stmt = db.prepare(query);
    const result = stmt.all();
    const endTime = performance.now();
    const executionTime = endTime - startTime;

    // Should return all 1000 reports (all dates in 2024)
    expect(result).toHaveLength(1000);

    // Verify performance target
    expect(executionTime).toBeLessThan(100);

    console.log(`[SC-017] Date Range Query Performance: ${executionTime.toFixed(2)}ms`);
  });

  /**
   * Test: Query with aggregation should execute in <100ms
   */
  it('should query report statistics in less than 100ms', () => {
    const query = `
      SELECT
        generation_mode,
        COUNT(*) as total_reports,
        SUM(completed_count) as total_completed,
        SUM(pending_count) as total_pending,
        AVG(completed_count) as avg_completed,
        AVG(pending_count) as avg_pending
      FROM daily_reports
      GROUP BY generation_mode
    `;

    const startTime = performance.now();
    const stmt = db.prepare(query);
    const result = stmt.all();
    const endTime = performance.now();
    const executionTime = endTime - startTime;

    // Should return 2 rows (local and remote modes)
    expect(result).toHaveLength(2);

    // Verify performance target
    expect(executionTime).toBeLessThan(100);

    console.log(`[SC-017] Aggregation Query Performance: ${executionTime.toFixed(2)}ms`);
  });

  /**
   * Test: Verify query execution plan uses indexes
   */
  it('should use indexes for report_date query (T101)', () => {
    const query = `
      SELECT report_date, completed_count, pending_count
      FROM daily_reports
      WHERE report_date = '2024-06-15'
    `;

    // Get query execution plan
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all();

    // Verify that index is used (plan should contain "USING INDEX")
    const planString = JSON.stringify(plan);
    expect(planString).toMatch(/USING INDEX/i);

    console.log(`[T101] Query Execution Plan:`, JSON.stringify(plan, null, 2));
  });

  /**
   * Test: Verify index scan performance
   */
  it('should use index scan for efficient date queries', () => {
    const query = `
      SELECT report_date, generation_mode
      FROM daily_reports
      WHERE report_date IN ('2024-01-01', '2024-06-15', '2024-12-31')
    `;

    const startTime = performance.now();
    const stmt = db.prepare(query);
    const result = stmt.all();
    const endTime = performance.now();
    const executionTime = endTime - startTime;

    expect(result).toHaveLength(3);
    expect(executionTime).toBeLessThan(100);

    console.log(`[T101] Index Scan Performance: ${executionTime.toFixed(2)}ms`);
  });

  /**
   * Test: Verify database performance metrics
   */
  it('should report cache hit rate and performance metrics (T101)', () => {
    const cacheSize = db.pragma('cache_size', { simple: true }) as number;
    const cacheHits = Number(db.pragma('cache_hits', { simple: true }) || 0);
    const cacheMisses = Number(db.pragma('cache_misses', { simple: true }) || 0);

    const total = cacheHits + cacheMisses;
    const cacheHitRate = total > 0 ? (cacheHits / total) * 100 : 0;

    console.log(`[T101] Database Performance Metrics:`);
    console.log(`  Cache Size: ${Math.abs(cacheSize)} pages`);
    console.log(`  Cache Hits: ${cacheHits}`);
    console.log(`  Cache Misses: ${cacheMisses}`);
    console.log(`  Cache Hit Rate: ${cacheHitRate.toFixed(2)}%`);

    // Cache should have some activity after previous queries
    expect(total).toBeGreaterThan(0);
  });
});

/**
 * Create database schema based on data-model.md
 */
function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_date TEXT UNIQUE NOT NULL,
      generation_mode TEXT NOT NULL,
      completed_count INTEGER NOT NULL,
      pending_count INTEGER NOT NULL,
      content_encrypted TEXT NOT NULL,
      content_checksum TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS action_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_encrypted TEXT NOT NULL,
      item_type TEXT NOT NULL,
      confidence REAL NOT NULL,
      source_status TEXT NOT NULL,
      evidence TEXT NOT NULL,
      report_date TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (report_date) REFERENCES daily_reports(report_date)
    );

    CREATE TABLE IF NOT EXISTS email_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_hash TEXT UNIQUE NOT NULL,
      message_id TEXT,
      sender_hash TEXT NOT NULL,
      sender_original TEXT,
      subject_desensitized TEXT NOT NULL,
      date TEXT NOT NULL,
      attachment_count INTEGER NOT NULL DEFAULT 0,
      attachment_metadata TEXT,
      file_path TEXT NOT NULL,
      search_string TEXT NOT NULL,
      processed_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      extraction_status TEXT NOT NULL,
      error_log TEXT,
      report_date TEXT NOT NULL
    );
  `);
}

/**
 * Create indexes based on data-model.md
 */
function createIndexes(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_report_date_reports ON daily_reports(report_date);
    CREATE INDEX IF NOT EXISTS idx_generation_mode ON daily_reports(generation_mode);
    CREATE INDEX IF NOT EXISTS idx_report_date_items ON action_items(report_date);
    CREATE INDEX IF NOT EXISTS idx_source_status ON action_items(source_status);
    CREATE INDEX IF NOT EXISTS idx_confidence ON action_items(confidence);
    CREATE INDEX IF NOT EXISTS idx_report_date_email ON email_sources(report_date);
    CREATE INDEX IF NOT EXISTS idx_processed_at ON email_sources(processed_at);
  `);
}

/**
 * Insert sample reports into database
 */
function insertSampleReports(db: Database.Database, count: number): void {
  const insertReport = db.prepare(`
    INSERT INTO daily_reports (
      report_date, generation_mode, completed_count, pending_count,
      content_encrypted, content_checksum, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((reports: Array<{
    report_date: string;
    generation_mode: string;
    completed_count: number;
    pending_count: number;
    content_encrypted: string;
    content_checksum: string;
    created_at: number;
    updated_at: number;
  }>) => {
    for (const report of reports) {
      insertReport.run(
        report.report_date,
        report.generation_mode,
        report.completed_count,
        report.pending_count,
        report.content_encrypted,
        report.content_checksum,
        report.created_at,
        report.updated_at
      );
    }
  });

  const reports = [];
  const baseDate = new Date('2024-01-01');

  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);

    const report_date = date.toISOString().split('T')[0];
    const generation_mode = i % 2 === 0 ? 'local' : 'remote';
    const completed_count = Math.floor(Math.random() * 10) + 1;
    const pending_count = Math.floor(Math.random() * 10) + 1;
    const created_at = date.getTime();
    const updated_at = date.getTime();

    // Simulate encrypted content
    const content_encrypted = `encrypted_content_${i}`;
    const content_checksum = Buffer.from(
      `checksum_${i}`
    ).toString('hex').padEnd(64, '0');

    reports.push({
      report_date,
      generation_mode,
      completed_count,
      pending_count,
      content_encrypted,
      content_checksum,
      created_at,
      updated_at,
    });
  }

  insertMany(reports);
}
