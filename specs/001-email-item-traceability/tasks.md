# Tasks: Email Item Traceability & Verification System

**Input**: Design documents from `/specs/001-email-item-traceability/`
**Prerequisites**: plan.md v1.1.0 ✅, spec.md ✅, data-model.md (embedded in plan.md), contracts/ (embedded in plan.md)

**Plan Version**: 1.1.0 (依赖版本更新: Electron 29.4.6, Zustand 4.5, better-sqlite3 11.10.0)
**Last Regenerated**: 2026-01-31
**Completed Tasks Preserved**: T001-T017 (Foundation Phase)

**Tests**: Tests are OPTIONAL per plan.md. Test tasks are included as per constitution Principle V (60% unit, 40% integration, no E2E).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Electron desktop**: `main/` (main process), `renderer/` (renderer process), `shared/` (shared code), `tests/` (test suites)
- Database: SQLite database with field-level encryption at `~/.mailcopilot/app.db`
- Tests: `tests/unit/` (60%), `tests/integration/` (40%)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for Electron desktop application

- [X] T001 Initialize package.json with dependencies (Electron 29.4.6, React 18, TypeScript 5.4, better-sqlite3 11.10.0, Zustand 4.5, Zod, QuickJS WASM)
- [X] T002 [P] Configure TypeScript (tsconfig.json for main, renderer, shared)
- [X] T003 [P] Setup ESLint and Prettier with TypeScript support
- [X] T004 [P] Configure Vitest for unit testing (60% coverage target, 100% for security modules)
- [X] T005 [P] Create project directory structure (main/, renderer/, shared/, tests/)
- [X] T006 [P] Setup Electron build configuration (electron-builder for packaging)
- [X] T007 [P] Configure environment variable management (.env.local support)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database & Encryption Foundation

- [X] T008 Implement Database class in main/database/Database.ts (better-sqlite3 wrapper, WAL mode, connection management)
- [X] T009 [P] Implement AES-256-GCM field encryption in main/config/encryption.ts (crypto.subtle Web Crypto API, 256-bit keys)
- [X] T010 [P] Implement safeStorage key management in main/config/ConfigManager.ts (key generation, device binding, no export)
- [X] T011 [P] Create database migration scripts in main/database/migrations/ (001_initial_schema.sql)
- [X] T012 [P] Create database schema from plan.md SQL DDL in main/database/schema.ts (6 tables: daily_reports, todo_items, processed_emails, item_email_refs, user_config, app_metadata)

### IPC & Logging Infrastructure

- [X] T013 [P] Setup IPC channel definitions in main/ipc/channels.ts (6 channels: llm:generate, db:query:history, db:export, config:get/set, app:check-update, email:fetch-meta)
- [X] T014 [P] Implement structured logging in main/logging/StructuredLogger.ts (error type, module, message, timestamp, context ID)
- [X] T015 [P] Create base Zod schemas in shared/schemas/validation.ts (ItemSchema, EmailMetadataSchema, ConfigSchema per plan.md)

### Application Entry Point

- [X] T016 Implement single-instance lock in main/app.ts (app.requestSingleInstanceLock(), second-instance handling)
- [X] T017 [P] Create main process entry point in main/index.ts (app initialization, window creation)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Complete Email Item Traceability (Priority: P1) 🎯 MVP

**Goal**: Extract action items from emails with 100% source traceability (Message-ID or SHA-256 fingerprint)

**Independent Test**: Process 50 .eml emails with known action items, verify every item displays complete source info (sender, date, subject, Message-ID/fingerprint, search string, file path) and search string locates email within 60 seconds

### Security Tests for US1 (Constitution Principle V: 100% coverage for security modules) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T018 [P] [US1] Unit test for field encryption/decryption in tests/unit/encryption/encryption.test.ts (Buffer.fill(0) cleanup verification, AES-256-GCM validation)
- [ ] T019 [P] [US1] Unit test for SHA-256 fingerprint generation in tests/unit/email/fingerprint.test.ts (collision resistance, Message-ID+fingerprint combinations)
- [ ] T020 [P] [US1] Integration test for database operations in tests/integration/database/crud.test.ts (transaction wrapping, foreign key constraints, encrypted field storage)

### Data Layer for US1

