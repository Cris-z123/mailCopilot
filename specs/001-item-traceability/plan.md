# Implementation Plan: Item Traceability & Indexing Module

**Branch**: `001-item-traceability` | **Date**: 2026-01-28 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-item-traceability/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

This feature implements email item traceability by extracting and binding Message-ID identifiers from source emails to all extracted items, enabling users to verify AI-generated tasks and action items against their original context. The system will display source metadata (sender, date, subject) alongside each item, provide one-click deep links to open emails in desktop clients (Thunderbird, Apple Mail), validate index completeness for missing Message-IDs, and handle edge cases (duplicates, moved files, internationalization). Technical approach involves RFC 5322-compliant Message-ID extraction during email parsing, passing identifiers through all processing stages, generating client-specific URL schemes, and implementing fallback mechanisms for unsupported scenarios.

## Technical Context

**Language/Version**: Python 3.11+
**Primary Dependencies**:
- Email parsing: `email` (stdlib), `email-validator`
- Configuration: `pydantic` for schema validation, `jsonschema`
- Storage: `keyring` for credential storage, local file system (JSON, SQLite)
- Testing: `pytest`, `pytest-cov`
- Cross-platform: `platform`, `pathlib`, `subprocess`

**Storage**:
- Configuration: `~/.maildigest/llm_config.json`, `~/.maildigest/app_config.json`
- Email storage: User-configurable local paths (mbox, Maildir formats)
- Index data: SQLite database for item-to-email mapping
- Logs: `~/.maildigest/logs/audit.log`

**Testing**: pytest (OPTIONAL - tests only if explicitly required)
**Target Platform**: Desktop (Windows 10+, macOS 11+, Linux)
**Project Type**: Single Python application with modular architecture
**Performance Goals**:
- Message-ID extraction: <50ms per email (i5 CPU)
- Report generation: <5 seconds for 100 emails
- Deep link generation: <100ms per item

**Constraints**:
- Email processing must work offline (local-only mode)
- No external API calls for traceability features
- UTF-8 support for internationalized email content
- Cross-platform email client detection

**Scale/Scope**:
- Single-user desktop application
- Process up to 10,000 emails per batch
- Support up to 50,000 items in local database
- Target: 100-1000 active users (V1.0)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Configuration-Driven Development ✅ PASS

**Requirement Check**:
- ✅ Email client detection and deep link formats MUST be configurable via `app_config.json`
- ✅ Message-ID extraction rules MUST be customizable (e.g., custom header parsing)
- ✅ Display formats for source metadata MUST be user-configurable
- ✅ Index validation thresholds (e.g., what constitutes "anomaly") configurable

**Implementation Notes**:
- Add `email_client` section to `app_config.json` with `default_client`, `deep_link_formats`
- Add `traceability` section with `message_id_validation_rules`, `display_templates`

---

### II. User Sovereignty (NON-NEGOTIABLE) ✅ PASS

**Requirement Check**:
- ✅ Users can explicitly opt-in to deep link functionality (can be disabled)
- ✅ Email file paths and Message-IDs are visible to users (full transparency)
- ✅ No external API calls required for traceability (offline-capable)
- ✅ Audit logs capture all index anomalies with sufficient detail
- ✅ Users can export traceability data (item-to-email mappings)

**Implementation Notes**:
- Provide "Export Traceability Data" feature (JSON export)
- Make audit logs human-readable and easily accessible
- Allow users to disable deep linking (fallback to file path display only)

---

### III. Security by Design ✅ PASS

**Requirement Check**:
- ✅ No sensitive data transmitted externally for traceability features
- ✅ Email file paths stored locally, never transmitted
- ✅ Message-IDs are identifiers, not sensitive content (safe to store)
- ✅ Audit logs track index anomalies without exposing email content
- ✅ Deep links use local URL schemes (no network requests)

**Implementation Notes**:
- Ensure deep link protocols only invoke local applications
- Validate that Message-IDs don't contain script injection (RFC 5322 compliance)
- Sanitize file paths before display to prevent path traversal attacks

---

### IV. Sustainable Architecture ✅ PASS

**Requirement Check**:
- ✅ Email parsing module abstracted behind interface (support mbox, Maildir, future formats)
- ✅ Deep link generation abstracted (pluggable client adapters)
- ✅ Index validation rules are hot-reloadable (no code changes required)
- ✅ Clear module boundaries: Email Parser → Index Extractor → Link Generator → Report Renderer

**Implementation Notes**:
- Define `EmailParser` interface with implementations for different formats
- Define `EmailClientAdapter` interface for Thunderbird, Apple Mail, future clients
- Index validation rules loaded from `~/.maildigest/rules/traceability_rules.json`

---

### V. Experience Consistency ✅ PASS

**Requirement Check**:
- ✅ Source metadata display format consistent across all report types
- ✅ Error messages for missing emails follow uniform pattern
- ✅ Deep link buttons/links have consistent UX across platforms
- ✅ Visual marking for index anomalies uses consistent styling

**Implementation Notes**:
- Use template system for report generation (consistent formatting)
- Standardize error message format: `[索引异常] <error_type>: <details>`
- Unified button styling: "[查看原文]" (View Original) with consistent icon

---

**CONSTITUTION CHECK RESULT**: ✅ **ALL GATES PASSED**

No violations detected. Feature fully aligns with all 5 core principles.

## Project Structure

### Documentation (this feature)

