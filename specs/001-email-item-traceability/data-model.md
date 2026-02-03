# Data Model: Email Item Traceability & Verification System

**Feature**: Email Item Traceability & Verification System
**Date**: 2026-02-03
**Status**: Phase 1 Complete

## Overview

This document defines the data entities, relationships, and validation schemas for the email traceability system. All entities are implemented in TypeScript with Zod runtime validation and stored in SQLite with better-sqlite3.

## Entity Definitions

### 1. EmailSource

Represents the original email from which action items were extracted. Per constitution Principle III, only metadata is retained (no email body content).

**Table Name**: `email_sources`

**Fields**:

| Field | Type | Constraints | Encrypted | Description |
|-------|------|-------------|-----------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTOINCREMENT | No | Unique identifier |
| `email_hash` | TEXT | UNIQUE, NOT NULL, SHA-256 hex | No | Duplicate detection key |
| `message_id` | TEXT | OPTIONAL | No | Message-ID header (if available) |
| `sender_hash` | TEXT | NOT NULL, SHA-256 hex | No | Hashed sender email address |
| `sender_original` | TEXT | OPTIONAL | No | Original sender (for search string) |
| `subject_desensitized` | TEXT | NOT NULL | No | First 30 chars, Re:/Fwd: removed |
| `date` | TEXT | NOT NULL, ISO 8601 | No | Email date (UTC) |
| `attachment_count` | INTEGER | NOT NULL, DEFAULT 0 | No | Number of attachments |
| `attachment_metadata` | TEXT | OPTIONAL | No | JSON array of attachment metadata |
| `file_path` | TEXT | NOT NULL | No | Absolute path to email file |
| `search_string` | TEXT | NOT NULL | No | Copyable search keywords |
| `processed_at` | INTEGER | NOT NULL, Unix timestamp | No | First processed date |
| `last_seen_at` | INTEGER | NOT NULL, Unix timestamp | No | Last re-processed date |
| `extraction_status` | TEXT | NOT NULL, ENUM | No | success/no_content/error |
| `error_log` | TEXT | OPTIONAL | No | Error message if failed |
| `report_date` | TEXT | NOT NULL, YYYY-MM-DD | No | Associated report date |

**Indexes**:
- `idx_email_hash` UNIQUE (email_hash)
- `idx_report_date` (report_date)
- `idx_processed_at` (processed_at)

**Validation Schema** (Zod):
```typescript
import { z } from 'zod';

export const EmailSourceSchema = z.object({
  id: z.number().int().positive().optional(),
  email_hash: z.string().length(64).regex(/^[a-f0-9]{64}$/i),
  message_id: z.string().max(255).optional(),
  sender_hash: z.string().length(64).regex(/^[a-f0-9]{64}$/i),
  sender_original: z.string().email().optional(),
  subject_desensitized: z.string().max(30),
  date: z.string().datetime(),
  attachment_count: z.number().int().min(0).default(0),
  attachment_metadata: z.string().optional(),
  file_path: z.string().min(1),
  search_string: z.string().min(1),
  processed_at: z.number().int().nonnegative(),
  last_seen_at: z.number().int().nonnegative(),
  extraction_status: z.enum(['success', 'no_content', 'error']),
  error_log: z.string().optional(),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
```

---

### 2. ActionItem

Represents a single task, commitment, or deadline extracted from email content. Per constitution Principle II, all items must include source traceability information.

**Table Name**: `action_items`

**Fields**:

| Field | Type | Constraints | Encrypted | Description |
|-------|------|-------------|-----------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTOINCREMENT | No | Unique identifier |
| `content_encrypted` | TEXT | NOT NULL | **Yes** | Item description |
| `item_type` | TEXT | NOT NULL, ENUM | No | completed/pending |
| `confidence` | REAL | NOT NULL, 0.0-1.0 | No | Confidence score |
| `source_status` | TEXT | NOT NULL, ENUM | No | verified/unverified |
| `evidence` | TEXT | NOT NULL | No | Extraction rationale |
| `report_date` | TEXT | NOT NULL, YYYY-MM-DD | No | Associated report date |
| `created_at` | INTEGER | NOT NULL, Unix timestamp | No | Creation timestamp |
| `updated_at` | INTEGER | NOT NULL, Unix timestamp | No | Last update timestamp |

**Indexes**:
- `idx_report_date` (report_date)
- `idx_source_status` (source_status)
- `idx_confidence` (confidence)

