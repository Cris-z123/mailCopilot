# Requirements Quality Checklist: Email Item Traceability & Verification System

**Purpose**: Validate specification completeness, clarity, and consistency before proceeding to implementation planning
**Created**: 2026-01-31
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md)
**Audience**: Pre-Implementation (Author) - validating requirements before creating plan/tasks
**Depth**: Standard (PR Review) - Full validation of all requirements
**Focus**: Comprehensive Coverage (all risk areas)

## Requirement Completeness

- [ ] CHK001 - Are requirements defined for all 6 email formats (.eml, .msg, .pst/.ost, .mbox, .html)? [Completeness, Spec §US4]
- [ ] CHK002 - Are Message-ID extraction success rates explicitly specified for each format? [Completeness, Spec §FR-008]
- [ ] CHK003 - Are degradation strategies defined for all LLM failure scenarios (timeout, schema validation failure, service unavailable)? [Completeness, Spec §Edge Cases]
- [ ] CHK004 - Are cross-batch duplicate detection requirements specified with clear behavior for each scenario? [Completeness, Spec §FR-008A]
- [ ] CHK005 - Are data retention requirements defined for both email metadata and feedback data with all configurable options? [Completeness, Spec §US6]
- [ ] CHK006 - Are confidence threshold requirements explicitly specified with visual indicators for each level (≥0.8, 0.6-0.79, <0.6)? [Completeness, Spec §US2]
- [ ] CHK007 - Are feedback data requirements defined for all four error types (content_error, priority_error, not_actionable, source_error)? [Completeness, Spec §US3]
- [ ] CHK008 - Are mode switching requirements specified for all scenarios (idle, processing, multiple requests, service failure)? [Completeness, Spec §US5]
- [ ] CHK009 - Are network isolation requirements specified for local mode (what's blocked, what's allowed, fallback behavior)? [Completeness, Spec §US5]
- [ ] CHK010 - Are update check requirements specified for both local and remote modes? [Completeness, Spec §US5]
- [ ] CHK011 - Are export format requirements defined for both Markdown and PDF outputs? [Completeness, Spec §FR-051]
- [ ] CHK012 - Are single-instance enforcement requirements specified for startup and second-instance launch? [Completeness, Spec §FR-059, FR-060]
- [ ] CHK013 - Are error handling requirements defined for all specified error scenarios (database key loss, LLM connection, schema validation, mode switch, single instance)? [Completeness, Spec §Edge Cases]

## Requirement Clarity

- [ ] CHK014 - Is "100% traceability" quantified with specific success metrics and measurement methods? [Clarity, Spec §SC-001, SC-002]
- [ ] CHK015 - Is "search string" format explicitly defined with examples and compatibility notes for major email clients? [Clarity, Spec §FR-003, R0-9]
- [ ] CHK016 - Are confidence score ranges explicitly quantified (0.0-1.0) with threshold boundaries clearly specified? [Clarity, Spec §FR-009, SC-005]
- [ ] CHK017 - Is "light yellow background" for low-confidence items specified with measurable color values (hex code or color name)? [Clarity, Spec §US2]
- [ ] CHK018 - Is "prominent display" for confidence warnings quantified with specific UI positioning/size requirements? [Clarity, Spec §US2]
- [ ] CHK019 - Is "source_status='unverified'" tag clearly distinguished from other status indicators with explicit rules for when each applies? [Clarity, Spec §FR-006]
- [ ] CHK020 - Is "日 (30天/90天/180天/365/永久)" retention period precisely defined with mapping of -1 to "永久"? [Clarity, Spec §US6]
- [ ] CHK021 - Is "no cloud backup" requirement explicitly stated with clear explanation of what's prohibited? [Clarity, Constitution Principle I]
- [ ] CHK022 - Is "no automatic fallback from local to remote mode" explicitly stated as a mandatory constraint? [Clarity, Spec §FR-037, Constitution Principle IV]
- [ ] Is "block functionality in local mode if LLM unavailable" clearly specified with exact error message? [Clarity, Spec §FR-036]
- [ ] CH K023 - Is "热切换" (hot mode switching) quantified with specific wait conditions ("wait for current batch completion")? [Clarity, Spec §FR-033]
- [ ] CHK024 - Is "network-layer blocking" in local mode clearly distinguished from application-level checks? [Clarity, Constitution Principle IV, R0-7]
- [ ] CHK025 - Is "field-level encryption" clearly distinguished from full database encryption with specific field names? [Clarity, Constitution Principle III]
- [ ] CHK026 - Is "device-bound keys" concept explained with clear implications for data loss scenarios? [Clarity, Spec §Assumptions 12]
- [ ] CHK027 - Is "60 seconds" for email location specified as a hard requirement or soft target? [Clarity, Spec §SC-003]
- [ ] CHK028 - Is "≥40% user-confirmed error rate" for low-confidence items quantified with measurement method? [Clarity, Spec §SC-005]
- [ ] CHK029 - Is "≥80% agreement" for trust survey quantified with specific scale details? [Clarity, Spec §SC-006]