```text
specs/001-item-traceability/
├── spec.md              # Feature specification
├── plan.md              # This file (implementation plan)
├── research.md          # Phase 0: Technical research
├── data-model.md        # Phase 1: Data entities and relationships
├── quickstart.md        # Phase 1: Developer quickstart guide
├── contracts/           # Phase 1: API/interface contracts
│   ├── email_parser_interface.md
│   ├── email_client_adapter_interface.md
│   └── index_validator_interface.md
└── tasks.md             # Phase 2: Implementation tasks (NOT created yet)
```

### Source Code (repository root)

```text
# Single project structure (Python desktop application)
src/
├── models/              # Data models
│   ├── email_message.py
│   ├── extracted_item.py
│   └── index_anomaly.py
├── services/            # Business logic
│   ├── email_parser/    # Email parsing module
│   │   ├── __init__.py
│   │   ├── base.py      # EmailParser interface
│   │   ├── mbox_parser.py
│   │   ├── maildir_parser.py
│   │   └── message_id_extractor.py
│   ├── indexing/        # Index extraction module
│   │   ├── __init__.py
│   │   ├── index_extractor.py
│   │   └── index_validator.py
│   ├── linking/         # Deep link generation
│   │   ├── __init__.py
│   │   ├── base.py      # EmailClientAdapter interface
│   │   ├── thunderbird_adapter.py
│   │   ├── applemail_adapter.py
│   │   └── client_detector.py
│   └── reporting/       # Report generation
│       ├── __init__.py
│       ├── metadata_formatter.py
│       └── report_generator.py
├── config/              # Configuration management
│   ├── __init__.py
│   ├── config_loader.py
│   └── traceability_config.py
├── storage/             # Data persistence
│   ├── __init__.py
│   ├── database.py      # SQLite for item-index mapping
│   └── audit_log.py
└── utils/               # Utilities
    ├── __init__.py
    ├── path_utils.py
    └── unicode_utils.py

tests/                   # OPTIONAL - only if tests required
├── contract/            # Interface compliance tests
├── integration/         # End-to-end workflow tests
└── unit/                # Unit tests for individual modules

config/                  # Configuration templates
├── app_config.json.template
└── rules/
    └── traceability_rules.json.template

cli/                     # Command-line interface
├── __init__.py
└── main.py

docs/                    # User documentation
├── architecture.md      # Updated architecture diagram
└── user_guide.md        # Traceability feature guide
```

**Structure Decision**: Single project structure chosen because:
1. Desktop application with monolithic architecture
2. No separation between frontend/backend (CLI-only interface)
3. All modules run in single process
4. Clear separation via package structure (`models/`, `services/`, `config/`)
5. Aligned with technical architecture document's modular design principles

## Complexity Tracking

> **No complexity violations - all design choices align with constitution principles**

This feature extends the existing architecture with new modules without adding unnecessary complexity:

| Design Decision | Constitution Alignment |
|----------------|------------------------|
| **Email Parser Interface** | Supports "Sustainable Architecture" - pluggable parsers for mbox, Maildir, future formats |
| **Email Client Adapter** | Supports "Sustainable Architecture" - easy to add new email clients (Outlook, etc.) |
| **Configuration-driven rules** | Supports "Configuration-Driven Development" - users customize index validation |
| **Offline-first design** | Supports "User Sovereignty" - no external dependencies for traceability |
| **Local SQLite storage** | Supports "Security by Design" - no data leaves user's device |

**No simpler alternatives rejected** - all complexity is justified by core principles and feature requirements.

## Phase 0: Research & Technology Decisions

### Research Tasks

1. **Email Format Standards**
   - Task: Research RFC 5322 Message-ID format and edge cases
   - Decision: Use Python `email` stdlib (full RFC 5322 compliance)
   - Rationale: Built-in, well-tested, no external dependencies

2. **Cross-Platform Email Client Detection**
   - Task: Research how to detect default email client on Windows/macOS/Linux
   - Decision:
     - Windows: Registry query (`HKEY_CURRENT_USER\Software\Clients\Mail`)
     - macOS: `defaults read com.apple.LaunchServices`
     - Linux: `xdg-email` default or `~/.local/share/applications/`
   - Rationale: OS-native mechanisms, reliable, no external dependencies

3. **Email Client Deep Link Protocols**
   - Task: Research URL schemes for Thunderbird, Apple Mail
   - Decision:
     - Thunderbird: `thunderbird://message?id=<message-id>`
     - Apple Mail: `message://<message-id>` (RFC 2392 compliant)
   - Rationale: Documented protocols, widely supported

4. **Email Storage Formats**
   - Task: Research mbox vs Maildir parsing libraries
   - Decision: Use `mailbox` stdlib for both formats
   - Rationale: Built-in Python support, handles both formats

5. **Internationalization Support**
   - Task: Research UTF-8 handling in email headers and subjects
   - Decision: Use `email.header.decode_header()` for RFC 2047 encoded words
   - Rationale: Standard library handles all encodings (UTF-8, ISO-8859-*, etc.)

### Technology Stack Decisions

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Language** | Python 3.11+ | Rich email libraries, cross-platform, rapid development |
| **Email Parsing** | `email` (stdlib), `mailbox` (stdlib) | Full RFC compliance, zero dependencies |
| **Configuration** | `pydantic` | Schema validation, automatic migration support |
| **Database** | `sqlite3` (stdlib) | Embedded, no server required, sufficient for single-user scale |
| **Credential Storage** | `keyring` | Cross-platform secure storage (Windows Credential Manager, macOS Keychain, Linux Secret Service) |
| **Testing** | `pytest` (optional) | Industry standard, only if tests explicitly required |

**Research Output**: See [research.md](research.md) for detailed findings.