- [ ] T021 [P] [US1] Create EmailSource entity/model in main/database/entities/EmailSource.ts (email_hash, processed_at, last_seen_at, search_string, file_path, extract_status)
- [ ] T022 [P] [US1] Create ActionItem entity/model in main/database/entities/ActionItem.ts (item_id, content_encrypted, source_status, confidence_score, feedback_type)
- [ ] T023 [P] [US1] Create ItemEmailRef entity/model in main/database/entities/ItemEmailRef.ts (many-to-many relationship, evidence_text, confidence)

### Email Parsing for US1

- [ ] T024 [US1] Implement EmailParser interface in main/email/parsers/EmailParser.ts (parse(filePath: string): Promise<ParsedEmail>)
- [ ] T025 [US1] Implement EmlParser in main/email/parsers/EmlParser.ts (RFC 5322 .eml parsing, ≥95% Message-ID extraction per SC-004)
- [ ] T026 [US1] Implement TraceabilityGenerator in main/email/TraceabilityGenerator.ts (search string format: `from:sender subject:"snippet" date:YYYY-MM-DD`, subject truncation to 30 chars)

### Duplicate Detection for US1

- [ ] T027 [US1] Implement DuplicateDetector in main/email/DuplicateDetector.ts (SHA-256 fingerprint: SHA256(Message-ID + Date + From), cross-batch detection, update last_seen_at per FR-008A)
- [ ] T028 [P] [US1] Unit test for duplicate detection in tests/unit/email/duplicate-detector.test.ts (same-batch skip, cross-batch timestamp update, audit logging)

### LLM Integration for US1

- [ ] T029 [US1] Implement LLMAdapter interface in main/llm/LLMAdapter.ts (generate(emails: EmailBatch): Promise<LLMOutput>)
- [ ] T030 [P] [US1] Implement RemoteLLM adapter in main/llm/RemoteLLM.ts (TLS 1.3 transmission to third-party LLM API, 30s timeout per FR-057)
- [ ] T031 [US1] Implement OutputValidator in main/llm/OutputValidator.ts (Zod schema validation, 2-retry limit, degradation fallback per R0-5)

### Confidence Calculation for US1

- [ ] T032 [US1] Implement ConfidenceCalculator in main/llm/ConfidenceCalculator.ts (dual-engine: rules 50% + LLM 50%, schema failure adjustment: rules 60% + LLM 20%, cap at 0.6 per FR-010)
- [ ] T033 [P] [US1] Implement RuleExecutor in main/rule-engine/RuleExecutor.ts (QuickJS sandbox, 128MB memory limit, 5s timeout per FR-056)
- [ ] T034 [P] [US1] Unit test for confidence calculation in tests/unit/llm/confidence.test.ts (rule+LLM scoring, schema failure weight adjustment, <0.6 cap validation)
- [ ] T035 [P] [US1] Security test for QuickJS sandbox in tests/integration/security/quickjs-sandbox.test.ts (20+ escape scenarios: os/std/eval/Function blocked, memory isolation, timeout enforcement per R0-2)

### Email Processing Pipeline for US1

- [ ] T036 [US1] Implement EmailProcessor orchestrator in main/email/EmailProcessor.ts (parser → duplicate check → LLM → validation → confidence calc → database storage)
- [ ] T037 [US1] Implement IPC handler for llm:generate in main/ipc/handlers/llmHandler.ts (email batch processing, return items+processed_emails+skip counts per IPC schema)
- [ ] T038 [P] [US1] Unit test for email processing pipeline in tests/unit/email/pipeline.test.ts (end-to-end extraction with mock LLM, degraded item handling per FR-018)

### Renderer UI for US1 (Traceability Display)

- [ ] T039 [P] [US1] Create ReportView component in renderer/src/components/ReportView/ReportView.tsx (display action items with source info: sender, date, subject, Message-ID/fingerprint, file path)
- [ ] T040 [US1] Create TraceabilityInfo component in renderer/src/components/ReportView/TraceabilityInfo.tsx (display search string, Copy Search Keywords button per FR-004)
- [ ] T041 [P] [US1] Create IPC client service in renderer/src/services/ipc.ts (llm:generate, db:query:history invokers)
- [ ] T042 [P] [US1] Create Zustand store for report state in renderer/src/stores/reportStore.ts (items, loading state, error handling)

**Checkpoint**: User Story 1 complete - users can process emails, view action items with 100% traceability, copy search strings, verify sources manually

---

## Phase 4: User Story 2 - Low Confidence Item Warning System (Priority: P1)