## Requirement Consistency

- [ ] CHK030 - Do confidence calculation requirements align between local and remote modes (different scoring methods but unified output)? [Consistency, Spec §FR-009, R0-8]
- [ ] CHK031 - Do confidence threshold requirements (≥0.8, 0.6-0.79, <0.6) align across user stories and functional requirements? [Consistency, Spec §US2, FR-011]
- [ ] CHK032 - Do "source_status" values ('verified'/'unverified') align across item storage, display, and feedback requirements? [Consistency, Spec §Key Entities, US3]
- [ ] [ ] CHK033 - Do email format support requirements align between parsing, extraction rate targets, and confidence caps? [Consistency, Spec §US4, FR-007, FR-008, FR-013]
- [ ] CHK034 - Do data retention requirements align between email metadata, feedback data, and export formats? [Consistency, Spec §US6, FR-041, FR-042, FR-043]
- [ ] CHK035 - Do dual-mode operation requirements align between mode switching, update checks, and network isolation? [Consistency, Spec §US5, FR-030, FR-038, FR-039, FR-040]
- [ ] CHK036 - Do "no cloud backup" requirements align across configuration, data loss scenarios, and export behavior? [Consistency, Constitution Principle I, Spec §Assumptions 12]
- [ ] CHK037 - Do single-instance enforcement requirements align between startup behavior, second-instance handling, and user notification? [Consistency, Spec §FR-059, FR-060, FR-061]
- [ ] CHK038 - Do "degradation instead of loss" requirements align across LLM validation, confidence capping, and item storage? [Consistency, Constitution Principle II, Spec §FR-017, FR-018]
- [ ] CHK039 - Do "设备绑定" (device-bound) requirements align between key generation, storage, and data loss scenarios? [Consistency, Constitution Principle I, Spec §FR-046, FR-047]
- [ ] CHK040 - Do privacy notice requirements align between feedback dialog, settings page, and actual network behavior? [Consistency, Spec §US3, FR-021, FR-024]
- [ ] CHK041 - Do search string format requirements align between generation logic, copy button behavior, and user instructions? [Consistency, Spec §FR-003, US1]
- [ ] CHK042 - Do database schema requirements align between entity definitions, foreign keys, and indexes? [Consistency, Spec §Key Entities, Database Schema]
- [ ] CHK043 - Do confidence display requirements align between visual indicators (background, tags, expanded info) and summary banner? [Consistency, Spec §US2]

## Acceptance Criteria Quality