**Validation Schema** (Zod):
```typescript
export const ActionItemSchema = z.object({
  id: z.number().int().positive().optional(),
  content_encrypted: z.string().min(1),
  item_type: z.enum(['completed', 'pending']),
  confidence: z.number().min(0).max(1),
  source_status: z.enum(['verified', 'unverified']),
  evidence: z.string().min(1),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  created_at: z.number().int().nonnegative(),
  updated_at: z.number().int().nonnegative(),
});
```

---

### 3. ItemEmailRef

Many-to-many relationship between action items and email sources. Per spec.md FR-005, items must support association with multiple source emails.

**Table Name**: `item_email_refs`

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `item_id` | INTEGER | NOT NULL, FOREIGN KEY | Reference to action_items.id |
| `email_hash` | TEXT | NOT NULL, FOREIGN KEY | Reference to email_sources.email_hash |
| `email_index_in_batch` | INTEGER | NOT NULL | Position in original batch (0-based) |

**Primary Key**: `(item_id, email_hash)`

**Foreign Keys**:
- `fk_item` → `action_items(id)` ON DELETE CASCADE
- `fk_email` → `email_sources(email_hash)` ON DELETE CASCADE

**Validation Schema** (Zod):
```typescript
export const ItemEmailRefSchema = z.object({
  item_id: z.number().int().positive(),
  email_hash: z.string().length(64).regex(/^[a-f0-9]{64}$/i),
  email_index_in_batch: z.number().int().nonnegative(),
});
```

---

### 4. UserFeedback

Represents user's assessment of action item accuracy. Per constitution Principle III, all feedback data is encrypted at rest.

**Table Name**: `user_feedback`

**Fields**:

| Field | Type | Constraints | Encrypted | Description |
|-------|------|-------------|-----------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTOINCREMENT | No | Unique identifier |
| `item_id` | INTEGER | NOT NULL, FOREIGN KEY | No | Reference to action_items.id |
| `feedback_type` | TEXT | NOT NULL, ENUM | **Yes** | correct/incorrect |
| `error_reason` | TEXT | OPTIONAL, ENUM | **Yes** | content_error/priority_error/not_actionable/source_error |
| `timestamp` | INTEGER | NOT NULL, Unix timestamp | No | Feedback timestamp |

**Indexes**:
- `idx_item_id` (item_id)
- `idx_timestamp` (timestamp)

**Foreign Keys**:
- `fk_item` → `action_items(id)` ON DELETE CASCADE

**Validation Schema** (Zod):
```typescript
export const UserFeedbackSchema = z.object({
  id: z.number().int().positive().optional(),
  item_id: z.number().int().positive(),
  feedback_type: z.enum(['correct', 'incorrect']),
  error_reason: z.enum(['content_error', 'priority_error', 'not_actionable', 'source_error']).optional(),
  timestamp: z.number().int().nonnegative(),
});
```

---

### 5. DailyReport

Represents a generated report for a specific date containing extracted action items. Per constitution Principle III, report content is fully encrypted.

**Table Name**: `daily_reports`

**Fields**:

| Field | Type | Constraints | Encrypted | Description |
|-------|------|-------------|-----------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTOINCREMENT | No | Unique identifier |
| `report_date` | TEXT | UNIQUE, NOT NULL, YYYY-MM-DD | No | Report date |
| `generation_mode` | TEXT | NOT NULL, ENUM | No | local/remote |
| `completed_count` | INTEGER | NOT NULL | No | Number of completed items |
| `pending_count` | INTEGER | NOT NULL | No | Number of pending items |
| `content_encrypted` | TEXT | NOT NULL | **Yes** | JSON report content |
| `content_checksum` | TEXT | NOT NULL, SHA-256 hex | No | Tamper detection |
| `created_at` | INTEGER | NOT NULL, Unix timestamp | No | Creation timestamp |
| `updated_at` | INTEGER | NOT NULL, Unix timestamp | No | Last update timestamp |

**Indexes**:
- `idx_report_date` UNIQUE (report_date)
- `idx_generation_mode` (generation_mode)

**Validation Schema** (Zod):
```typescript
export const DailyReportSchema = z.object({
  id: z.number().int().positive().optional(),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  generation_mode: z.enum(['local', 'remote']),
  completed_count: z.number().int().nonnegative(),
  pending_count: z.number().int().nonnegative(),
  content_encrypted: z.string().min(1),
  content_checksum: z.string().length(64).regex(/^[a-f0-9]{64}$/i),
  created_at: z.number().int().nonnegative(),
  updated_at: z.number().int().nonnegative(),
});
```