**Goal**: Proactively highlight low-confidence items (<0.6) so users focus verification efforts

**Independent Test**: Process emails with ambiguous content, verify items with confidence <0.6 have light yellow background, "[来源待确认]" tag, expanded source info, summary banner at top

### Tests for US2

- [ ] T043 [P] [US2] Unit test for confidence threshold classification in tests/unit/llm/thresholds.test.ts (≥0.8 normal, 0.6-0.79 "[建议复核]", <0.6 "[来源待确认]" per FR-011)
- [ ] T044 [P] [US2] Integration test for confidence display in tests/integration/ui/confidence-display.test.ts (visual indicators, summary banner counts)

### UI Components for US2

- [ ] T045 [P] [US2] Create ConfidenceBadge component in renderer/src/components/ReportView/ConfidenceBadge.tsx (gray "[建议复核]" for 0.6-0.79, prominent "[来源待确认]" for <0.6 per FR-011)
- [ ] T046 [P] [US2] Create ConfidenceSummaryBanner component in renderer/src/components/ReportView/ConfidenceSummaryBanner.tsx ("✅ 高置信度：X条, ⚠️ 需复核：Y条, ❓ 来源待确认：Z条" per FR-012)
- [ ] T047 [US2] Implement conditional styling in ReportView component (light yellow background for <0.6 items, expanded source info display per US2 acceptance scenario 3)

### Backend Logic for US2

- [ ] T048 [US2] Implement confidence classification utility in shared/utils/confidence.ts (getConfidenceLevel(score): 'high' | 'medium' | 'low', getBadgeLabel(level))
- [ ] T049 [P] [US2] Update IPC handler db:query:history in main/ipc/handlers/dbHandler.ts (filterBy source_status, min_confidence per IPC schema)

**Checkpoint**: User Story 2 complete - users see clear visual indicators for low-confidence items, can focus verification efforts

---

## Phase 5: User Story 3 - Local Privacy-Preserving Feedback System (Priority: P1)

**Goal**: Users can mark items as correct/incorrect with local-only encrypted storage, no cloud upload

**Independent Test**: Mark items as correct/incorrect, select error reasons, verify data stored locally (network monitoring confirms zero transmission), encrypted at rest, destroy function works

### Security Tests for US3 (Constitution Principle II: No silent data loss) ⚠️

- [ ] T050 [P] [US3] Security test for feedback local-only storage in tests/integration/security/feedback-network.test.ts (network monitoring, zero transmission verification per FR-024, SC-012)
- [ ] T051 [P] [US3] Integration test for feedback encryption in tests/integration/database/feedback-encryption.test.ts (AES-256-GCM field encryption, tamper detection per FR-023, SC-013)

### Data Layer for US3

- [ ] T052 [P] [US3] Update ActionItem entity in main/database/entities/ActionItem.ts (add feedback_type field, CHECK constraint for 4 error types per FR-022)
- [ ] T053 [US3] Implement FeedbackRepository in main/database/feedback/FeedbackRepository.ts (create, findByDateRange, deleteOlderThan, destroyAll per FR-027, FR-029)

### IPC & Backend for US3

- [ ] T054 [US3] Implement feedback IPC handler in main/ipc/handlers/feedbackHandler.ts (submitFeedback: {item_id, is_correct, error_type?}, getFeedbackStats, destroyFeedback)
- [ ] T055 [P] [US3] Update IPC channels in main/ipc/channels.ts (add feedback:submit, feedback:stats, feedback:destroy to whitelist per constitution)

### UI Components for US3

- [ ] T056 [P] [US3] Create FeedbackButtons component in renderer/src/components/ReportView/FeedbackButtons.tsx (✓ and ✗ buttons, tooltips: "✓ 标记准确", "✗ 标记错误" per FR-019, FR-020)
- [ ] T057 [US3] Create FeedbackDialog component in renderer/src/components/ReportView/FeedbackDialog.tsx (privacy notice: "您的反馈仅存储在本地设备，不会上传" per FR-021, 4 error options per FR-022)
- [ ] T058 [P] [US3] Update Settings page for feedback controls in renderer/src/components/Settings/SettingsFeedback.tsx (stats: "本月修正X处错误" per FR-025, retention selector per FR-026, export/destroy buttons per FR-028, FR-029)
- [ ] T059 [US3] Implement feedback data cleanup task in main/tasks/cleanup.ts (daily deletion of feedback older than retention period, skip if retention=-1 per FR-027)

