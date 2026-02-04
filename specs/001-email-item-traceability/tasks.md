# Tasks: Email Item Traceability & Verification System

**Input**: Design documents from `/specs/001-email-item-traceability/`
**Prerequisites**: plan.md v2.0 ✅, spec.md ✅, data-model.md ✅, contracts/llm-api.yaml ✅, research.md ✅

**Plan Version**: 2.0.0 (OpenAI SDK integration - replaces raw fetch API with official OpenAI library)
**Last Regenerated**: 2026-02-03
**Completed Tasks Preserved**: T001-T023, T026a-d, T027-T029, T031 (Data layer + LLM interface + OutputValidator complete ✅)
**Affected Tasks**: T030 (RemoteLLM needs refactoring to use OpenAI SDK - marked as pending)

**Tests**: Tests are OPTIONAL per plan.md. Test tasks are included as per constitution Principle V (60% unit, 40% integration, no E2E).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Task Status Notation

- **[X]**: Completed task (preserved from previous work)
- **[ ]**: Pending task (not yet started)
- **[~]**: Affected task (completed but requires refactoring due to plan changes)

## Path Conventions

- **Electron desktop**: `main/` (main process), `renderer/` (renderer process), `shared/` (shared code), `tests/` (test suites)
- **Database**: SQLite database with field-level encryption at `~/.mailcopilot/app.db`
- **Tests**: `tests/unit/` (60%), `tests/integration/` (40%)
- **LLM Integration**: OpenAI SDK v4.x for remote mode, fetch API for local Ollama mode

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for Electron desktop application

- [X] T001 Initialize package.json with dependencies (Electron 29.4.6, React 18, TypeScript 5.4, better-sqlite3 11.10.0, Zustand 4.5, Zod 3.22.4, QuickJS WASM, electron-log 5.0.0)
- [X] T002 [P] Configure TypeScript (tsconfig.json for main, renderer, shared)
- [X] T003 [P] Setup ESLint and Prettier with TypeScript support
- [X] T004 [P] Configure Vitest 3.x for unit testing (85%+ coverage target, 100% for security modules per plan.md)
- [X] T005 [P] Create project directory structure (main/, renderer/, shared/, tests/)
- [X] T006 [P] Setup Electron build configuration (electron-builder for packaging)
- [X] T007 [P] Configure environment variable management (.env.local support)
- [X] T008 [P] Install and configure date-fns v4.x in package.json (add date-fns@^4.0.0 to dependencies)
- [X] T008a [P] Install OpenAI SDK v4.x in package.json (add openai@^4.0.0 to dependencies per plan.md Decision 1)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database & Encryption Foundation

- [X] T009 Implement Database class in main/database/Database.ts (better-sqlite3 wrapper, WAL mode, connection management)
- [X] T010 [P] Implement AES-256-GCM field encryption in main/config/encryption.ts (crypto.subtle Web Crypto API, 256-bit keys)
- [X] T011 [P] Implement safeStorage key management in main/config/ConfigManager.ts (key generation, device binding, no export)
- [X] T012 [P] Create database migration scripts in main/database/migrations/ (001_initial_schema.sql)
- [X] T013 [P] Create database schema from plan.md SQL DDL in main/database/schema.ts (6 tables: email_sources, action_items, item_email_refs, user_feedback, daily_reports, data_retention_config)

### IPC & Logging Infrastructure

- [X] T014 [P] Setup IPC channel definitions in main/ipc/channels.ts (6 channels: llm:generate, db:query:history, db:export, config:get/set, app:check-update, email:fetch-meta)
- [X] T015 [P] Implement structured logging in main/config/logger.ts using electron-log v5 (error type, module, message, timestamp, context ID)
- [X] T016 [P] Create base Zod schemas in shared/schemas/validation.ts (ItemSchema, EmailMetadataSchema, ConfigSchema per data-model.md)

### Application Entry Point

- [X] T017 Implement single-instance lock in main/app.ts (app.requestSingleInstanceLock(), second-instance handling)
- [X] T018 [P] Create main process entry point in main/index.ts (app initialization, window creation)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Complete Email Item Traceability (Priority: P1) 🎯 MVP

**Goal**: Extract action items from emails with 100% source traceability (Message-ID or SHA-256 fingerprint)