- [ ] CHK044 - Can "100% traceability" be objectively measured and verified? [Measurability, Spec §SC-001]
- [ ] CHK045 - Can "≥95% Message-ID extraction rate" be objectively tested with specific test data? [Measurability, Spec §SC-004]
- [ ] CHK046 - Can "90% of users locate email within 60 seconds" be measured through user testing or automated simulation? [Measurability, Spec §SC-003]
- [ ] [ ] CHK047 - Can "≥40% user-confirmed error rate" be tracked and measured from user feedback data? [Measurability, Spec §SC-005]
- [ ] CHK048 - Can "≥80% user trust agreement" be validated through post-use survey with specific question wording? [Measurability, Spec §SC-006]
- [ ] [ ] CHK049 - Can "≥50% low-confidence items viewed" be tracked through usage analytics? [Measurability, Spec §SC-007]
- [ ] [ ] CHK050 - Can "user satisfaction ≥4.0/5.0" be measured through specific survey questions? [Measurability, Spec §SC-008]
- [ ] [ ] CHK051 - Can "≥80% setup completion rate" be objectively measured? [Measurability, Spec §SC-010]
- [ ] [ ] CHK052 - Can "zero network transmissions for feedback" be verified through network monitoring or code review? [Measurability, Spec §SC-012]
- [ ] [ ] CHK053 - Can "AES-256-GCM encryption" be validated through security audit or code review? [Measurability, Spec §SC-013]
- [ ] [ ] CHK054 - Can "≤100ms email metadata extraction" be benchmarked on specified hardware (i5 processor)? [Measurability, Spec §SC-014]
- [ ] [ ] CHK055 - Can "≤2s local LLM processing" be measured under controlled service conditions? [Measurability, Spec §SC-015]
- [ ] [ ] CHK056 - Can "≤3s application startup with 1000 reports" be benchmarked on reference hardware? [Measurability, Spec §SC-016]
- [ ] [ ] CHK057 - Can "<100ms 1000-report query" be measured under typical data volume? [Measurability, Spec §SC-017]
- [ ] [ ] CHK058 - Can "100% edge cases handled gracefully" be validated through test coverage without application crashes? [Measurability, Spec §SC-022]
- [ ] [ ] CHK059 - Can "system recovers gracefully from LLM failures" be tested through failure simulation? [Measurability, Spec §SC-024]
- [ ] [ ] CHK060 - Can "100% constitutional compliance" be systematically verified against all 7 constitutional principles? [Measurability, Spec §SC-025]

## Scenario Coverage

### Primary Scenarios (Happy Paths)

- [ ] CHK061 - Are requirements defined for successful email extraction with complete traceability for all 6 email formats? [Coverage, Spec §US1, US4]
- [ ] CHK062 - Are requirements specified for displaying action items with complete source information (sender, date, subject, search string, file path)? [Coverage, Spec §US1]
- [ ] CHK063 - Are requirements defined for copying search strings to clipboard and pasting into email clients? [Coverage, Spec §US1]
- [ ] CHK064 - Are requirements specified for displaying confidence-based visual indicators (background, tags, summary banner)? [Coverage, Spec §US2]
- [ ] CHK065 - Are requirements defined for user feedback workflows (hover tooltips, click dialogs, privacy notices, storage, deletion)? [Coverage, Spec §US3]
- [ ] CHK066 - Are requirements specified for dual-mode operation (remote/local) with hot switching? [Coverage, Spec §US5]
- [ ] CHK067 - Are requirements defined for configuring data retention periods and viewing storage usage? [Coverage, Spec §US6]
- [ ] CHK068 - Are requirements specified for report generation in Markdown/PDF with security warnings? [Coverage, Spec §FR-049, FR-051, FR-052]
- [ ] CHK069 - Are requirements specified for application startup and single-instance enforcement? [Coverage, Spec §FR-059, FR-060, FR-061]

### Alternate Scenarios

- [ ] CHK070 - Are requirements defined for Outlook .msg files with missing Message-ID (degraded to fingerprint)? [Coverage, Spec §US1]
- [ ] CHK071 - Are requirements specified for HTML email files with low Message-ID extraction rate (~30%)? [Coverage, Spec §US4]
- [ ] CHK072 - Are requirements specified for processing emails with short content (<200 chars) that can't generate reliable fingerprints? [Coverage, Spec §Edge Cases]
- [ ] CHK073 - Are requirements specified for same-batch duplicate emails (skip entirely)? [Coverage, Spec §Edge Cases]
- [ ] CHK074 - Are requirements specified for cross-batch duplicate emails (update timestamp, skip item creation)? [Coverage, Spec §FR-008A, Edge Cases]

### Exception/Error Scenarios