**Encrypted Content Structure** (JSON):
```typescript
interface ReportContent {
  summary: {
    high_confidence: number;    // ≥ 0.8
    needs_review: number;       // 0.6 - 0.79
    unverified: number;         // < 0.6
  };
  completed_items: Array<{
    content: string;
    evidence: string;
    confidence: number;
    source_info: {
      sender: string;
      date: string;
      subject: string;
      message_id?: string;
      fingerprint: string;
      file_path: string;
      search_string: string;
    };
  }>;
  pending_items: Array<{ /* same structure */ }>;
}
```

---

### 6. DataRetentionConfig

Represents user's data retention preferences. Per constitution Principle III, retention periods are configurable.

**Table Name**: `data_retention_config`

**Fields**:

| Field | Type | Constraints | Encrypted | Description |
|-------|------|-------------|-----------|-------------|
| `id` | INTEGER | PRIMARY KEY, AUTOINCREMENT | No | Unique identifier |
| `email_metadata_retention_days` | INTEGER | NOT NULL, -1 or 30/90/180/365 | No | -1 = permanent |
| `feedback_retention_days` | INTEGER | NOT NULL, -1 or 30/90/180/365 | No | -1 = permanent |
| `last_cleanup_at` | INTEGER | NOT NULL, Unix timestamp | No | Last cleanup timestamp |
| `estimated_storage_bytes` | INTEGER | NOT NULL | No | Estimated storage usage |

**Singleton Table**: Only one row (id=1) should exist.

**Validation Schema** (Zod):
```typescript
export const DataRetentionConfigSchema = z.object({
  id: z.number().int().positive().optional(),
  email_metadata_retention_days: z.number().int().refine(
    n => n === -1 || [30, 90, 180, 365].includes(n)
  ),
  feedback_retention_days: z.number().int().refine(
    n => n === -1 || [30, 90, 180, 365].includes(n)
  ),
  last_cleanup_at: z.number().int().nonnegative(),
  estimated_storage_bytes: z.number().int().nonnegative(),
});
```

---

## Entity Relationships

### Relationship Diagram

```
┌─────────────────┐
│ action_items    │
└────────┬────────┘
         │
         │ 1:N
         ↓
┌─────────────────────┐     N:M     ┌─────────────────┐
│ user_feedback       │◄────────────►│ email_sources   │
└─────────────────────┘               └─────────────────┘
         ↑                                    ↑
         │ 1:N                                │
         │                                    │ N:M
┌─────────────────────┐               ┌──────────────┐
│ daily_reports       │◄──────────────►│item_email_refs│
└─────────────────────┘               └──────────────┘
                                              │
                                              │ N:1
                                              ↓
                                     ┌─────────────────┐
                                     │ action_items    │
                                     └─────────────────┘

┌──────────────────────┐
│ data_retention_config│ (Singleton)
└──────────────────────┘
```

### Relationship Rules

1. **ActionItem ↔ EmailSource** (Many-to-Many)
   - One item can reference multiple source emails
   - One email can generate multiple items
   - Join table: `item_email_refs`
   - Cascade delete: If item or email deleted, refs deleted

2. **ActionItem ↔ UserFeedback** (One-to-Many)
   - One item can have multiple feedback entries
   - Cascade delete: If item deleted, feedback deleted

3. **ActionItem ↔ DailyReport** (Many-to-One)
   - Items belong to a single report (by report_date)
   - Report contains all items for that date

4. **EmailSource ↔ DailyReport** (One-to-Many)
   - Email processed once, associated with one report
   - Re-processing updates `last_seen_at` but doesn't create new report

---

## State Transitions

### ActionItem Lifecycle

```
┌──────────┐
 Extracted │
   (LLM)   │
└────┬─────┘
     │
     ↓
┌──────────┐    Zod validation    ┌──────────┐
 Verified  │ ───────────────────►│ Degraded │
(confidence│    Schema failure    │ (0.6 cap)│
  ≥ 0.6)   │                      └──────────┘
└────┬─────┘
     │
     │ User feedback
     ↓
┌──────────┐
  Marked   │
 Correct/  │
 Incorrect │
└──────────┘
```

### EmailSource Status Transitions

```
┌──────────┐
 Imported  │
   (new)   │
└────┬─────┘
     │
     ├─→ Success (items extracted)
     │
     ├─→ No Content (empty body)
     │
     └─→ Error (parsing failed)

Success ──[Re-processed]──► Update last_seen_at
```

---

## Data Retention Policies