**Independent Test**: Process 50 .eml emails with known action items, verify every item displays complete source info (sender, date, subject, Message-ID/fingerprint, search string, file path) and search string locates email within 60 seconds

### Security Tests for US1 (Constitution Principle V: 100% coverage for security modules) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T019 [P] [US1] Unit test for field encryption/decryption in tests/unit/encryption/encryption.test.ts (Buffer.fill(0) cleanup verification, AES-256-GCM validation)
- [X] T020 [P] [US1] Unit test for SHA-256 fingerprint generation in tests/unit/email/fingerprint.test.ts (collision resistance, Message-ID+fingerprint combinations)
- [X] T021 [P] [US1] Integration test for database operations in tests/integration/database/crud.test.ts (transaction wrapping, foreign key constraints, encrypted field storage)

### Data Layer for US1

- [X] T022 [P] [US1] Create EmailSource entity/model in main/database/entities/EmailSource.ts (email_hash, processed_at, last_seen_at, search_string, file_path, extraction_status per data-model.md)
- [X] T023 [P] [US1] Create ActionItem entity/model in main/database/entities/ActionItem.ts (content_encrypted, item_type, confidence, source_status, evidence per data-model.md)
- [X] T024 [P] [US1] Create ItemEmailRef entity/model in main/database/entities/ItemEmailRef.ts (many-to-many relationship, email_index_in_batch per data-model.md)

### Email Parsing for US1

- [X] T025 [US1] Implement EmailParser interface in main/email/parsers/EmailParser.ts (parse(filePath: string): Promise<ParsedEmail>)
- [X] T026 [US1] Implement EmlParser in main/email/parsers/EmlParser.ts (RFC 5322 .eml parsing, ≥95% Message-ID extraction per SC-004)
- [X] T027 [US1] Implement TraceabilityGenerator in main/email/TraceabilityGenerator.ts (search string format: `from:sender subject:"snippet" date:YYYY-MM-DD`, subject truncation to 30 chars)

### Date Handling for US1

- [X] T028a [P] [US1] Refactor EmlParser date extraction in main/email/parsers/EmlParser.ts (replace `new Date().toISOString()` with date-fns `formatISO`, `parseISO` for consistent date handling)
- [X] T028b [P] [US1] Refactor TraceabilityGenerator date formatting in main/email/TraceabilityGenerator.ts (replace native Date methods with date-fns `format`, `parseISO` per plan.md)
- [X] T028c [P] [US1] Create date utility module in shared/utils/dateUtils.ts (export `formatYYYYMMDD`, `formatISO8601`, `parseEmailDate` using date-fns v4.x)
- [X] T028d [P] [US1] Unit test for date utilities in tests/unit/utils/dateUtils.test.ts (test date format functions with edge cases: invalid dates, timezone handling, leap years)

### Duplicate Detection for US1

- [X] T029 [US1] Implement DuplicateDetector in main/email/DuplicateDetector.ts (SHA-256 fingerprint: SHA256(Message-ID + Date + From), cross-batch detection, update last_seen_at per FR-008A)
- [X] T030 [P] [US1] Unit test for duplicate detection in tests/unit/email/duplicate-detector.test.ts (same-batch skip, cross-batch timestamp update, audit logging)

### LLM Integration for US1 (UPDATED: OpenAI SDK)

- [X] T031 [US1] Implement LLMAdapter interface in main/llm/LLMAdapter.ts (generate(batch: EmailBatch): Promise<LLMOutput>, checkHealth(), getConfig(), updateConfig())
- [X] T032 [P] [US1] **[REFACTOR]** Implement RemoteLLM adapter using OpenAI SDK in main/llm/RemoteLLM.ts (OpenAI client with 30s timeout, 2 retries, JSON mode per plan.md Decision 1)
- [X] T033 [US1] Implement OutputValidator in main/llm/OutputValidator.ts (Zod schema validation, 2-retry limit, degradation fallback per R0-5)

### LLM Integration Tests for US1

- [X] T034 [P] [US1] Unit test for RemoteLLM with OpenAI SDK in tests/unit/llm/remote-llm.test.ts (mock OpenAI client, test error handling, retry logic, timeout enforcement)
- [X] T035 [P] [US1] Integration test for OpenAI SDK integration in tests/integration/llm/openai-sdk.test.ts (test with real OpenAI API using test key, verify JSON mode response, structured output parsing)
- [X] T036 [P] [US1] Unit test for OutputValidator in tests/unit/llm/validator.test.ts (Zod validation, retry with reinforcement, degradation fallback)