- [ ] CHK075 - Are requirements specified for corrupted or unparseable emails (skip + log + continue)? [Coverage, Spec §Edge Cases]
- [ ] CHK076 - Are requirements specified for rule engine complete failure (no keywords, no sender recognition)? [Coverage, Spec §Edge Cases]
- [ ] CHK077 - Are requirements specified for LLM service timeout or errors during local mode operation? [Coverage, Spec §Edge Cases]
- [ ] CHK078 - Are requirements specified for LLM output JSON schema validation failures (retry 2x, then degrade)? [Coverage, Spec §Edge Cases]
- [ ] CHK079 - Are requirements specified for database encryption key loss (device change, system reinstall)? [Coverage, Spec §Edge Cases, FR-047]
- [ ] CHK080 - Are requirements specified for "永久" (permanent) retention mode when user wants to free disk space? [Coverage, Spec §Edge Cases]
- [ ] CHK081 - Are requirements specified for feedback data encryption key loss or corruption? [Coverage, Spec §Edge Cases]
- [ ] CHK082 - Are requirements specified for multiple rapid mode switch requests during batch processing (last one wins)? [Coverage, Spec §Edge Cases]
- [ ] CHK083 - Are requirements specified for local mode LLM service stopping mid-batch (batch fails, no auto-switch)? [Coverage, Spec §Edge Cases]

### Recovery/Resilience Scenarios

- [ ] CHK084 - Are requirements specified for system recovery after LLM service degradation (rule-engine-only extraction)? [Coverage, Resilience, Spec §FR-017]
- [ ] CHK085 - Are requirements specified for handling schema validation failures with partial data (degraded items, not discarded)? [Coverage, Resilience, Spec §FR-016, FR-018]
- [ ] [ ] CHK086 - Are requirements specified for graceful degradation when email format parsing fails partially (e.g., .html with 30% Message-ID rate)? [Coverage, Resilience, Spec §US4]
- [ ] CHK087 - Are requirements specified for retry logic when LLM returns transient errors? [Coverage, Resilience, Spec §FR-016, R0-5]
- [ ] [ ] CHK088 - Are requirements specified for cleanup task failures (retention period not enforced, data accumulates)? [Coverage, Resilience, Spec §FR-043]

### Non-Functional Requirements

#### Performance

- [ ] CHK089 - Are email metadata extraction performance requirements specified with measurable metrics (≤100ms per email)? [Non-Functional, Spec §SC-014]
- [ ] CHK090 - Are local LLM processing performance requirements specified with measurable metrics (≤2s per email)? [Non-Functional, Spec §SC-015]
- [ ] CHK091 - Are application startup performance requirements specified with measurable metrics (≤3s with 1000 reports)? [Non-Functional, Spec §SC-016]
- [ ] CHK092 - Are database query performance requirements specified with measurable metrics (1000 reports <100ms)? [Non-Functional, Spec §SC-017]
- [ ] CHK093 - Are batch processing limits specified with maximum emails per batch (50 emails)? [Non-Functional, Constraints]
- [ ] CHK094 - Are resource limits specified for rule engine (128MB memory, 5s timeout, 100 recursion depth)? [Non-Functional, Constraints]
- [ ] CHK095 - Are LLM processing timeout requirements specified (30s per email)? [Non-Functional, Constraints]

#### Security

- [ ] CHK096 - Are field-level encryption requirements specified for all sensitive fields (content_encrypted, config_value)? [Security, Constitution Principle III, Spec §FR-045]
- [ ] CHK097 - Are AES-256-GCM encryption requirements explicitly mandated for sensitive data? [Security, Constitution Principle III, R0-3]
- [ ] CHK098 - Are device-bound key requirements specified with clear implications for data recovery (intentional loss)? [Security, Constitution Principle III, Spec §FR-046]
- [ ] CHK099 - Are key management requirements specified (auto-generation, safeStorage, no user input, no export)? [Security, Constitution Principle III, R0-3]
- [ ] [ ] CHK100 - Are network isolation requirements specified for local mode (network-layer blocking, no auto-fallback)? [Security, Constitution Principle IV, Spec §FR-037, FR-040]
- [ ] [ ] CHK101 - Are IPC channel whitelist requirements specified (6 channels max)? [Security, Constitution Principle V, Spec §Tech Architecture §5.1]
- [ ] [ ] CHK102 - Are CSP policy requirements specified for local vs remote modes? [Security, Constitution Principle V, Spec §Tech Architecture §5.1]
- [ ] [ ] CHK103 - Are QuickJS sandbox security constraints specified (no os/std/eval/Function, 128MB memory, 5s timeout)? [Security, R0-2]
- [ ] [ ] CHK104 - Are structured logging requirements specified that prohibit sensitive data in logs? [Security, Constitution Principle VII, Spec §FR-053]
- [ ] [ ] CHK105 - Are memory management requirements specified for sensitive data cleanup (Buffer.fill(0))? [Security, Constitution Principle VII, R0-3]