**Checkpoint**: User Story 3 complete - users can provide feedback, see stats, configure retention, destroy data, verified local-only

---

## Phase 6: User Story 4 - Multi-Format Email Parsing & Indexing (Priority: P2)

**Goal**: Parse .eml, .msg, .pst/.ost, .mbox, .html formats with format-specific Message-ID extraction rates

**Independent Test**: Process sample files in each format, verify items extracted with metadata, Message-ID rates meet targets (.eml ≥95%, .msg ≥85%, .pst ≥90%, .mbox ≥95%, .html ~30%)

### Tests for US4

- [ ] T060 [P] [US4] Integration test for each parser format in tests/integration/email/parsers.test.ts (Message-ID extraction rate validation per FR-008, SC-004)
- [ ] T061 [P] [US4] Unit test for format detection in tests/unit/email/format-detection.test.ts (file extension → parser mapping, fallback chain per R0-1)

### Parser Implementations for US4

- [ ] T062 [P] [US4] Implement MsgParser in main/email/parsers/MsgParser.ts (Outlook .msg format, ≥85% Message-ID extraction, msg-extractor library integration per R0-1)
- [ ] T063 [P] [US4] Implement PstParser in main/email/parsers/PstParser.ts (Outlook .pst/.ost archives, ≥90% Message-ID, individual email extraction, ~200ms overhead per US4 scenario 3, libpff integration per R0-1)
- [ ] T064 [P] [US4] Implement MboxParser in main/email/parsers/MboxParser.ts (Unix mbox format, From_ delimiter logic, file offset recording, ≥95% Message-ID per US4 scenario 4)
- [ ] T065 [P] [US4] Implement HtmlParser in main/email/parsers/HtmlParser.ts (meta tag extraction, ~30% Message-ID, SHA-256 fingerprint fallback, confidence cap 0.6, "[格式受限]" tag per US4 scenario 5)
- [ ] T066 [US4] Implement EmailParserFactory in main/email/parsers/EmailParserFactory.ts (extension-based parser selection, fallback chain per R0-1)

**Checkpoint**: User Story 4 complete - users can process emails in all 6 formats, system handles format limitations gracefully

---

## Phase 7: User Story 5 - Dual-Mode Operation with Hot Switching (Priority: P2)

**Goal**: Users can switch between local (Ollama) and remote (cloud LLM) modes without restart, queue-based switching

**Independent Test**: Initiate mode switch during batch processing, verify current batch completes with old mode, next batch uses new mode, user notified of pending switch

### Security Tests for US5 (Constitution Principle IV: No auto-degradation) ⚠️

- [ ] T067 [P] [US5] Security test for mode switch queue in tests/integration/mode/switch-queue.test.ts (concurrent mode switch requests, last-one-wins per US5 edge case, batch completion boundary per FR-033)
- [ ] T068 [P] [US5] Integration test for network interceptor in tests/integration/security/network-isolation.test.ts (local mode blocks non-local requests, remote mode allows all, session.webRequest API per R0-7)

### Mode Management for US5

- [ ] T069 [US5] Implement ModeSwitchManager in main/mode/ModeSwitchManager.ts (isProcessingBatch flag, pendingMode state, queue logic per R0-6)
- [ ] T070 [P] [US5] Implement LocalLLM adapter in main/llm/LocalLLM.ts (Ollama integration: localhost:11434, block if unavailable per FR-036, no auto-fallback per FR-037)
- [ ] T071 [P] [US5] Implement network interceptor in main/mode/NetworkInterceptor.ts (session.webRequest.onBeforeRequest, block non-localhost in local mode per FR-040, R0-7)

### Update Management for US5

- [ ] T072 [P] [US5] Implement UpdateManager in main/update/UpdateManager.ts (auto-check on startup in remote mode per FR-038, manual check only in local mode per FR-039, GitHub Releases integration)
- [ ] T073 [US5] Implement IPC handler app:check-update in main/ipc/handlers/updateHandler.ts (mode: 'auto' | 'manual', version/release notes/downloadUrl per IPC schema)

### UI Components for US5

- [ ] T074 [P] [US5] Create ModeSelector component in renderer/src/components/Settings/ModeSelector.tsx (remote/local toggle, current mode display, "模式已切换" confirmation per US5 edge case)
- [ ] T075 [P] [US5] Update Settings page for mode switch queue in renderer/src/components/Settings/Settings.tsx (display "当前任务处理完成后将切换模式" per FR-035, update pending mode per US5 edge case)

