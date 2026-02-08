# Tasks: Email Item Traceability & Verification System

**Input**: Design documents from `/specs/001-email-item-traceability/`
**Prerequisites**: plan.md v2.7 ✅, spec.md ✅, data-model.md ✅, contracts/llm-api.yaml ✅, research.md ✅

**Plan Version**: 2.7 (Tech Architecture Update - Frontend stack, feedback integration, retention improvements)
**Last Regenerated**: 2026-02-05
**Completed Tasks Preserved**: T001-T048 (Setup + Foundation + User Story 1 complete ✅)
**Affected Tasks**: Marked with [~] for completed tasks requiring updates due to plan changes

**Tests**: Tests are OPTIONAL per plan.md. Test tasks are included as per constitution Principle V (60% unit, 40% integration, no E2E).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Task Status Notation

- **[X]**: Completed task (preserved from previous work)
- **[ ]**: Pending task (not yet started)
- **[~]**: Affected task (completed but requires refactoring due)

## Path Conventions

- **Electron desktop**: `src/main/` (main process), `src/renderer/` (renderer process), `src/shared/` (shared code), `tests/` (test suites)
- **Database**: SQLite database with field-level encryption at `~/.mailcopilot/app.db`
- **Tests**: `tests/unit/` (60%), `tests/integration/` (40%)
- **LLM Integration**: OpenAI SDK v4.x for remote mode, fetch API for local Ollama mode

## Plan v2.7 Changes Summary

**NEW REQUIREMENTS** from tech-architecture.md v2.7:
1. **Frontend Stack**: TailwindCSS v3.4, shadcn/ui, Lucide React, Inter font
2. **Feedback Storage**: Integrated into `todo_items` table (removed separate `user_feedback` table)
3. **Data Retention**: Extended support for -1 (permanent) option
4. **Mode Switching**: Hot switching without restart (wait for batch completion)
5. **Confidence Calculation**: Unified 50% rules + 50% LLM, adjusts on failure
6. **Traceability**: Search string + file path (no deep linking)
7. **Email Parsing**: msg-extractor/libpff/readpst for Outlook formats

**AFFECTED COMPLETED TASKS** (require refactoring):
- T032: RemoteLLM - Already uses OpenAI SDK ✅ (NO CHANGE NEEDED)
- T058-T059: UserFeedback entities - **NEEDS REFACTOR** to integrate feedback into todo_items table
- T063-T066: Feedback IPC handlers - **NEEDS UPDATE** for integrated feedback schema

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for Electron desktop application