#### Accessibility

- [ ] CHK106 - Are accessibility requirements specified for keyboard navigation for all interactive UI elements? [Accessibility, Gap]
- [ ] CHK107 - Are accessibility requirements specified for screen reader compatibility for confidence indicators and warning tags? [Accessibility, Gap]
- [ ] CHK108 - Are accessibility requirements specified for color contrast requirements for visual indicators? [Accessibility, WCAG 2.1 compliance check]
- [ ] [ ] CHK109 - Are accessibility requirements specified for focus indicators for feedback buttons? [Accessibility, Gap]

#### Reliability

- [ ] CHK110 - Are requirements specified for database transaction wrapping (WAL mode, synchronous=NORMAL) to ensure data integrity? [Reliability, Architecture v2.6]
- [ ] CHK111 - Are requirements specified for content checksum (SHA-256) for tamper detection? [Reliability, Spec §Key Entities]
- [ ] [ ] CHK112 - Are requirements specified for trigger-based auto-update of report statistics to maintain consistency? [Reliability, Architecture v2.6]
- [ ] [ ] CHK113 - Are requirements specified for database foreign key constraints (CASCADE delete for item_email_refs)? [Reliability, Database Schema]
- [ ] [ ] CHK114 - Are requirements specified for database indexes to optimize query performance? [Reliability, Database Schema]
- [ ] [ ] CHK115 - Are requirements specified for single-instance enforcement to prevent SQLite corruption? [Reliability, Spec §FR-059, FR-060]

#### Maintainability

- [ ] CHK116 - Are requirements specified for structured logging format (error type, module, message, timestamp, context ID)? [Maintainability, Spec §FR-053]
- [ ] [ ] CHK117 - Are requirements specified for database schema version tracking in app_metadata table? [Maintainability, Database Schema]
- [ ] [ ] CHK118 - Are requirements specified for clear error messages for all failure scenarios with exact user-facing text? [Maintainability, Spec §Edge Cases]
- [ ] [ ] CHK119 - Are requirements specified for searchable string format consistency across all email clients? [Maintainability, Spec §FR-003, R0-9]
- [ ] [ ] CHK120 - Are requirements specified for extensible parser architecture (EmailParser interface, factory pattern) for future format additions? [Maintainability, R0-1]

#### Compliance

- [ ] CHK121 - Are requirements specified for GDPR/CCPA alignment (data retention, user rights, data deletion)? [Compliance, Spec §Assumptions 10]
- [ ] [ ] CHK122 - Are requirements specified for code signature verification for auto-updates? [Compliance, Spec §Tech Architecture §4.9]
- [ ] [ ] CHK123 - Are requirements specified for audit logging (app_logs table) with sufficient detail for troubleshooting? [Compliance, Database Schema]
- [ ] [ ] CHK124 - Are requirements specified for data export warnings (unencrypted files, user responsibility)? [Compliance, Spec §FR-052]
- [ ] [ ] CHK125 - Are requirements specified for configuration integrity (HMAC-SHA256 signing) to prevent tampering? [Compliance, Architecture v2.6]
- [ ] [ ] CHK126 - Are requirements specified for preventing silent data loss (no automatic deletion without user action)? [Compliance, Constitution Principle II]

## Dependencies & Assumptions