**Checkpoint**: User Story 5 complete - users can switch modes without restart, local mode isolated, no auto-fallback, update policy respects mode

---

## Phase 8: User Story 6 - Configurable Data Retention with Privacy Controls (Priority: P2)

**Goal**: Users configure email metadata and feedback retention periods (30/90/180/365/永久), immediate cleanup on change

**Independent Test**: Set retention to 90 days, verify daily cleanup deletes old metadata, set to -1 (permanent), verify data preserved, change 90→30, immediate cleanup triggered

### Tests for US6

- [ ] T076 [P] [US6] Integration test for retention cleanup in tests/integration/database/retention.test.ts (daily task execution, -1 permanent retention, immediate cleanup on config change per US6 scenario 5)
- [ ] T077 [P] [US6] Unit test for retention calculation in tests/unit/database/retention.test.ts (30/90/180/365/-1 day mapping, age calculation)

### Data Retention Implementation for US6

- [ ] T078 [US6] Implement RetentionManager in main/database/RetentionManager.ts (daily cleanup task, delete processed_emails older than retention, skip if retention=-1 per FR-041, FR-042, FR-043)
- [ ] T079 [US6] Implement email body cleanup in main/email/EmailProcessor.ts (clear email body immediately after processing, retain metadata only per FR-044)
- [ ] T080 [US6] Implement one-time cleanup in main/database/RetentionManager.ts ("清理30天前数据" button per FR-048, executes regardless of retention setting, confirmation dialog per US6 edge case)

### UI Components for US6

- [ ] T081 [P] [US6] Create RetentionSelector component in renderer/src/components/Settings/RetentionSelector.tsx (30/90/180/365/永久 options, display storage usage per US6 scenario 6)
- [ ] T082 [P] [US6] Update Settings page for retention in renderer/src/components/Settings/SettingsData.tsx (retention period display, storage usage estimate, "永久" indication per US6 scenario 6)

### Config & IPC for US6

- [ ] T083 [US6] Implement config IPC handlers in main/ipc/handlers/configHandler.ts (config:get with keys filter, config:set with updates array, trigger immediate cleanup on retention change per US6 scenario 5, IPC schema)
- [ ] T084 [P] [US6] Update user_config table operations in main/database/ConfigRepository.ts (encrypted config_value, HMAC-SHA256 integrity per architecture, retention period storage)

**Checkpoint**: User Story 6 complete - users control retention periods, automatic cleanup, immediate cleanup on change, permanent option

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

### Report Generation (FR-049, FR-050, FR-051, FR-052)

- [ ] T085 [P] Implement MarkdownExporter in main/export/MarkdownExporter.ts (daily report format, summary banner, footer with traceability notice per FR-049)
- [ ] T086 [P] Implement PDFExporter in main/export/PDFExporter.ts (puppeteer-based PDF generation, same structure as Markdown per FR-051)
- [ ] T087 [P] Create export IPC handler in main/ipc/handlers/exportHandler.ts (db:export channel, format: markdown|pdf, reportDate/dateRange/includeAll per IPC schema, security warning "导出的文件未加密，请妥善保管" per FR-052)
- [ ] T088 [P] Create ExportButton component in renderer/src/components/ReportView/ExportButton.tsx (format selection, security confirmation dialog per FR-052)

### Error Handling & Edge Cases (FR-053, FR-054, FR-055, Edge Cases section)

- [ ] T089 [P] Implement error handler for corrupted emails in main/email/EmailProcessor.ts (skip + log + continue per FR-054, report footer "跳过N封无法解析的邮件" per FR-055)
- [ ] T090 [P] Implement device change detection in main/config/ConfigManager.ts (detect keyring access failure, display "检测到设备环境变更，无法访问历史数据" per Edge Case, FR-047)
- [ ] T091 [P] Implement mode switch notification in renderer/src/components/Settings/ModeSelector.tsx (display "模式切换请求已更新为：[目标模式]" for multiple rapid requests per US5 edge case)
- [ ] T092 [P] Add structured logging for all error types in main/logging/StructuredLogger.ts (error type, module, message, timestamp, context ID per FR-053)

### Performance Optimization (SC-014, SC-015, SC-016, SC-017)