### Automatic Cleanup Rules

**Email Metadata** (per FR-041):
- Default retention: 90 days
- Configurable: 30/90/180/365/永久 (-1)
- Cleanup: Delete `email_sources` records where `processed_at < (now - retention_days)`
- Exception: If `retention_days = -1`, never delete

**User Feedback** (per FR-026):
- Default retention: 90 days
- Configurable: 30/90/180/365/永久 (-1)
- Cleanup: Delete `user_feedback` records where `timestamp < (now - retention_days)`
- Exception: If `retention_days = -1`, never delete

**Daily Reports**:
- **NEVER** deleted automatically (user data preservation)
- User can manually delete individual reports
- Exported reports are unencrypted files (user-managed)

### Cleanup Timing

- **Scheduled**: Daily cron job at 2:00 AM local time
- **Triggered**: Immediately after retention period change
- **Manual**: User-triggered via "清理30天前数据" button

---

## Encryption Details

### Field-Level Encryption

**Algorithm**: AES-256-GCM (Galois/Counter Mode)

**Key Management**:
- Key generated on first launch: 256 random bits
- Storage: Electron safeStorage (system keyring)
- Binding: Device + user account (no export)
- Loss: System reinstall = permanent data loss (intentional)

**Encrypted Fields**:
- `action_items.content_encrypted`
- `user_feedback.feedback_type`
- `user_feedback.error_reason`
- `daily_reports.content_encrypted`

**Non-Encrypted Fields**:
- All metadata (dates, counts, hashes, enums)
- Search strings (user-facing, non-sensitive)
- File paths (local filesystem)

### Encryption Implementation

```typescript
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

class CryptoManager {
  private key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error('Key must be 32 bytes');
    this.key = key;
  }

  encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  decrypt(encrypted: string, iv: string, authTag: string): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

---

## Validation Rules

### Zod Schema Validation

**Runtime Validation**: All database writes validated via Zod schemas before insertion
**Parse Safety**: Use `safeParse()` to handle validation errors gracefully
**Error Reporting**: Detailed error messages for each validation failure

**Example**:
```typescript
import { EmailSourceSchema } from './schemas';

const result = EmailSourceSchema.safeParse(inputData);

if (!result.success) {
  logger.error('ValidationFailed', 'EmailSource validation failed', {
    errors: result.error.errors,
  });
  // Handle error: degrade, retry, or skip
}
```

### Business Logic Validation

**Duplicate Detection** (per R0-4):
- SHA-256 hash must be unique within batch
- Cross-batch duplicates update `last_seen_at`

**Confidence Scoring** (per R0-8):
- Normal: (rule × 0.5) + (llm × 0.5)
- Degraded: (rule × 0.6) + (llm × 0.2), max 0.6

**Source Traceability** (per Principle II):
- All items must have at least one source email reference
- Missing Message-ID triggers `[来源待确认]` tag
- Confidence < 0.6 triggers visual warning

---

## Performance Considerations

### Database Optimization

**WAL Mode**: Enabled for concurrent read/write
```typescript
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
```

**Indexes**:
- All foreign keys indexed
- All date fields indexed
- Hash fields indexed for O(1) lookups

**Transaction Wrapping**:
- All batch writes wrapped in transactions
- Prevents partial writes on errors

### Memory Management

**Sensitive Data Cleanup**:
```typescript
// Clear plaintext immediately after use
plaintext.fill(0);
```

**Email Body Cleanup**:
- Parsed email body cleared after item extraction
- Only metadata retained in database

---

## Migration Strategy

**Schema Versioning**: Each schema change increments version number
**Migration Files**: `migrations/v1_create_tables.sql`, `migrations/v2_add_index.sql`, etc.
**Automatic Migration**: Run migrations on application startup
**Rollback Support**: Down migration files for safe rollback

**Example Migration**:
```sql
-- migrations/v1_create_tables.sql
CREATE TABLE IF NOT EXISTS email_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash TEXT UNIQUE NOT NULL,
  -- ... other fields
);
```

---

## Summary

**Total Tables**: 6
**Encrypted Fields**: 4 fields across 3 tables
**Relationships**: 1 one-to-many, 1 many-to-many (with join table)
**Indexes**: 12 indexes for query optimization
**Validation**: All entities protected by Zod schemas
**Retention**: Configurable 30/90/180/365/-1 days for metadata and feedback

**Data Model Status**: ✅ Complete - Ready for implementation

---

**Next Steps**: Generate API contracts in `/contracts/` directory