- [ ] CHK127 - Is the assumption of user technical proficiency (basic computer literacy, copy-paste, email client search) validated? [Assumption, Spec §Assumptions 1]
- [ ] [ ] CHK128 - Is the assumption of email client availability (Thunderbird, Apple Mail, Outlook, webmail) with search string support validated? [Assumption, Spec §Assumptions 2]
- [ ] [ ] CHK129 - Is the assumption of local LLM service installation (user responsible for Ollama) clearly stated? [Assumption, Spec §Assumptions 3]
- [ ] [ ] CHK130 - Is the assumption of system keyring availability (OS provides keyring or credential manager) validated? [Assumption, Spec §Assumptions 4]
- [ ] [ ] CHK131 - Is the assumption of network connectivity (stable internet for remote mode) with clear error messaging validated? [Assumption, Spec §Assumptions 5]
- [ ] [ ] CHK132 - Is the assumption of email format distribution (.eml 60%, .msg 25%, etc.) validated? [Assumption, Spec §Assumptions 7]
- [ ] [ ] CHK133 - Is the assumption of language support (Chinese/English interface, major languages for processing) validated? [Assumption, Spec §Assumptions 8]
- [ ] CHK134 - Is the assumption of hardware requirements (8GB RAM, 4 CPU cores for local LLM) validated? [Assumption, Spec §Assumptions 9]
- [ ] [ ] CHK135 - Is the assumption of legal jurisdiction (privacy-conscious users, GDPR/CCPA) validated? [Assumption, Spec §Assumptions 10]
- [ ] [ ] CHK136 - Is the assumption of update distribution (GitHub Releases, manual download for restricted regions) validated? [Assumption, Spec §Assumptions 11]
- [ ] CHK137 - Is the assumption of data loss acceptance (device change = permanent loss, user responsible for export) validated? [Assumption, Spec §Assumptions 12]
- [ ] [ ] CHK138 - Is the assumption of feedback utility (collected but not guaranteed to be used) validated? [Assumption, Spec §Assumptions 13]
- [ ] [ ] CHK139 - Is the assumption of search string compatibility (major email clients, some may require syntax adjustments) validated? [Assumption, Spec §Assumptions 14]
- [ ] [ ] CHK140 - Is the assumption of batch processing limits (50 emails max) validated? [Assumption, Spec §Assumptions 15]
- [ ] [ ] CHK141 - Is the assumption of constitutional compliance (100% mandatory, no exceptions) validated? [Dependency, Constitution]
- [ ] [ ] CHK142 - Are dependencies on external libraries (better-sqlite3, Zod, QuickJS WASM, mailparser, msg-extractor, libpff) documented? [Dependency, R0-1, R0-2]
- [ ] [ ] CHK143 - Are dependencies on external services (Ollama for local mode, third-party LLM API for remote, GitHub Releases) documented? [Dependency, Architecture v2.6]
- [ ] [ ] CHK144 - Are dependencies on system components (system keyring, file system access, network stack) documented? [Dependency, Architecture v2.6]

## Ambiguities & Conflicts

- [ ] CHK145 - Is "complete source information" for action items consistently defined across all requirements (same 6 metadata fields everywhere)? [Consistency, Spec §US1, FR-003]
- [ ] [ ] CHK146 - Is the distinction between "same-batch duplicates" and "cross-batch duplicates" clearly defined in user reporting (different messages)? [Clarity, Spec §FR-008A, Edge Cases]
- [ ] [ ] CHK147 - Is "日 (30天/90天/180天/365/永久)" format precisely defined with exact mapping of -1 to "永久"? [Clarity, Spec §US6]
- [ ] [ ] CHK148 - Is the distinction between "encryption keys lost" (key ring access failure) and "feedback data corruption" (unreadable feedback records) clearly distinguished? [Clarity, Spec §Edge Cases]
- [ ] [ ] CHK149 - Is the distinction between "本地模式" (local mode) blocking non-local requests and "远程模式" (remote mode) allowing all requests clearly specified? [Clarity, Constitution Principle IV]
- [ ] [ ] CHK150 - Is "降级入库" (degraded to database) behavior clearly distinguished from "丢弃" (discard) across all requirements? [Consistency, Constitution Principle II]
- [ ] [ ] CHK151 - Is "置信度强制≤0.4" (confidence capped at 0.4) consistently applied for unverified items? [Consistency, Spec §FR-006]
- [ ] [ ] CHK152 - Is the distinction between "建议复核" (Suggested Review, 0.6-0.79) and "[来源待确认]" (Source Pending, <0.6) clearly visually distinguished? [Clarity, Spec §US2]
- [ ] [ ] CHK153 - Is "30天/90天/180天/365天" retention specified in days or other time units? [Clarity, Spec §US6]
- [ ] [ ] CHK154 - Is "同设备重装可恢复历史" assumption validated against database key binding behavior? [Assumption vs Conflict, Spec §Data Security Requirements]
- [ ] [ ] CHK155 - Is "90% of users can locate email within 60 seconds" achievable given search string format variations across email clients? [Feasibility, Spec §SC-003]