### Confidence Calculation for US1

- [X] T037 [US1] Implement ConfidenceCalculator in main/llm/ConfidenceCalculator.ts (dual-engine: rules 50% + LLM 50%, schema failure adjustment: rules 60% + LLM 20%, cap at 0.6 per FR-010)
- [X] T038 [P] [US1] Implement RuleEngine in main/rules/RuleEngine.ts (QuickJS sandbox wrapper, 128MB memory limit, 5s timeout per FR-056)
- [X] T039 [P] [US1] Implement rule definitions in main/rules/rules.ts (deadline keywords, priority detection, sender whitelist per plan.md)
- [X] T040 [P] [US1] Unit test for confidence calculation in tests/unit/llm/confidence.test.ts (rule+LLM scoring, schema failure weight adjustment, <0.6 cap validation)
- [X] T041 [P] [US1] Security test for QuickJS sandbox in tests/integration/security/quickjs-sandbox.test.ts (20+ escape scenarios: os/std/eval/Function blocked, memory isolation, timeout enforcement per R0-2)

### Email Processing Pipeline for US1

- [X] T042 [US1] Implement EmailProcessor orchestrator in main/email/EmailProcessor.ts (parser → duplicate check → rule engine → LLM → validation → confidence calc → database storage)
- [X] T043 [US1] Implement IPC handler for llm:generate in main/ipc/handlers/llmHandler.ts (email batch processing, return items+batch_info per IPC schema in contracts/llm-api.yaml)
- [X] T044 [P] [US1] Unit test for email processing pipeline in tests/unit/email/pipeline.test.ts (end-to-end extraction with mock LLM, degraded item handling per FR-018)

### Renderer UI for US1 (Traceability Display)

- [X] T045 [P] [US1] Create ReportView component in renderer/src/components/ReportView/ReportView.tsx (display action items with source info: sender, date, subject, Message-ID/fingerprint, file path)
- [X] T046 [US1] Create TraceabilityInfo component in renderer/src/components/ReportView/TraceabilityInfo.tsx (display search string, Copy Search Keywords button per FR-004)
- [X] T047 [P] [US1] Create IPC client service in renderer/src/services/ipc.ts (llm:generate, db:query:history invokers)
- [X] T048 [P] [US1] Create Zustand store for report state in renderer/src/stores/reportStore.ts (items, loading state, error handling)

**Checkpoint**: User Story 1 complete - users can process emails, view action items with 100% traceability, copy search strings, verify sources manually

---

## Phase 4: User Story 2 - Low Confidence Item Warning System (Priority: P1)

**Goal**: Proactively highlight low-confidence items (<0.6) so users focus verification efforts

**Independent Test**: Process emails with ambiguous content, verify items with confidence <0.6 have light yellow background, "[来源待确认]" tag, expanded source info, summary banner at top

### Tests for US2

- [ ] T049 [P] [US2] Unit test for confidence threshold classification in tests/unit/llm/thresholds.test.ts (≥0.8 normal, 0.6-0.79 "[建议复核]", <0.6 "[来源待确认]" per FR-011)
- [ ] T050 [P] [US2] Integration test for confidence display in tests/integration/ui/confidence-display.test.ts (visual indicators, summary banner counts)

### UI Components for US2

- [ ] T051 [P] [US2] Create ConfidenceBadge component in renderer/src/components/ReportView/ConfidenceBadge.tsx (gray "[建议复核]" for 0.6-0.79, prominent "[来源待确认]" for <0.6 per FR-011)
- [ ] T052 [P] [US2] Create ConfidenceSummaryBanner component in renderer/src/components/ReportView/ConfidenceSummaryBanner.tsx ("✅ 高置信度：X条, ⚠️ 需复核：Y条, ❓ 来源待确认：Z条" per FR-012)
- [ ] T053 [US2] Implement conditional styling in ReportView component (light yellow background for <0.6 items, expanded source info display per US2 acceptance scenario 3)

### Backend Logic for US2