- [ ] T093 [P] Add database indexes for query performance in main/database/migrations/002_performance_indexes.sql (idx_reports_created, idx_items_report_date, idx_items_source_status per plan.md, SC-017 target <100ms for 1000 reports)
- [ ] T094 [P] Implement query batching in main/database/Database.ts (transaction wrapping for bulk inserts, WAL mode per plan.md)

### Documentation & Validation

- [ ] T095 [P] Update CLAUDE.md with feature implementation notes (traceability system, confidence calculation, dual-mode operation, retention management)
- [ ] T096 [P] Create feature documentation in docs/features/email-traceability.md (architecture overview, user scenarios, data flow diagrams)
- [ ] T097 Run quickstart.md validation (all common development tasks work: dev server, tests, linting, typecheck per quickstart.md)

### Additional Security Testing (Constitution Principle V)

- [ ] T098 [P] Security test for SQL injection defense in tests/integration/security/sql-injection.test.ts (all queries parameterized, malicious input handling)
- [ ] T099 [P] Security test for single-instance lock in tests/integration/security/single-instance.test.ts (second-instance detection, window focus, "应用已在运行中" per FR-061)
- [ ] T100 [P] Integration test for LLM degradation in tests/integration/llm/degradation.test.ts (schema validation failure → 2 retries → rule-engine-only, confidence ≤0.6 per FR-010, FR-017)
- [ ] T101 [P] Unit test for mode switch resilience in tests/unit/mode/switch-resilience.test.ts (LLM service dies mid-batch → batch fails, no auto-switch per US5 edge case)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - US1 (Traceability) - P1 priority 🎯 MVP
  - US2 (Confidence Warnings) - P1 priority, can start after US1 core (T021-T038)
  - US3 (Feedback System) - P1 priority, independent after US1
  - US4 (Multi-Format Parsing) - P2 priority, independent after US1
  - US5 (Dual-Mode Operation) - P2 priority, independent after US1
  - US6 (Data Retention) - P2 priority, independent after US1
- **Polish (Phase 9)**: Depends on all relevant user stories being complete

### User Story Dependencies

- **User Story 1 (P1) - Traceability**: BLOCKS US2 (needs ActionItem entity), US3 (needs ActionItem entity), US4 (extends parsers), US5 (extends LLM adapters), US6 (independent data cleanup)
  - **Core dependency for all stories** - provides ActionItem, EmailSource, LLM integration
- **User Story 2 (P1) - Confidence Warnings**: Depends on US1 (T022 ActionItem entity), otherwise independent
- **User Story 3 (P1) - Feedback**: Depends on US1 (T022 ActionItem entity), otherwise independent
- **User Story 4 (P2) - Multi-Format**: Depends on US1 (T024 EmailParser interface), extends parser implementations
- **User Story 5 (P2) - Dual-Mode**: Depends on US1 (T029 LLMAdapter interface), adds LocalLLM, mode management
- **User Story 6 (P2) - Data Retention**: Independent after Foundational (T008 Database class), operates on existing data

### Within Each User Story

- Security tests MUST pass before implementation (Constitution Principle V)
- Models/entities before services/repositories
- Services before IPC handlers
- IPC handlers before UI components
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- **Setup phase**: T002, T003, T004, T005, T006, T007 can all run in parallel (6 parallel tasks)
- **Foundational phase**: T009, T010, T011, T013, T014, T015 can run in parallel (6 parallel tasks after T008)
- **US1 security tests**: T018, T019, T020 can run in parallel (3 parallel tests)
- **US1 data layer**: T021, T022, T023 can run in parallel (3 parallel entities)
- **US1 LLM integration**: T030, T034, T035 can run in parallel (after T029)
- **US2 UI**: T045, T046 can run in parallel (2 parallel components)
- **US3 tests**: T050, T051 can run in parallel (2 parallel tests)
- **US3 UI**: T056, T058 can run in parallel (2 parallel components)
- **US4 parsers**: T062, T063, T064, T065 can run in parallel (4 parallel parsers)
- **US5 components**: T070, T071, T072, T074, T075 can run in parallel (5 parallel tasks)
- **US6 UI**: T081, T082 can run in parallel (2 parallel components)
- **Polish phase**: T085, T086, T089, T090, T091 can run in parallel (5 parallel tasks)

**Maximum parallelism**: After Foundational phase, can run all 6 user stories in parallel by different developers (US2-US6 depend on US1 core, but can proceed in parallel once US1 entities are ready)

---