## Edge Case Coverage

- [ ] CHK156 - Are requirements specified for emails with BOTH missing Message-ID AND content too short for fingerprint? [Edge Case, Spec §Edge Cases]
- [ ] [ ] CHK157 - Are requirements specified for handling extremely large email files approaching 20MB limit? [Edge Case, Constraints]
- [ ] [ ] CHK158 - Are requirements specified for emails with no actionable content (no items extracted)? [Edge Case, Database Schema extract_status='no_content']
- [ ] [ ] CHK159 - Are requirements specified for batch processing interruption (application crashes during batch)? [Edge Case, Gap]
- [ ] [ ] CHK160 - Are requirements specified for database file corruption (SQLite database damaged)? [Edge Case, Gap]
- [ ] [ ] CHK161 - Are requirements specified for search string copy failure (clipboard unavailable, copy error)? [Edge Case, Gap]
- [ ] [ ] CHK162 - Are requirements specified for export file write failure (disk full, permissions)? [Edge Case, Gap]
- [ ] [ ] CHK163 - Are requirements specified for mode switch queue overflow (many rapid mode switches)? [Edge Case, Gap]
- [ ] [ ] CHK164 - Are requirements specified for rapid successive batch submissions (system overwhelmed)? [Edge Case, Performance]
- [ ] [ ] CHK165 - Are requirements specified for concurrent feedback submission (user marks multiple items rapidly)? [Edge Case, Gap]
- [ ] [ ] CHK166 - Are requirements specified for conflicting retention period changes (user changes from 90 to 30 days then back to 90)? [Edge Case, Gap]
- [ ] [ ] CHK167 - Are requirements specified for manual database file deletion while application running? [Edge Case, Gap]
- [ ] [ ] CHK168 - Are requirements specified for operating system going to sleep/hibernate during batch processing? [Edge Case, Gap]
- [ ] [ ] CHK169 - Are requirements specified for changing email source file while application is running (file moved/deleted)? [Edge Case, Gap]

## Traceability & References

- [ ] CHK170 - Does each checklist item reference the spec section (e.g., [Spec §US1]) or use [Gap]/[Ambiguity]/[Conflict] markers? [Traceability, Target ≥80%]
- [ ] [ ] CHK171 - Do functional requirements reference specific user stories or constitutional principles for justification? [Traceability]
- [ ] [ ] CHK172 - Do edge case requirements reference specific scenarios or clarifications? [Traceability]
- [ ] [ ] CHK173 - Do non-functional requirements reference constitution principles or architecture decisions? [Traceability]
- [ ] [ ] CHK174 - Do checklist items reference the plan.md for technical implementation details? [Traceability, Plan Reference]
- [ ] [ ] CHK175 - Do checklist items clearly distinguish between requirement specifications and implementation details? [Traceability]

## Notes

**Generated for**: Pre-Implementation (Author) validation - Standard depth PR Review level with comprehensive coverage across all risk areas

**Focus Areas**: Comprehensive Coverage including:
- Data Privacy & Security (encryption, mode isolation, key management, data leakage prevention)
- Anti-Hallucination & Accuracy (source traceability, confidence thresholds, degradation logic, duplicate detection)
- Performance & Resource Limits (timeouts, memory limits, processing constraints)
- Constitutional Compliance (all 7 principles satisfied)

**Total Items**: 175 checklist items covering completeness, clarity, consistency, acceptance criteria quality, scenario coverage (primary, alternate, exception, recovery), non-functional requirements, dependencies/assumptions, ambiguities/conflicts, edge cases, and traceability.

**Usage Instructions**:
- Mark checkboxes as [x] when validated
- Mark [Gap] for missing requirements
- Mark [Ambiguity] for unclear requirements
- Mark [Conflict] for contradictory requirements
- Add inline notes for any issues found
- Review items marked [Gap] with user before proceeding to `/speckit.plan`