- [ ] T054 [US2] Implement confidence-based filtering in reportStore.ts (filter items by confidence thresholds, sort by confidence ascending)
- [ ] T055 [P] [US2] Unit test for confidence aggregation in tests/unit/llm/aggregation.test.ts (count high/medium/low confidence items, summary statistics)

**Checkpoint**: User Story 2 complete - low-confidence items are visually distinguished and aggregated in summary

---

## Phase 5: User Story 3 - Local Privacy-Preserving Feedback System (Priority: P1)

**Goal**: Allow users to provide feedback on item accuracy without uploading data (local-only, encrypted storage)

**Independent Test**: Mark items as correct/incorrect, select error reasons, verify feedback stored locally (no network traffic), confirm encryption, validate "destroy all feedback data" permanently removes data

### Tests for US3

- [ ] T056 [P] [US3] Unit test for feedback encryption in tests/unit/encryption/feedback.test.ts (AES-256-GCM encryption of feedback_type and error_reason fields)
- [ ] T057 [P] [US3] Integration test for local-only feedback storage in tests/integration/feedback/local-only.test.ts (verify no network traffic during feedback operations)

### Data Layer for US3

- [ ] T058 [US3] Create UserFeedback entity/model in main/database/entities/UserFeedback.ts (feedback_type, error_reason, timestamp, encrypted fields per data-model.md)
- [ ] T059 [P] [US3] Create DataRetentionConfig entity/model in main/database/entities/DataRetentionConfig.ts (email_metadata_retention_days, feedback_retention_days, last_cleanup_at per data-model.md)

### Feedback UI Components for US3

- [ ] T060 [P] [US3] Create FeedbackButtons component in renderer/src/components/Feedback/FeedbackButtons.tsx (✓ and ✗ buttons with tooltips "✓ 标记准确" and "✗ 标记错误")
- [ ] T061 [US3] Create FeedbackDialog component in renderer/src/components/Feedback/FeedbackDialog.tsx (privacy notice, 4 error reason options: content_error/priority_error/not_actionable/source_error)
- [ ] T062 [P] [US3] Create FeedbackSettings component in renderer/src/components/Settings/FeedbackSettings.tsx ("本月修正X处错误", retention selector: 30/90/180/365/永久, export/destroy buttons)

### Feedback IPC Handlers for US3

- [ ] T063 [US3] Implement IPC handler for feedback submission in main/ipc/handlers/feedbackHandler.ts (store feedback with encryption, update UserFeedback table)
- [ ] T064 [P] [US3] Implement IPC handler for feedback statistics in main/ipc/handlers/statsHandler.ts (query error corrections this month, aggregate feedback)
- [ ] T065 [P] [US3] Implement IPC handler for feedback export in main/ipc/handlers/exportHandler.ts (export unencrypted feedback data as file)
- [ ] T066 [P] [US3] Implement IPC handler for feedback destruction in main/ipc/handlers/cleanupHandler.ts (permanent deletion of all feedback records with confirmation)

**Checkpoint**: User Story 3 complete - users can provide feedback locally, data is encrypted, export/destroy functions work correctly

---

## Phase 6: User Story 4 - Multi-Format Email Parsing & Indexing (Priority: P2)

**Goal**: Support multiple email formats (.eml, .msg, .pst, .mbox, .html) with format-specific extraction rates

**Independent Test**: Process sample files in each format, verify action items extracted with metadata, confirm Message-ID extraction rates meet targets (.eml ≥95%, .msg ≥85%, .pst ≥90%)

### Additional Parsers for US4

- [ ] T067 [P] [US4] Implement MsgParser in main/email/parsers/MsgParser.ts (Outlook .msg parsing, ≥85% Message-ID extraction, SHA-256 fallback per SC-004)
- [ ] T068 [P] [US4] Implement PstParser in main/email/parsers/PstParser.ts (Outlook .pst/.ost archive parsing, ≥90% Message-ID extraction, ~200ms overhead per email)
- [ ] T069 [P] [US4] Implement MboxParser in main/email/parsers/MboxParser.ts (Unix mbox format, From_ delimiter logic, file offset recording, ≥95% Message-ID extraction)
- [ ] T070 [P] [US4] Implement HtmlParser in main/email/parsers/HtmlParser.ts (Exported .htm/.html parsing, metadata from <meta>/<title>, ~30% Message-ID extraction, confidence capped at 0.6)

