-- ===================================================================
-- mailCopilot Database Schema v2.6
-- Field-level AES-256-GCM encryption, device-bound keys
-- ===================================================================

-- Metadata table
CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY CHECK(key IN ('schema_version', 'install_time', 'device_fingerprint', 'onboarding_disclosure')),
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
) STRICT;

-- User configuration (encrypted)
CREATE TABLE IF NOT EXISTS user_config (
    config_key TEXT PRIMARY KEY,
    config_value BLOB NOT NULL,    -- AES-256-GCM encrypted
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
) STRICT;

-- Daily reports
CREATE TABLE IF NOT EXISTS daily_reports (
    report_date TEXT PRIMARY KEY CHECK(report_date LIKE '____-__-__'),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    generation_mode TEXT NOT NULL CHECK(generation_mode IN ('local', 'remote')),
    completed_count INTEGER NOT NULL DEFAULT 0 CHECK(completed_count >= 0),
    pending_count INTEGER NOT NULL DEFAULT 0 CHECK(pending_count >= 0),
    content_encrypted BLOB NOT NULL,  -- JSON: {completed_items[], pending_items[], summary}
    content_checksum TEXT NOT NULL,    -- SHA-256 tamper detection
    source_email_hashes TEXT NOT NULL DEFAULT '[]'  -- JSON array
) STRICT;

CREATE INDEX IF NOT EXISTS idx_reports_created ON daily_reports(created_at DESC);

-- Action items (todo items)
CREATE TABLE IF NOT EXISTS todo_items (
    item_id TEXT PRIMARY KEY,
    report_date TEXT NOT NULL REFERENCES daily_reports(report_date),
    content_encrypted BLOB NOT NULL,
    content_checksum TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK(item_type IN ('completed', 'pending')),
    tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags) OR json_array_length(tags) IS NOT NULL),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    is_manually_edited INTEGER NOT NULL DEFAULT 0 CHECK(is_manually_edited IN (0, 1)),
    source_status TEXT NOT NULL DEFAULT 'verified' CHECK(source_status IN ('verified', 'unverified')),
    confidence_score REAL CHECK(confidence_score >= 0 AND confidence_score <= 1),
    feedback_type BLOB  -- AES-256-GCM encrypted feedback_type value (per plan v2.7)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_items_report_date ON todo_items(report_date);
CREATE INDEX IF NOT EXISTS idx_items_type ON todo_items(item_type);
CREATE INDEX IF NOT EXISTS idx_items_source_status ON todo_items(source_status);

-- Item-Email references (many-to-many)
CREATE TABLE IF NOT EXISTS item_email_refs (
    ref_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES todo_items(item_id) ON DELETE CASCADE,
    email_hash TEXT NOT NULL REFERENCES processed_emails(email_hash),
    evidence_text TEXT NOT NULL,
    confidence INTEGER CHECK(confidence >= 0 AND confidence <= 100),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_refs_item ON item_email_refs(item_id);
CREATE INDEX IF NOT EXISTS idx_refs_email ON item_email_refs(email_hash);

-- Processed emails (metadata only)
CREATE TABLE IF NOT EXISTS processed_emails (
    email_hash TEXT PRIMARY KEY,
    processed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    last_seen_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    report_date TEXT REFERENCES daily_reports(report_date),
    attachments_meta TEXT NOT NULL DEFAULT '[]',
    extract_status TEXT NOT NULL CHECK(extract_status IN ('success', 'no_content', 'error')),
    error_log TEXT,
    search_string TEXT,
    file_path TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_emails_report ON processed_emails(report_date);

-- Application logs
CREATE TABLE IF NOT EXISTS app_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL CHECK(level IN ('DEBUG', 'INFO', 'WARN', 'ERROR')),
    module TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    context_id TEXT,
    stack_trace TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON app_logs(timestamp DESC);

-- Trigger: Auto-update report stats
CREATE TRIGGER IF NOT EXISTS trg_update_report_stats_insert
AFTER INSERT ON todo_items
BEGIN
    UPDATE daily_reports
    SET updated_at = strftime('%s', 'now'),
        completed_count = CASE WHEN NEW.item_type = 'completed'
            THEN completed_count + 1 ELSE completed_count END,
        pending_count = CASE WHEN NEW.item_type = 'pending'
            THEN pending_count + 1 ELSE pending_count END
    WHERE report_date = NEW.report_date;
END;

-- Trigger: Auto-update report stats on item type change
CREATE TRIGGER IF NOT EXISTS trg_update_report_stats_update
AFTER UPDATE OF item_type ON todo_items
BEGIN
    UPDATE daily_reports
    SET updated_at = strftime('%s', 'now'),
        completed_count = CASE
            WHEN NEW.item_type = 'completed' AND OLD.item_type != 'completed'
            THEN completed_count + 1
            WHEN NEW.item_type != 'completed' AND OLD.item_type = 'completed'
            THEN completed_count - 1
            ELSE completed_count
        END,
        pending_count = CASE
            WHEN NEW.item_type = 'pending' AND OLD.item_type != 'pending'
            THEN pending_count + 1
            WHEN NEW.item_type != 'pending' AND OLD.item_type = 'pending'
            THEN pending_count - 1
            ELSE pending_count
        END
    WHERE report_date = NEW.report_date;
END;

-- Insert initial metadata
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('schema_version', '2.6');
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('install_time', strftime('%s', 'now'));
INSERT OR IGNORE INTO app_metadata (key, value) VALUES ('device_fingerprint', 'unknown');
