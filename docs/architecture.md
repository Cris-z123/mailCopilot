# Architecture: Item Traceability & Indexing Module

**Version**: 1.0
**Date**: 2026-01-28

## Overview

This document describes the architecture of the Item Traceability & Indexing Module, which enables email item traceability by extracting and binding Message-ID identifiers from source emails to all extracted items.

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                            │
│                     (cli/main.py)                            │
│  - Command parsing                                          │
│  - Orchestration                                            │
│  - Report rendering                                         │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                    Service Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Email Parser │  │   Index      │  │    Linking   │     │
│  │              │  │   Validator  │  │              │     │
│  │ - mbox       │  │              │  │ - Thunderbird│     │
│  │ - Maildir    │  │ - Validate   │  │ - Apple Mail │     │
│  │              │  │ - Detect     │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────────────────────────────────────────┐     │
│  │              Reporting                            │     │
│  │  - Metadata formatting                            │     │
│  │  - Report generation                              │     │
│  └──────────────────────────────────────────────────┘     │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                   Storage Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Database   │  │  Audit Log   │  │  Config      │     │
│  │              │  │              │  │              │     │
│  │ - SQLite     │  │ - JSON logs  │  │ - Pydantic   │     │
│  │ - Repos      │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. Email Parser Module

**Purpose**: Parse email files and extract Message-ID and metadata

**Components**:
- `EmailParser` (Abstract Interface)
  - `parse()`: Parse emails from file/directory
  - `detect_format()`: Detect mbox vs Maildir
  - `get_message_id()`: Extract Message-ID
  - `extract_metadata()`: Extract all metadata

- `MboxParser` (Implementation)
  - Parse mbox format files
  - Handle mbox-specific storage offsets

- `MaildirParser` (Implementation)
  - Parse Maildir directories
  - Handle Maildir-specific keys

- `MessageIdExtractor` (Utility)
  - Extract Message-ID from files
  - Normalize Message-ID format
  - Extract email metadata

**Design Pattern**: Strategy Pattern
- Pluggable parsers for different formats
- Consistent interface for all implementations

### 2. Index Validator Module

**Purpose**: Validate Message-ID format and detect anomalies

**Components**:
- `IndexValidator`
  - `validate_message_id()`: Check Message-ID format
  - `validate_email_file()`: Check file accessibility
  - `create_anomaly_record()`: Create anomaly in database
  - `get_anomalies_summary()`: Generate anomaly statistics

- `ValidationResult` (Data Class)
  - `is_valid`: Validation status
  - `anomaly_type`: Type of anomaly
  - `error_details`: Human-readable description
  - `can_recover`: Whether fallback is possible

**Anomaly Types**:
- `missing_message_id`: Message-ID header absent
- `malformed_message_id`: Invalid Message-ID format
- `file_not_found`: Email file moved/deleted
- `duplicate_detection_failure`: Duplicate detection failed

### 3. Linking Module

**Purpose**: Generate deep links to email clients

**Components**:
- `EmailClientAdapter` (Abstract Interface)
  - `generate_deep_link()`: Create client-specific URL
  - `open_deep_link()`: Execute deep link
  - `is_client_installed()`: Detect client presence
  - `client_name`: Human-readable name
  - `client_id`: Machine identifier

- `ThunderbirdAdapter` (Implementation)
  - Generate `thunderbird://` URLs
  - OS-specific installation detection
  - Cross-platform link execution

- `AppleMailAdapter` (Implementation)
  - Generate `message://` URLs (RFC 2392)
  - macOS-only implementation
  - Mail app detection

- `ClientDetector` (Factory)
  - Detect default email client
  - Return appropriate adapter
  - OS-specific detection logic

**Design Pattern**: Adapter Pattern
- Abstract email client differences
- Pluggable client integrations

### 4. Reporting Module

**Purpose**: Format and display traceability information

**Components**:
- `MetadataFormatter`
  - `format_source_metadata()`: Format sender/date/subject
  - `get_anomaly_marker()`: Return anomaly marker string
  - Configuration-driven templates

**Display Templates**:
- Source metadata: `📧 来源：{sender} | {date} | {subject}`
- Anomaly marker: `[索引异常]`

### 5. Storage Layer

**Purpose**: Persist emails, items, and anomalies

**Components**:
- `DatabaseConnection`
  - SQLite connection management
  - Schema execution and migrations

- `EmailMessageRepository`
  - CRUD operations for emails
  - Query by Message-ID or file path

- `ExtractedItemRepository`
  - CRUD operations for items
  - Query by source email

- `IndexAnomalyRepository`
  - CRUD operations for anomalies
  - Query unresolved anomalies

- `AuditLog`
  - JSON-based event logging
  - Export functionality

**Database Schema**:

```sql
-- Email messages
CREATE TABLE email_messages (
    message_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    sent_date TEXT NOT NULL,
    subject TEXT NOT NULL,
    format TEXT NOT NULL,
    storage_offset INTEGER,
    maildir_key TEXT,
    PRIMARY KEY (message_id, file_path)
);

-- Extracted items
CREATE TABLE extracted_items (
    item_id TEXT NOT NULL PRIMARY KEY,
    content TEXT NOT NULL,
    source_message_id TEXT NOT NULL,
    source_file_path TEXT NOT NULL,
    item_type TEXT NOT NULL,
    priority TEXT NOT NULL,
    confidence_score REAL NOT NULL,
    index_status TEXT NOT NULL,
    FOREIGN KEY (source_message_id, source_file_path)
        REFERENCES email_messages(message_id, file_path)
);

-- Index anomalies
CREATE TABLE index_anomalies (
    anomaly_id TEXT NOT NULL PRIMARY KEY,
    anomaly_type TEXT NOT NULL,
    email_file_path TEXT NOT NULL,
    message_id_value TEXT,
    error_details TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN NOT NULL DEFAULT 0
);
```

## Data Flow

### Email Processing Pipeline

```
┌─────────────────┐
│  Email Input    │
│  (mbox/Maildir) │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│  Email Parser Service       │
│  - Parse email headers      │
│  - Extract Message-ID       │
│  - Extract metadata         │
└────────┬────────────────────┘
         │
         ├─→ Valid Message-ID?
         │         │
         │         ├─ Yes ──→ Create Email Record
         │         │                   │
         │         │                   ▼
         │         │         ┌──────────────────┐
         │         │         │ Index Validator  │
         │         │         │ - Validate format │
         │         │         └────────┬─────────┘
         │         │                  │
         │         │                  ▼
         │         │         ┌──────────────────┐
         │         │         │ Extracted Items  │
         │         │         │ (with source_id) │
         │         │         └────────┬─────────┘
         │         │                  │
         │         │                  ▼
         │         │         ┌──────────────────┐
         │         │         │ Database         │
         │         │         │ (Persistence)    │
         │         │         └──────────────────┘
         │         │
         │         └─ No ──→ Create Index Anomaly
         │                           │
         │                           ▼
         │                   ┌──────────────────┐
         │                   │ Mark with        │
         │                   │ [索引异常]       │
         │                   └──────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Report Generator           │
│  - Format source metadata   │
│  - Generate deep links      │
│  - Summarize anomalies      │
└─────────────────────────────┘
```

## Configuration Architecture

### Configuration Files

1. **app_config.json** - Main application configuration
   - Email client settings
   - Traceability rules
   - Storage paths

2. **traceability_rules.json** - Validation rules
   - Message-ID validation
   - Anomaly handling
   - Duplicate detection

### Configuration Loading

```
ConfigLoader → Pydantic Models → Application
    ↓
- Validate schema
- Provide defaults
- Hot-reload support
```

## Error Handling Strategy

### Principles

1. **Validation failures are non-fatal**
   - Create anomaly records
   - Continue processing
   - Show warnings in reports

2. **Graceful degradation**
   - Deep link fails → Show file path
   - Client not installed → Display clear error
   - Missing metadata → Use placeholder values

3. **Transparency**
   - All anomalies logged
   - User-visible error messages
   - Audit trail for debugging

## Security Considerations

1. **Path sanitization**
   - Prevent path traversal attacks
   - Validate file paths before access

2. **Message-ID validation**
   - RFC 5322 compliance
   - Prevent script injection

3. **Local-only operation**
   - No external API calls
   - No network requests
   - User data stays on device

## Performance Considerations

### Optimization Strategies

1. **Lazy loading**
   - Load email parsers on demand
   - Cache client detection results

2. **Batch processing**
   - Process multiple emails in sequence
   - Database connection pooling

3. **Index usage**
   - Indexed queries for Message-ID lookups
   - Composite indexes for joins

### Performance Targets

- Message-ID extraction: <50ms per email
- Report generation: <5 seconds for 100 emails
- Deep link generation: <100ms per item

## Extension Points

### Adding New Email Formats

1. Implement `EmailParser` interface
2. Add format detection logic
3. Register with factory pattern

### Adding New Email Clients

1. Implement `EmailClientAdapter` interface
2. Add client detection logic
3. Register with `ClientDetector`

### Adding New Anomaly Types

1. Extend `AnomalyType` enum
2. Add validation logic
3. Update error messages

## Testing Strategy

### Unit Tests (Optional)

- Parser implementations
- Validator logic
- Repository operations

### Integration Tests (Optional)

- End-to-end email processing
- Deep link execution
- Database operations

### Contract Tests (Optional)

- Interface compliance
- API contracts

## Future Enhancements

### V1.1 Potential Features

- Async email processing
- Streaming parser for large mailboxes
- Additional email client support (Outlook)
- Web-based client support (Gmail)

### V2.0 Potential Features

- Machine learning for anomaly detection
- Advanced duplicate detection
- User feedback integration
- Performance metrics dashboard