## Parallel Example: User Story 4 (Multi-Format Parsing)

```bash
# Launch all 4 format parsers in parallel (after EmailParser interface T024 exists):
Task: "Implement MsgParser in main/email/parsers/MsgParser.ts"
Task: "Implement PstParser in main/email/parsers/PstParser.ts"
Task: "Implement MboxParser in main/email/parsers/MboxParser.ts"
Task: "Implement HtmlParser in main/email/parsers/HtmlParser.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only) - ~3-4 weeks

1. Complete Phase 1: Setup (T001-T007)
2. Complete Phase 2: Foundational (T008-T017) - **CRITICAL GATE**
3. Complete Phase 3: User Story 1 (T018-T042)
4. **STOP and VALIDATE**: Process 50 emails, verify 100% traceability
5. Deploy/demo MVP

### Incremental P1 Delivery (User Stories 1-3) - ~5-6 weeks

1. Complete Setup + Foundational → Foundation ready
2. Add US1 (Traceability) → Test independently → MVP complete
3. Add US2 (Confidence Warnings) → Test independently → P1 feature complete
4. Add US3 (Feedback System) → Test independently → All P1 stories complete
5. Each story adds value without breaking previous stories

### Full Feature Delivery (User Stories 1-6) - ~8-10 weeks

1. Complete P1 stories (US1-US3) → Core product ready
2. Add US4 (Multi-Format) → Enterprise users supported
3. Add US5 (Dual-Mode) → Privacy-conscious users served
4. Add US6 (Data Retention) → Full user control
5. Complete Polish phase → Production-ready

### Parallel Team Strategy

With 3 developers after Foundational phase:

1. **Developer A**: US1 (Traceability core) - T018-T042
2. **Developer B**: US2 (Confidence) + US3 (Feedback) - T043-T059 (waits for US1 entities T021-T023)
3. **Developer C**: US4 (Multi-Format) + US5 (Dual-Mode) + US6 (Retention) - T060-T084 (waits for US1 LLM adapter T029)

**Timeline**: Foundational (1 week) → Parallel development (4-5 weeks) → Polish (1 week) = **6-7 weeks total**

---

## Notes

- **Task granularity**: Each task modifies 1-2 files, completable in <30 minutes
- **[P] marker**: Parallelizable (different files, no dependencies on incomplete tasks)
- **[Story] label**: Maps task to specific user story (US1-US6)
- **Security modules**: 100% test coverage required (Constitution Principle V)
- **Test pyramid**: 60% unit tests, 40% integration tests, no E2E tests
- **Each user story**: Independently completable and testable
- **Checkpoint validation**: Stop after each story to verify independent functionality
- **Constitution compliance**: All 7 principles satisfied (verified in plan.md)
- **Data loss prevention**: Degradation instead of silent drops (Principle II)
- **Privacy-first**: Local-only storage, device-bound keys, no cloud backup (Principle I)
- **Mode isolation**: Network-layer blocking in local mode, no auto-fallback (Principle IV)

**Total Tasks**: 101 tasks across 9 phases
**Estimated Effort**:
- Setup (7 tasks) + Foundational (10 tasks) = 17 tasks ~1 week
- P1 stories (US1-US3) = 42 tasks ~3-4 weeks
- P2 stories (US4-US6) = 27 tasks ~2-3 weeks
- Polish = 15 tasks ~1 week
- **Total**: ~6-8 weeks for full feature delivery

---

## Version History

### v1.1.0 (2026-01-31)
**Change Type**: chore - 依赖版本更新
**Plan Version**: 1.1.0

**依赖版本变更**:
- Electron: 28.2.0 → 29.4.6
- Zustand: 4.4 → 4.5
- better-sqlite3: 9.4 → 11.10.0

**影响**:
- ✅ T001 已更新依赖版本
- ✅ T001-T017 保持完成状态
- ✅ 所有待办任务保持不变
- ✅ 无破坏性 API 变更
- ✅ 代码无需修改

**兼容性**:
- Foundation Phase 基础设施完全兼容
- 所有任务接口保持不变
- 数据库 Schema 保持不变

**迁移**:
- 无需任务列表调整
- 无需修改已完成代码
- 仅需更新 package.json 并运行 npm install

### v1.0.0 (Initial)
**Initial task list generation from plan.md v1.0.0**
- All 101 tasks defined across 9 phases
- Foundation Phase (T001-T017) completed