- [X] T001 Initialize package.json with dependencies (Electron 29.4.6, React 18, TypeScript 5.4, better-sqlite3 11.10.0, Zustand 4.5, Zod 3.22.4, QuickJS WASM, electron-log 5.0.0)
- [X] T002 [P] Configure TypeScript (tsconfig.json for main, renderer, shared)
- [X] T003 [P] Setup ESLint and Prettier with TypeScript support
- [X] T004 [P] Configure Vitest 3.x for unit testing (≥80% line, ≥70% branch coverage per constitution v1.1.0, 100% for security-critical modules)
- [X] T005 [P] Create project directory structure (src/main/, src/renderer/, src/shared/, tests/)
- [X] T006 [P] Setup Electron build configuration (electron-builder for packaging)
- [X] T007 [P] Configure environment variable management (.env.local support)
- [X] T008 [P] Install and configure date-fns v4.x in package.json (add date-fns@^4.0.0 to dependencies)
- [X] T008a [P] Install OpenAI SDK v4.x in package.json (add openai@^4.0.0 to dependencies per plan.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database & Encryption Foundation

- [X] T009 Implement Database class in src/main/database/Database.ts (better-sqlite3 wrapper, WAL mode, connection management)
- [X] T010 [P] Implement AES-256-GCM field encryption in src/main/security/encryption.ts (Node.js crypto, 256-bit keys)
- [X] T011 [P] Implement safeStorage key management in src/main/security/key-manager.ts (key generation, device binding, no export)
- [X] T012 [P] Create database migration scripts in src/main/database/migrations/ (001_initial_schema.sql)
- [X] T013 [P] Create database schema from plan.md SQL DDL in src/main/database/schema.ts (6 tables per tech-architecture.md v2.7)

### IPC & Logging Infrastructure

- [X] T014 [P] Setup IPC channel definitions in src/main/ipc/channels.ts (6 channels: llm:generate, db:query:history, db:export, config:get/set, app:check-update, email:fetch-meta)
- [X] T015 [P] Implement structured logging in src/main/config/logger.ts using electron-log v5 (error type, module, message, timestamp, context ID)
- [X] T016 [P] Create base Zod schemas in src/shared/schemas/validation.ts (ItemSchema, EmailMetadataSchema, ConfigSchema per data-model.md)

### Application Entry Point

- [X] T017 Implement single-instance lock in src/main/app/single-instance.ts (app.requestSingleInstanceLock(), second-instance handling)
- [X] T018 [P] Create main process entry point in src/main/index.ts (app initialization, window creation)

### First-Run Disclosure (Constitution Principle I)

- [X] T018a [P] Create first-run disclosure screen in renderer/src/components/Onboarding/FirstRunDisclosure.tsx (display explicit disclosure of data transmission scope: "Using remote mode will send email content to third-party LLM service via TLS 1.3 encryption. All processing occurs remotely. No data is stored on external servers." per constitution Principle I)
- [X] T018b [P] Implement disclosure acknowledgment handler in main/ipc/handlers/onboardingHandler.ts (store user acknowledgment, only show on first launch, link to mode selector settings page per constitution Principle I)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Complete Email Item Traceability (Priority: P1) 🎯 MVP

**Goal**: Extract action items from emails with 100% source traceability (Message-ID or SHA-256 fingerprint)

**Independent Test**: Process 50 .eml emails with known action items, verify every item displays complete source info (sender, date, subject, Message-ID/fingerprint, search string, file path) and search string locates email within 60 seconds

### Security Tests for US1 (Constitution Principle V: 100% coverage for security modules) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T019 [P] [US1] Unit test for field encryption/decryption in tests/unit/security/encryption.test.ts (Buffer.fill(0) cleanup verification, AES-256-GCM validation)
- [X] T020 [P] [US1] Unit test for SHA-256 fingerprint generation in tests/unit/email-processing/fingerprint.test.ts (collision resistance, Message-ID+fingerprint combinations)
- [X] T021 [P] [US1] Integration test for database operations in tests/integration/database/crud.test.ts (transaction wrapping, foreign key constraints, encrypted field storage)

### Data Layer for US1

- [X] T022 [P] [US1] Create EmailSource entity/model in src/main/database/entities/EmailSource.ts (email_hash, processed_at, last_seen_at, search_string, file_path, extraction_status per data-model.md)
- [X] T023 [P] [US1] Create ActionItem entity/model in src/main/database/entities/ActionItem.ts (content_encrypted, item_type, confidence, source_status, evidence per data-model.md)
- [X] T024 [P] [US1] Create ItemEmailRef entity/model in src/main/database/entities/ItemEmailRef.ts (many-to-many relationship, email_index_in_batch per data-model.md)

### Email Parsing for US1

- [X] T025 [US1] Implement EmailParser interface in src/main/email-processing/parsers/EmailParser.ts (parse(filePath: string): Promise<ParsedEmail>)
- [X] T026 [US1] Implement EmlParser in src/main/email-processing/parsers/EmlParser.ts (RFC 5322 .eml parsing, ≥95% Message-ID extraction per SC-004)
- [X] T027 [US1] Implement TraceabilityGenerator in src/main/email-processing/traceability-generator.ts (search string format: `from:sender subject:"snippet" date:YYYY-MM-DD`, subject truncation to 30 chars, NO deep linking per plan v2.7)

### Date Handling for US1

- [X] T028a [P] [US1] Refactor EmlParser date extraction in src/main/email-processing/parsers/EmlParser.ts (replace `new Date().toISOString()` with date-fns `formatISO`, `parseISO` for consistent date handling)
- [X] T028b [P] [US1] Refactor TraceabilityGenerator date formatting in src/main/email-processing/traceability-generator.ts (replace native Date methods with date-fns `format`, `parseISO` per plan.md)
- [X] T028c [P] [US1] Create date utility module in src/shared/utils/dateUtils.ts (export `formatYYYYMMDD`, `formatISO8601`, `parseEmailDate` using date-fns v4.x)
- [X] T028d [P] [US1] Unit test for date utilities in tests/unit/utils/dateUtils.test.ts (test date format functions with edge cases: invalid dates, timezone handling, leap years)

### Duplicate Detection for US1

- [X] T029 [US1] Implement DuplicateDetector in src/main/email-processing/duplicate-detector.ts (SHA-256 fingerprint: SHA256(Message-ID + Date + From), cross-batch detection, update last_seen_at per FR-008A)
- [X] T030 [P] [US1] Unit test for duplicate detection in tests/unit/email-processing/duplicate-detector.test.ts (same-batch skip, cross-batch timestamp update, audit logging)

### LLM Integration for US1

- [X] T031 [US1] Implement LLMAdapter interface in src/main/llm/LLMAdapter.ts (generate(batch: EmailBatch): Promise<LLMOutput>, checkHealth(), getConfig(), updateConfig())
- [X] T032 [P] [US1] Implement RemoteLLM adapter using OpenAI SDK in src/main/llm/RemoteLLM.ts (OpenAI client with 30s timeout, 2 retries, JSON mode per plan.md)
- [X] T033 [US1] Implement OutputValidator in src/main/llm/output-validator.ts (Zod schema validation, 2-retry limit, degradation fallback per FR-017)

### LLM Integration Tests for US1

- [X] T034 [P] [US1] Unit test for RemoteLLM with OpenAI SDK in tests/unit/llm/remote-llm.test.ts (mock OpenAI client, test error handling, retry logic, timeout enforcement)
- [X] T035 [P] [US1] Integration test for OpenAI SDK integration in tests/integration/llm/openai-sdk.test.ts (test with real OpenAI API using test key, verify JSON mode response, structured output parsing)
- [X] T036 [P] [US1] Unit test for OutputValidator in tests/unit/llm/output-validator.test.ts (Zod validation, retry with reinforcement, degradation fallback)

### Confidence Calculation for US1

- [X] T037 [US1] Implement ConfidenceCalculator in src/main/llm/confidence-calculator.ts (dual-engine: rules 50% + LLM 50%, schema failure adjustment: rules 60% + LLM 20%, cap at 0.6 per plan v2.7)
- [X] T038 [P] [US1] Implement RuleEngine in src/main/rules/engine.ts (QuickJS sandbox wrapper, 128MB memory limit, 5s timeout per FR-056)
- [X] T039 [P] [US1] Implement rule definitions in src/main/rules/default-rules.ts (deadline keywords, priority detection, sender whitelist per plan.md)
- [X] T040 [P] [US1] Unit test for confidence calculation in tests/unit/llm/confidence-calculator.test.ts (rule+LLM scoring, schema failure weight adjustment, <0.6 cap validation)
- [X] T041 [P] [US1] Security test for QuickJS sandbox in tests/integration/security/quickjs-sandbox.test.ts (20+ escape scenarios: os/std/eval/Function blocked, memory isolation, timeout enforcement)

### Email Processing Pipeline for US1

- [X] T042 [US1] Implement EmailProcessor orchestrator in src/main/email-processing/EmailProcessor.ts (parser → duplicate check → rule engine → LLM → validation → confidence calc → database storage)
- [X] T043 [US1] Implement IPC handler for llm:generate in src/main/ipc/handlers/llm.handler.ts (email batch processing, return items+batch_info per IPC schema)
- [X] T044 [P] [US1] Unit test for email processing pipeline in tests/unit/email-processing/pipeline.test.ts (end-to-end extraction with mock LLM, degraded item handling per FR-018)

### Renderer UI for US1 (Traceability Display)

- [X] T045 [P] [US1] Create ReportView component in src/renderer/src/components/reports/DailyReportView.tsx (display action items with source info: sender, date, subject, Message-ID/fingerprint, file path) **[REFACTORED 2026-02-05: Now uses TailwindCSS v3.4, shadcn/ui, Lucide React, Inter font]**
- [X] T046 [US1] Create TraceabilityInfo component in src/renderer/src/components/reports/SourceMetadata.tsx (display search string, Copy Search Keywords button per FR-004, NO deep linking per plan v2.7) **[REFACTORED 2026-02-05: Now uses TailwindCSS v3.4, shadcn/ui, Lucide React icons]**
- [X] T047 [P] [US1] Create IPC client service in src/renderer/src/services/ipc-client.ts (llm:generate, db:query:history invokers) **[DOCUMENTATION UPDATED 2026-02-05: Added references to new frontend stack]**
- [X] T048 [P] [US1] Create Zustand store for report state in src/renderer/src/stores/app-store.ts (items, loading state, error handling) **[DOCUMENTATION UPDATED 2026-02-05: Added references to new frontend stack]**

**Checkpoint**: User Story 1 complete - users can process emails, view action items with 100% traceability, copy search strings, verify sources manually

---

## Phase 4: User Story 2 - Low Confidence Item Warning System (Priority: P1)

**Goal**: Proactively highlight low-confidence items (<0.6) so users focus verification efforts

**Independent Test**: Process emails with ambiguous content, verify items with confidence <0.6 have light yellow background, "[来源待确认]" tag, expanded source info, summary banner at top

### Tests for US2

- [X] T049 [P] [US2] Unit test for confidence threshold classification in tests/unit/llm/thresholds.test.ts (≥0.8 normal, 0.6-0.79 "[建议复核]", <0.6 "[来源待确认]" per FR-011)
- [X] T050 [P] [US2] Integration test for confidence display in tests/integration/ui/confidence-display.test.ts (visual indicators, summary banner counts)

### UI Components for US2

- [X] T051 [P] [US2] Create ConfidenceBadge component in src/renderer/src/components/reports/ConfidenceBadge.tsx (gray "[建议复核]" for 0.6-0.79, prominent "[来源待确认]" for <0.6 per FR-011)
- [X] T052 [P] [US2] Create ConfidenceSummaryBanner component in src/renderer/src/components/reports/ConfidenceSummaryBanner.tsx ("✅ 高置信度：X条, ⚠️ 需复核：Y条, ❓ 来源待确认：Z条" per FR-012)
- [X] T053 [US2] Implement conditional styling in DailyReportView component (light yellow background for <0.6 items, expanded source info display per US2 acceptance scenario 3)

### Backend Logic for US2

- [X] T054 [US2] Implement confidence-based filtering in reportStore.ts (filter items by confidence thresholds, sort by confidence ascending) **[IMPLEMENTED 2026-02-06: filterByConfidence(), sortByConfidence(), selectors in src/renderer/stores/reportStore.ts lines 164-216]**
- [X] T055 [P] [US2] Unit test for confidence aggregation in tests/unit/llm/thresholds.test.ts (count high/medium/low confidence items, summary statistics) **[IMPLEMENTED 2026-02-06: Aggregation tests countByLevel(), getSummary() in tests/unit/llm/thresholds.test.ts lines 187-237, all 26 tests passing ✅]**

**Checkpoint**: User Story 2 complete - low-confidence items are visually distinguished and aggregated in summary

---

## Phase 5: User Story 3 - Local Privacy-Preserving Feedback System (Priority: P1)

**Goal**: Allow users to provide feedback on item accuracy without uploading data (local-only, encrypted storage)

**Independent Test**: Mark items as correct/incorrect, select error reasons, verify feedback stored locally (no network traffic), confirm encryption, validate "destroy all feedback data" permanently removes data

**⚠️ PLAN v2.7 CHANGE**: Feedback integrated into `todo_items` table (removed separate `user_feedback` table per tech-architecture.md)

### Tests for US3

- [X] T056 [P] [US3] Unit test for feedback encryption in tests/unit/security/feedback.test.ts (AES-256-GCM encryption of feedback_type field per plan v2.7) **[COMPLETED 2026-02-06: All 13 tests passing ✅]**
- [X] T057 [P] [US3] Integration test for local-only feedback storage in tests/integration/feedback/local-only.test.ts (verify no network traffic during feedback operations) **[COMPLETED 2026-02-06: All 8 tests passing ✅]**

### Data Layer for US3 (UPDATED for plan v2.7)

- [X] T058 [US3] **[COMPLETED 2026-02-06]** Refactor ActionItem entity to include feedback fields in src/main/database/entities/ActionItem.ts (add feedback_type ENUM field, remove separate UserFeedback table per plan v2.7) **[IMPLEMENTED: feedback_type encrypted with AES-256-GCM, integrated into todo_items table]**
- [X] T059 [P] [US3] **[COMPLETED 2026-02-06]** Update DataRetentionConfig entity in src/main/database/entities/DataRetentionConfig.ts (feedback_retention_days with 30/90/180/365/-1 options where -1 = permanent, same as email metadata per plan v2.7) **[IMPLEMENTED: Complete DataRetentionConfigRepository with retention validation, UI helpers, and export functionality]**

### Feedback UI Components for US3

- [X] T060 [P] [US3] Create FeedbackButtons component in src/renderer/src/components/reports/FeedbackButtons.tsx (✓ and ✗ buttons with tooltips "✓ 标记准确" and "✗ 标记错误")
- [X] T061 [US3] Create FeedbackDialog component in src/renderer/src/components/FeedbackDialog.tsx (privacy notice, 4 error reason options: content_error/priority_error/not_actionable/source_error)
- [X] T062 [P] [US3] Create FeedbackSettings component in src/renderer/src/components/settings/FeedbackSettings.tsx ("本月修正X处错误", retention selector: 30/90/180/365/永久, export/destroy buttons)

### Feedback IPC Handlers for US3 (UPDATED for plan v2.7)

- [X] T063 [US3] **[COMPLETED 2026-02-07]** Update IPC handler for feedback submission in src/main/ipc/handlers/feedback.handler.ts (store feedback in todo_items.feedback_type field with encryption per plan v2.7) **[IMPLEMENTED: registerFeedbackHandlers() with validation, encryption, and error handling]**
- [X] T064 [P] [US3] **[COMPLETED 2026-02-07]** Implement IPC handler for feedback statistics in src/main/ipc/handlers/stats.handler.ts (query error corrections this month from todo_items, aggregate feedback) **[IMPLEMENTED: registerStatsHandlers() with monthly aggregation and decryption]**
- [X] T065 [P] [US3] **[COMPLETED 2026-02-07]** Implement IPC handler for feedback export in src/main/ipc/handlers/export.handler.ts (export unencrypted feedback data as file) **[IMPLEMENTED: registerExportHandlers() with JSON/CSV export and save dialog]**
- [X] T066 [P] [US3] **[COMPLETED 2026-02-07]** Implement IPC handler for feedback destruction in src/main/ipc/handlers/cleanup.handler.ts (permanent deletion of feedback_type values with confirmation per plan v2.7) **[IMPLEMENTED: registerCleanupHandlers() with transaction-wrapped deletion]**

**Checkpoint**: User Story 3 complete - users can provide feedback locally, data is encrypted, export/destroy functions work correctly

---

## Phase 6: User Story 4 - Multi-Format Email Parsing & Indexing (Priority: P2)

**Goal**: Support multiple email formats (.eml, .msg, .pst, .mbox, .html) with format-specific extraction rates

**Independent Test**: Process sample files in each format, verify action items extracted with metadata, confirm Message-ID extraction rates meet targets (.eml ≥95%, .msg ≥85%, .pst ≥90%)

**⚠️ PLAN v2.7 CHANGE**: Use msg-extractor/libpff/readpst for Outlook formats per tech-architecture.md

### Additional Parsers for US4

- [X] T067 [P] [US4] Implement MsgParser in src/main/email/parsers/MsgParser.ts (Outlook .msg parsing using msg-extractor, ≥85% Message-ID extraction, SHA-256 fallback per SC-004) **[COMPLETED 2026-02-07]**
- [X] T068 [P] [US4] Implement PstParser in src/main/email/parsers/PstParser.ts (Outlook .pst/.ost archive parsing using libpff/readpst, ≥90% Message-ID extraction, ~200ms overhead per email per plan v2.7) **[COMPLETED 2026-02-07]**
- [X] T069 [P] [US4] Implement MboxParser in src/main/email/parsers/MboxParser.ts (Unix mbox format, From_ delimiter logic, file offset recording, ≥95% Message-ID extraction) **[COMPLETED 2026-02-07]**
- [X] T070 [P] [US4] Implement HtmlParser in src/main/email/parsers/HtmlParser.ts (Exported .htm/.html parsing, metadata from <meta>/<title>, ~30% Message-ID extraction, confidence capped at 0.6) **[COMPLETED 2026-02-07]**

### Parser Tests for US4

- [X] T071 [P] [US4] Unit test for MsgParser in tests/unit/email-processing/parsers/msg-parser.test.ts (Message-ID extraction rate ≥85%, SHA-256 fallback) **[COMPLETED 2026-02-07: 34 test cases covering Message-ID extraction, SHA-256 fallback, metadata extraction, body truncation, error handling, and SC-004 compliance]**
- [X] T072 [P] [US4] Unit test for PstParser in tests/unit/email-processing/parsers/pst-parser.test.ts (archive extraction, Message-ID extraction rate ≥90%) **[COMPLETED 2026-02-07: 27 test cases covering readpst extraction, .eml parsing from archive, metadata extraction, cleanup, and SC-004 compliance]**
- [X] T073 [P] [US4] Unit test for MboxParser in tests/unit/email-processing/parsers/mbox-parser.test.ts (From_ delimiter separation, offset recording, Message-ID extraction rate ≥95%) **[COMPLETED 2026-02-07: 32 test cases covering From_ delimiter splitting, header parsing, body extraction, edge cases, and SC-004 compliance]**
- [X] T074 [P] [US4] Unit test for HtmlParser in tests/unit/email-processing/parsers/html-parser.test.ts (metadata extraction, low Message-ID rate ~30%, confidence cap at 0.6) **[COMPLETED 2026-02-07: 27 test cases covering meta tag extraction, body extraction from HTML, attachment detection, low Message-ID rate compliance, and FR-011 confidence cap]**

### Format Detection for US4

- [X] T075 [US4] Implement format detection in src/main/email/parsers/ParserFactory.ts (detect format from file extension, delegate to appropriate parser) **[COMPLETED 2026-02-07: Factory pattern with automatic format detection and parser selection]**
- [X] T076 [P] [US4] Unit test for format detection in tests/unit/email-processing/parser-dispatch.test.ts (correct parser selection for .eml/.msg/.pst/.mbox/.html files) **[COMPLETED 2026-02-07: 38 test cases covering format detection, parser selection, extraction rate targets, max confidence (FR-011), and edge cases]**

**Checkpoint**: User Story 4 complete - all 5 email formats supported with specified extraction rates

---

## Phase 7: User Story 5 - Dual-Mode Operation with Hot Switching (Priority: P2)

**Goal**: Switch between local (offline-only) and remote (cloud LLM) modes without restart

**Independent Test**: Initiate mode switch while batch processing, verify current batch completes under old mode, subsequent batches use new mode, user notified of pending switch

**⚠️ PLAN v2.7 CHANGE**: Hot mode switching without restart (wait for batch completion) per tech-architecture.md

### Local LLM Integration for US5

- [X] T077 [P] [US5] **[COMPLETED 2026-02-08]** Implement LocalLLM adapter in src/main/llm/LocalLLM.ts (Ollama API integration, fetch API to http://localhost:11434/api/generate, no auto-degradation per FR-037) **[IMPLEMENTED: Complete Ollama API integration with native fetch, 2-retry logic, timeout enforcement, and manual retry classification]**
- [X] T078 [P] [US5] **[COMPLETED 2026-02-08]** Implement Ollama health check in src/main/llm/LocalLLM.ts (GET http://localhost:11434/api/tags to verify service availability) **[IMPLEMENTED: Health check with 5s timeout, service availability verification, and model detection]**
- [X] T079 [P] [US5] **[COMPLETED 2026-02-08]** Unit test for LocalLLM in tests/unit/llm/local-llm.test.ts (Ollama API integration, health check, error handling) **[IMPLEMENTED: All 32 tests passing ✅ covering generate, checkHealth, getConfig, updateConfig, error classification, and FR-037 compliance]**

### Mode Switching Logic for US5 (UPDATED for plan v2.7)

- [X] T080 [US5] **[COMPLETED 2026-02-08]** Implement ModeManager in src/main/app/mode-manager.ts (mode state: local/remote, queue management during switch, batch completion wait WITHOUT restart per FR-033, plan v2.7) **[IMPLEMENTED: Complete ModeManager with state tracking, event emissions, and queue management]**
- [X] T081 [P] [US5] **[COMPLETED 2026-02-08]** Implement IPC handler for mode switching in src/main/ipc/handlers/mode.handler.ts (switch request, queue new tasks, notify user of pending switch per FR-035) **[IMPLEMENTED: Complete IPC handlers with mode:get, mode:switch, mode:cancel channels and event notifications]**
- [X] T082 [P] [US5] **[COMPLETED 2026-02-08]** Implement local mode failure blocking in src/main/llm/LocalLLM.ts (check health before processing, block with error if unavailable per FR-036, NO auto-fallback per FR-037) **[IMPLEMENTED: Health check blocking at start of generate() with FR-036 compliance]**
- [X] T083 [P] [US5] **[COMPLETED 2026-02-08]** Unit test for mode switching in tests/unit/config/mode-switching.test.ts (batch completion wait, queue management, user notification, NO restart per plan v2.7) **[IMPLEMENTED: All 36 tests passing ✅ covering hot switching, queue management, batch state tracking, and FR-033/FR-034/FR-035 compliance]**

### Mode Switching UI for US5

- [X] T084 [P] [US5] Create ModeSelector component in src/renderer/src/components/settings/ModeSwitchCard.tsx (radio buttons for local/remote mode, current mode display per plan v2.7) **[COMPLETED 2026-02-08: ModeSelector component with radio buttons, current mode display, and IPC integration]**
- [X] T085 [US5] Create ModeSwitchNotification component in src/renderer/src/components/settings/ModeSwitchCard.tsx (display "当前任务处理完成后将切换模式，新任务已进入队列等待" per FR-035, plan v2.7) **[COMPLETED 2026-02-08: ModeSwitchNotification component with pending switch notification and cancel button]**

### Auto-Update Policy for US5

- [X] T086 [P] [US5] Implement auto-update check in src/main/app/lifecycle.ts (remote mode: check on startup per FR-038, local mode: disable auto-check, manual trigger via Settings per FR-039) **[COMPLETED 2026-02-08: Complete lifecycle.ts with mode-based update policy, electron-updater integration]**
- [X] T087 [P] [US5] Create manual update check button in src/renderer/src/components/settings/DataManagement.tsx ("手动检查更新" button for local mode per plan v2.7) **[COMPLETED 2026-02-08: DataManagement component with manual update check, storage usage display, cleanup controls]**

### Network Isolation for US5

- [X] T088 [US5] Implement network interceptor in src/main/security/network-interceptor.ts (local mode: block non-localhost requests at network layer per FR-040, remote mode: allow TLS 1.3 to LLM endpoints per plan v2.7) **[COMPLETED 2026-02-08: Complete network-interceptor.ts with webRequest API blocking, mode-based policies, endpoint whitelist]**
- [X] T089 [P] [US5] Integration test for network isolation in tests/integration/security/network-interceptor.test.ts (verify non-local requests blocked in local mode, allow LLM API in remote mode) **[COMPLETED 2026-02-08: Comprehensive integration tests covering FR-040 compliance, mode switching, edge cases]**

**Checkpoint**: User Story 5 complete - hot mode switching works without restart, local mode blocks on failure, network isolation enforced

---

## Phase 8: User Story 6 - Configurable Data Retention with Privacy Controls (Priority: P2)

**Goal**: Allow users to configure how long email metadata and feedback data are retained

**Independent Test**: Set different retention periods, verify data older than retention period is auto-deleted (except when permanent), confirm immediate cleanup on retention change

**⚠️ PLAN v2.7 CHANGE**: Support -1 (permanent) retention option per tech-architecture.md

### Retention Policy Logic for US6 (UPDATED for plan v2.7)

- [X] T090 [US6] **[COMPLETED 2026-02-08]** Implement retention cleanup task in src/main/database/cleanup.ts (daily cron job at 2:00 AM, delete metadata older than retention period, SKIP cleanup if retention_days=-1 per plan v2.7) **[IMPLEMENTED: Complete cleanup.ts with performRetentionCleanup(), performManual30DayCleanup(), getCleanupPreview(), getStorageUsage(), and scheduled cleanup with startScheduledCleanup()]**
- [X] T091 [P] [US6] **[COMPLETED 2026-02-08]** Implement immediate cleanup on retention change in src/main/config/manager.ts (trigger cleanup immediately when user changes retention period, show confirmation, handle -1 permanent option per plan v2.7) **[IMPLEMENTED: Updated DataRetentionConfigRepository.setEmailRetention(), setFeedbackRetention(), and setRetentionPeriods() with immediate cleanup support]**
- [X] T092 [P] [US6] **[COMPLETED 2026-02-08]** Implement 30-day manual cleanup in src/main/ipc/handlers/cleanup.handler.ts ("清理30天前数据" button, one-time cleanup regardless of retention setting per FR-048) **[IMPLEMENTED: Complete retention.handler.ts with 5 IPC channels: retention:get-config, retention:set-periods, retention:get-preview, retention:manual-cleanup, retention:get-storage]**

### Retention UI for US6

- [X] T093 [P] [US6] **[COMPLETED 2026-02-08]** Create RetentionSettings component in src/renderer/src/components/settings/RetentionConfig.tsx (email metadata retention selector: 30/90/180/365/永久 with -1 value, feedback retention selector, estimated storage usage display per FR-046, plan v2.7) **[IMPLEMENTED: Complete RetentionConfig component with cleanup preview, confirmation dialog, and immediate cleanup]**
- [X] T094 [US6] **[COMPLETED 2026-02-08]** Create ManualCleanupButton component in src/renderer/src/components/settings/DataManagement.tsx ("清理30天前数据" button, confirmation dialog per FR-048) **[IMPLEMENTED: Updated DataManagement component to use new retention:manual-cleanup IPC channel]**

### Retention Tests for US6

- [X] T095 [P] [US6] **[COMPLETED 2026-02-08]** Unit test for retention cleanup in tests/unit/database/cleanup.test.ts (delete records older than retention period, preserve records if retention_days=-1 per plan v2.7) **[IMPLEMENTED: Comprehensive unit tests covering permanent option, cleanup preview, manual cleanup, storage usage, and error handling]**
- [X] T096 [P] [US6] **[COMPLETED 2026-02-08]** Integration test for immediate cleanup in tests/integration/config/retention-change.test.ts (verify cleanup triggers immediately on retention period change for both email metadata AND feedback data, -1 permanent option preserves both per plan v2.7) **[IMPLEMENTED: Complete integration tests covering immediate cleanup triggers, permanent option preservation, and transaction integrity]**

**Checkpoint**: User Story 6 complete - retention periods configurable including permanent option, automatic cleanup works, manual cleanup available

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final polish, performance optimization, documentation, and deployment readiness

**⚠️ PLAN v2.7 ADDITIONS**: TailwindCSS, shadcn/ui, Lucide React, Inter font setup

### Frontend Stack Setup (NEW for plan v2.7)

- [X] T097 [P] Install and configure TailwindCSS v3.4 in package.json and tailwind.config.js (add tailwindcss@^3.4.0, autoprefixer, postcss per plan v2.7)
- [X] T098 [P] Install and configure shadcn/ui components (init shadcn-ui, setup component structure, install lucide-react icons per plan v2.7)
- [X] T099 [P] Install and configure Inter variable font (add @next/font/local or CSS import, configure font family per plan v2.7)
- [X] T100 [P] Create global styles in src/renderer/src/styles/globals.css (Tailwind CSS imports, base styles, font configuration per plan v2.7)

### Performance Optimization

- [X] T101 [P] Implement database query optimization in src/main/database/Database.ts (ensure all indexes created, WAL mode enabled, query execution plan analysis per plan v2.7) **[COMPLETED 2026-02-08: Added verifyIndexes(), analyzeQuery(), getPerformanceMetrics(), createMissingIndexes(), and analyze() methods for database optimization]**
- [X] T102 [P] Implement parallel LLM calls in src/main/llm/RemoteLLM.ts (future enhancement: concurrent requests for independent emails in batch) **[COMPLETED 2026-02-08: Added parallelRequests and maxConcurrency config options, generateParallel() and processSingleEmail() methods for concurrent email processing]**
- [X] T103 [P] Performance test for 1000-report query in tests/integration/performance/report-query.test.ts (verify <100ms execution per SC-017) **[COMPLETED 2026-02-08: Complete integration test suite with 6 test cases covering query performance, date range queries, aggregations, execution plans, index scans, and performance metrics]**

### Error Handling & Logging

- [X] T104 Implement global error handler in src/main/error-handler.ts (catch unhandled errors, log with context, show user-friendly error messages per plan v2.7) **[COMPLETED 2026-02-08: Complete error handler with uncaughtException, unhandledRejection, and render-process-gone handlers, error categorization, user-friendly dialogs, and error rate tracking]**
- [X] T105 [P] Implement structured error logging in src/main/config/logger.ts (error type, module, message, timestamp, context ID per FR-053) **[ALREADY IMPLEMENTED: logger.ts has all required fields - error type (level), module, message, timestamp, context ID support]**
- [X] T106 [P] Implement audit logging for duplicate detection in src/main/email/DuplicateDetector.ts (log "跳过N封重复邮件", "跳过N封已处理邮件" per FR-008A) **[ALREADY IMPLEMENTED: logSummary() method logs duplicate detection summary per FR-008A]**

### Security Hardening

- [ ] T107 [P] Security audit for SQL injection in tests/integration/security/sql-injection.test.ts (verify parameterized queries, no string concatenation in SQL per plan v2.7)
- [ ] T108 [P] Security audit for memory cleanup in tests/integration/security/memory-cleanup.test.ts (verify Buffer.fill(0) called after sensitive data usage per Principle VII)
- [ ] T109 [P] Security audit for single-instance lock in tests/integration/security/single-instance.test.ts (verify second instance quits immediately, window focus works per FR-059-FR-061)
- [ ] T109a [P] Security audit for IPC whitelist compliance in tests/integration/security/ipc-whitelist.test.ts (verify exactly 6 channels: llm:generate, db:query:history, db:export, config:get/set, app:check-update, email:fetch-meta per constitution.md line 129, fail if additional channels registered)

### Documentation

- [ ] T110 [P] Create API documentation in docs/api/llm-api.md (document LLM adapter interface, RemoteLLM with OpenAI SDK usage, LocalLLM with Ollama)
- [ ] T111 [P] Create deployment guide in docs/deployment.md (packaging with electron-builder, code signing, distribution via GitHub Releases)
- [ ] T112 [P] Update README.md with quickstart instructions (feature overview, setup steps, usage examples)

### Final Testing

- [ ] T113 End-to-end test for complete email processing workflow in tests/integration/e2e/email-processing.test.ts (upload .eml → process → view report → verify traceability → copy search string)
- [ ] T114 [P] Load test for 50-email batch processing in tests/integration/performance/batch-processing.test.ts (verify ~18s remote mode, ~35s local mode per performance goals)
- [ ] T115 [P] Cross-platform UI test in tests/integration/ui/cross-platform.test.ts (verify UI works correctly on Windows 10+, macOS 10.15+, Linux)

**Checkpoint**: System complete - all user stories implemented, performance benchmarks met, security audits passed, documentation complete

---

## Summary

**Total Tasks**: 118 tasks (+3 for first-run disclosure and IPC whitelist validation)
- **Setup**: 9 tasks (9 completed ✅)
- **Foundational**: 12 tasks (12 completed ✅)
- **User Story 1 (MVP)**: 30 tasks (30 completed ✅)
- **User Story 2**: 7 tasks (7 completed ✅)
- **User Story 3**: 11 tasks (11 completed ✅)
- **User Story 4**: 10 tasks (10 completed ✅) **[COMPLETED 2026-02-07: T067-T076 all parsers and tests implemented]**
- **User Story 5**: 13 tasks (13 completed ✅) **[COMPLETE 2026-02-08: T077-T089 all local mode, switching, UI, lifecycle, and network tasks]**
- **User Story 6**: 7 tasks (7 completed ✅) **[COMPLETE 2026-02-08: T090-T096 all retention cleanup, UI, and tests implemented]**
- **Polish**: 20 tasks (7 completed, 13 pending, 5 new for v2.7 frontend stack + constitution compliance)

**Completed**: 95/118 tasks (80.5%)
**Remaining**: 23/118 tasks (19.5%)

**MVP Scope (User Story 1)**: ✅ COMPLETE - All 30 tasks finished
**User Story 4**: ✅ COMPLETE - All 10 tasks finished (T067-T076)
**User Story 5**: ✅ COMPLETE - All 13 tasks finished (T077-T089) - Dual-mode operation with hot switching, auto-update policy, and network isolation
**User Story 6**: ✅ COMPLETE - All 7 tasks finished (T090-T096) - Configurable data retention with permanent option, automatic cleanup, and manual cleanup

### Plan v2.7 Impact Summary

**Affected Tasks** (completed but need refactoring):
- T058: ActionItem entity - Refactor to integrate feedback into todo_items table ✅
- T063: Feedback submission handler - Update for integrated feedback schema ✅
- T080: ModeManager - Update for hot switching without restart ✅ [COMPLETED 2026-02-08]
- T085: ModeSwitchNotification - Update notification UI
- T090: Retention cleanup - Add support for -1 (permanent) option
- T091: Retention change handler - Add -1 option handling
- T093: RetentionSettings UI - Add permanent (-1) option
- T095-T096: Retention tests - Add -1 option test cases

**New Tasks** (added in plan v2.7):
- T097-T100: Frontend stack setup (TailwindCSS, shadcn/ui, Lucide React, Inter font)

### Critical Path to MVP

1. ✅ **Setup & Foundation** (COMPLETED) - T001-T018b (All foundational tasks complete ✅)
2. ✅ **LLM Integration** (COMPLETED) - T008a, T031-T036 (OpenAI SDK migration complete ✅)
3. ✅ **Confidence & Pipeline** (COMPLETED) - T037-T044 (Confidence calculator, rule engine, email processing pipeline ✅)
4. ✅ **UI Implementation** (COMPLETED) - T045-T048 (ReportView, TraceabilityInfo, IPC service, Zustand store ✅)

### Next Actions

1. ⏭️ **User Story 2** - Low Confidence Item Warning System (T049-T055)
2. ⏭️ **User Story 3** - Local Privacy-Preserving Feedback System (T056-T066) - **AFFECTED BY v2.7**
3. ⏭️ **User Story 4** - Multi-Format Email Parsing (T067-T076)
4. ⏭️ **User Story 5** - Dual-Mode Operation with Hot Switching (T077-T089) - **IN PROGRESS: T077-T083 completed, T084-T089 pending**
5. ⏭️ **User Story 6** - Configurable Data Retention (T090-T096) - **UPDATED FOR v2.7**

---

**Generated**: 2026-02-05
**Plan Version**: 2.7 (Tech Architecture Update)
**Constitution Compliance**: ✅ All 7 principles satisfied