### Parser Tests for US4

- [ ] T071 [P] [US4] Unit test for MsgParser in tests/unit/email/parsers/msg-parser.test.ts (Message-ID extraction rate ≥85%, SHA-256 fallback)
- [ ] T072 [P] [US4] Unit test for PstParser in tests/unit/email/parsers/pst-parser.test.ts (archive extraction, Message-ID extraction rate ≥90%)
- [ ] T073 [P] [US4] Unit test for MboxParser in tests/unit/email/parsers/mbox-parser.test.ts (From_ delimiter separation, offset recording, Message-ID extraction rate ≥95%)
- [ ] T074 [P] [US4] Unit test for HtmlParser in tests/unit/email/parsers/html-parser.test.ts (metadata extraction, low Message-ID rate ~30%, confidence cap at 0.6)

### Format Detection for US4

- [ ] T075 [US4] Implement format detection in main/email/EmailParser.ts (detect format from file extension, delegate to appropriate parser)
- [ ] T076 [P] [US4] Unit test for format detection in tests/unit/email/parser-dispatch.test.ts (correct parser selection for .eml/.msg/.pst/.mbox/.html files)

**Checkpoint**: User Story 4 complete - all 5 email formats supported with specified extraction rates

---

## Phase 7: User Story 5 - Dual-Mode Operation with Hot Switching (Priority: P2)

**Goal**: Switch between local (offline-only) and remote (cloud LLM) modes without restart

**Independent Test**: Initiate mode switch while batch processing, verify current batch completes under old mode, subsequent batches use new mode, user notified of pending switch

### Local LLM Integration for US5

- [ ] T077 [P] [US5] Implement LocalLLM adapter in main/llm/LocalLLM.ts (Ollama API integration, fetch API to http://localhost:11434/api/generate, no auto-degradation per FR-037)
- [ ] T078 [P] [US5] Implement Ollama health check in main/llm/LocalLLM.ts (GET http://localhost:11434/api/tags to verify service availability)
- [ ] T079 [P] [US5] Unit test for LocalLLM in tests/unit/llm/local-llm.test.ts (Ollama API integration, health check, error handling)

### Mode Switching Logic for US5

- [ ] T080 [US5] Implement ModeManager in main/config/ModeManager.ts (mode state: local/remote, queue management during switch, batch completion wait per FR-033)
- [ ] T081 [P] [US5] Implement IPC handler for mode switching in main/ipc/handlers/modeHandler.ts (switch request, queue new tasks, notify user of pending switch per FR-035)
- [ ] T082 [P] [US5] Implement local mode failure blocking in main/llm/LocalLLM.ts (check health before processing, block with error if unavailable per FR-036, NO auto-fallback per FR-037)
- [ ] T083 [P] [US5] Unit test for mode switching in tests/unit/config/mode-switching.test.ts (batch completion wait, queue management, user notification)

### Mode Switching UI for US5

- [ ] T084 [P] [US5] Create ModeSelector component in renderer/src/components/Settings/ModeSelector.tsx (radio buttons for local/remote mode, current mode display)
- [ ] T085 [US5] Create ModeSwitchNotification component in renderer/src/components/Settings/ModeSwitchNotification.tsx (display "当前任务处理完成后将切换模式，新任务已进入队列等待" per FR-035)

### Auto-Update Policy for US5

- [ ] T086 [P] [US5] Implement auto-update check in main/app.ts (remote mode: check on startup per FR-038, local mode: disable auto-check, manual trigger via Settings per FR-039)
- [ ] T087 [P] [US5] Create manual update check button in renderer/src/components/Settings/UpdateSettings.tsx ("手动检查更新" button for local mode)

### Network Isolation for US5

- [ ] T088 [US5] Implement network interceptor in main/network/NetworkInterceptor.ts (local mode: block non-localhost requests at network layer per FR-040, remote mode: allow TLS 1.3 to LLM endpoints)
- [ ] T089 [P] [US5] Integration test for network isolation in tests/integration/network/isolation.test.ts (verify non-local requests blocked in local mode, allow LLM API in remote mode)

**Checkpoint**: User Story 5 complete - hot mode switching works, local mode blocks on failure, network isolation enforced

---

## Phase 8: User Story 6 - Configurable Data Retention with Privacy Controls (Priority: P2)

**Goal**: Allow users to configure how long email metadata and feedback data are retained

**Independent Test**: Set different retention periods, verify data older than retention period is auto-deleted (except when permanent), confirm immediate cleanup on retention change

### Retention Policy Logic for US6

- [ ] T090 [US6] Implement retention cleanup task in main/tasks/RetentionCleanupTask.ts (daily cron job at 2:00 AM, delete metadata older than retention period, preserve data if retention_days=-1)
- [ ] T091 [P] [US6] Implement immediate cleanup on retention change in main/config/ConfigManager.ts (trigger cleanup immediately when user changes retention period, show confirmation)
- [ ] T092 [P] [US6] Implement 30-day manual cleanup in main/ipc/handlers/cleanupHandler.ts ("清理30天前数据" button, one-time cleanup regardless of retention setting per FR-048)

### Retention UI for US6

- [ ] T093 [P] [US6] Create RetentionSettings component in renderer/src/components/Settings/RetentionSettings.tsx (email metadata retention selector: 30/90/180/365/永久, feedback retention selector, estimated storage usage display per FR-046)
- [ ] T094 [US6] Create ManualCleanupButton component in renderer/src/components/Settings/ManualCleanupButton.tsx ("清理30天前数据" button, confirmation dialog per FR-048)

### Retention Tests for US6

- [ ] T095 [P] [US6] Unit test for retention cleanup in tests/unit/tasks/retention-cleanup.test.ts (delete records older than retention period, preserve records if retention_days=-1)
- [ ] T096 [P] [US6] Integration test for immediate cleanup in tests/integration/config/retention-change.test.ts (verify cleanup triggers immediately on retention period change)

**Checkpoint**: User Story 6 complete - retention periods configurable, automatic cleanup works, manual cleanup available

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final polish, performance optimization, documentation, and deployment readiness

### Performance Optimization

- [ ] T097 [P] Implement database query optimization in main/database/Database.ts (ensure all indexes created, WAL mode enabled, query execution plan analysis)
- [ ] T098 [P] Implement parallel LLM calls in main/llm/RemoteLLM.ts (future enhancement: concurrent requests for independent emails in batch)
- [ ] T099 [P] Performance test for 1000-report query in tests/integration/performance/report-query.test.ts (verify <100ms execution per SC-017)

### Error Handling & Logging

- [ ] T100 Implement global error handler in main/errorHandler.ts (catch unhandled errors, log with context, show user-friendly error messages)
- [ ] T101 [P] Implement structured error logging in main/config/logger.ts (error type, module, message, timestamp, context ID per FR-053)
- [ ] T102 [P] Implement audit logging for duplicate detection in main/email/DuplicateDetector.ts (log "跳过N封重复邮件", "跳过N封已处理邮件" per FR-008A)

### Security Hardening

- [ ] T103 [P] Security audit for SQL injection in tests/integration/security/sql-injection.test.ts (verify parameterized queries, no string concatenation in SQL)
- [ ] T104 [P] Security audit for memory cleanup in tests/integration/security/memory-cleanup.test.ts (verify Buffer.fill(0) called after sensitive data usage per Principle VII)
- [ ] T105 [P] Security audit for single-instance lock in tests/integration/security/single-instance.test.ts (verify second instance quits immediately, window focus works per FR-059-FR-061)

### Documentation

- [ ] T106 [P] Create API documentation in docs/api/llm-api.md (document LLM adapter interface, RemoteLLM with OpenAI SDK usage, LocalLLM with Ollama)
- [ ] T107 [P] Create deployment guide in docs/deployment.md (packaging with electron-builder, code signing, distribution via GitHub Releases)
- [ ] T108 [P] Update README.md with quickstart instructions (feature overview, setup steps, usage examples)

### Final Testing

- [ ] T109 End-to-end test for complete email processing workflow in tests/integration/e2e/email-processing.test.ts (upload .eml → process → view report → verify traceability → copy search string)
- [ ] T110 [P] Load test for 50-email batch processing in tests/integration/performance/batch-processing.test.ts (verify ~18s remote mode, ~35s local mode per performance goals)
- [ ] T111 [P] Cross-platform UI test in tests/integration/ui/cross-platform.test.ts (verify UI works correctly on Windows 10+, macOS 10.15+, Linux)

**Checkpoint**: System complete - all user stories implemented, performance benchmarks met, security audits passed, documentation complete

---

## Summary

**Total Tasks**: 111 tasks
- **Setup**: 9 tasks (9 completed ✅)
- **Foundational**: 10 tasks (10 completed ✅)
- **User Story 1 (MVP)**: 30 tasks (30 completed ✅)
- **User Story 2**: 7 tasks (0 completed, 7 pending)
- **User Story 3**: 11 tasks (0 completed, 11 pending)
- **User Story 4**: 10 tasks (0 completed, 10 pending)
- **User Story 5**: 13 tasks (0 completed, 13 pending)
- **User Story 6**: 7 tasks (0 completed, 7 pending)
- **Polish**: 15 tasks (0 completed, 15 pending)

**Completed**: 42/111 tasks (37.8%)
**Remaining**: 69/111 tasks (62.2%)

**MVP Scope (User Story 1)**: ✅ COMPLETE - All 30 tasks finished

### Critical Path to MVP

1. ✅ **Setup & Foundation** (COMPLETED) - T001-T018
2. ✅ **LLM Integration Refactoring** (COMPLETED) - T008a, T032-T036 (OpenAI SDK migration complete ✅)
3. ✅ **Confidence & Pipeline** (COMPLETED) - T037-T044 (Confidence calculator, rule engine, email processing pipeline ✅)
4. ✅ **UI Implementation** (COMPLETED) - T045-T048 (ReportView, TraceabilityInfo, IPC service, Zustand store ✅)

### Parallel Execution Opportunities

**Phase 3 (US1)** - ✅ COMPLETED:
- **Track A (Backend)**: T038-T039 (Rule engine implementation) - ✅ COMPLETED
- **Track B (Security Tests)**: T041 (QuickJS sandbox security tests) - ✅ COMPLETED (40 tests)
- **Track C (Pipeline)**: T042-T044 (Email processing pipeline) - ✅ COMPLETED
- **Track D (UI)**: T045-T048 (Renderer UI components) - ✅ COMPLETED

**Phase 4-8 (US2-US6)**: Each user story is independent and can be implemented in parallel.

### Next Actions

1. ✅ **COMPLETED**: Install OpenAI SDK (T008a) - `npm install openai@^4.0.0` ✅
2. ✅ **COMPLETED**: Refactor RemoteLLM to use OpenAI SDK (T032) - Type-safe integration complete ✅
3. ✅ **COMPLETED**: Add LLM integration tests (T034-T036) - All tests passing (243 tests) ✅
4. ✅ **COMPLETED**: Implement ConfidenceCalculator (T037) - Dual-engine confidence calculation with degradation support ✅
5. ✅ **COMPLETED**: Add confidence calculation tests (T040) - 25 tests passing ✅
6. ✅ **COMPLETED**: Implement RuleEngine with sandbox wrapper (T038) - QuickJS sandbox principles, timeout/memory limits ✅
7. ✅ **COMPLETED**: Implement rule definitions (T039) - Deadline/priority keywords, sender whitelist, action verbs ✅
8. ✅ **COMPLETED**: Security test for QuickJS sandbox (T041) - 40 security tests covering 20+ escape scenarios ✅
9. ✅ **COMPLETED**: Implement EmailProcessor orchestrator (T042) - Email processing pipeline complete ✅
10. ✅ **COMPLETED**: Implement IPC handler for llm:generate (T043) - Email batch processing IPC handler ✅
11. ✅ **COMPLETED**: Add email processing pipeline tests (T044) - End-to-end extraction tests ✅
12. ✅ **COMPLETED**: Create ReportView component (T045) - Display action items with source info ✅
13. ✅ **COMPLETED**: Create TraceabilityInfo component (T046) - Search string display and copy button ✅
14. ✅ **COMPLETED**: Create IPC client service (T047) - Type-safe IPC communication ✅
15. ✅ **COMPLETED**: Create Zustand store (T048) - Report state management ✅

**Next**: User Story 2 - Low Confidence Item Warning System (T049-T055)

---

**Generated**: 2026-02-03
**Plan Version**: 2.0.0 (OpenAI SDK Integration)
**Constitution Compliance**: ✅ All 7 principles satisfied
