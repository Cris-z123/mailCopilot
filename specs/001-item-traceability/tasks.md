# Tasks: Item Traceability & Indexing Module

**Input**: Design documents from `/specs/001-item-traceability/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: The examples below include test tasks. Tests are OPTIONAL - only include them if explicitly requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`
- Paths shown below assume single project - adjust based on plan.md structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create project structure per implementation plan
- [X] T002 Initialize Python project with pydantic, keyring dependencies
- [X] T003 [P] Create requirements.txt with pydantic>=2.0, keyring>=25.0 dependencies
- [X] T004 [P] Create config directory and app_config.json.template
- [X] T005 [P] Create config/rules/traceability_rules.json.template
- [X] T006 [P] Initialize Git repository with .gitignore for Python (__pycache__/, *.pyc, .venv/, venv/)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Configuration Management

- [X] T007 [P] Create TraceabilityConfig class in src/config/traceability_config.py
- [X] T008 [P] Create ConfigLoader class in src/config/config_loader.py with load_app_config(), load_traceability_rules() methods
- [X] T009 [P] Implement configuration validation using Pydantic models in src/config/traceability_config.py

### Database & Storage

- [X] T010 Create database schema in src/storage/database.py with email_messages, extracted_items, index_anomalies tables
- [X] T011 [P] Implement DatabaseConnection class in src/storage/database.py with connect(), execute_schema(), migrate() methods
- [X] T012 [P] Create AuditLog class in src/storage/audit_log.py with log_index_anomaly(), export_traceability_data() methods

### Utility Functions

- [X] T013 [P] Create normalize_message_id() function in src/utils/path_utils.py
- [X] T014 [P] Create decode_email_header() function in src/utils/unicode_utils.py with RFC 2047 support
- [X] T015 [P] Create truncate_subject() function in src/utils/unicode_utils.py for subject preview generation

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Email Item Traceability (Priority: P1) 🎯 MVP

**Goal**: Extract and bind Message-ID from source emails to all extracted items, enabling verification of AI-generated content

**Independent Test**: Process 10 emails, generate report, verify 100% of items contain source identification (sender, date, subject, Message-ID)

### Models for US1

- [X] T016 [P] [US1] Create EmailMessage dataclass in src/models/email_message.py with message_id, sender_name, sender_email, sent_date, subject, file_path, format fields
- [X] T017 [P] [US1] Create ExtractedItem dataclass in src/models/extracted_item.py with item_id, content, source_message_id, source_file_path, item_type, priority, confidence_score, index_status fields
- [X] T018 [P] [US1] Create IndexAnomaly dataclass in src/models/index_anomaly.py with anomaly_id, anomaly_type, email_file_path, message_id_value, error_details fields
- [X] T019 [P] [US1] Create ItemType, Priority, IndexStatus enums in src/models/extracted_item.py

### Email Parser Service for US1

- [X] T020 [P] [US1] Create EmailParser abstract interface in src/services/email_parser/base.py with parse(), detect_format(), get_message_id(), extract_metadata() methods
- [X] T021 [P] [US1] Create EmailMetadata dataclass in src/services/email_parser/base.py
- [X] T022 [US1] Implement MessageIdExtractor class in src/services/email_parser/message_id_extractor.py with extract_from_file(), extract_metadata() methods
- [X] T023 [US1] Implement MboxParser class in src/services/email_parser/mbox_parser.py inheriting from EmailParser
- [X] T024 [US1] Implement MaildirParser class in src/services/email_parser/maildir_parser.py inheriting from EmailParser

### Index Validator for US1

- [X] T025 [P] [US1] Create ValidationResult dataclass in src/services/indexing/index_validator.py
- [X] T026 [P] [US1] Create IndexValidator class in src/services/indexing/index_validator.py with validate_message_id(), validate_email_file(), create_anomaly_record() methods
- [X] T027 [US1] Implement Message-ID validation logic in src/services/indexing/index_validator.py with RFC 5322 format checking
- [X] T028 [US1] Implement anomaly type detection in src/services/indexing/index_validator.py (missing_message_id, malformed_message_id)

### Integration for US1

- [X] T029 [US1] Create EmailMessageRepository class in src/storage/database.py with save(), find_by_message_id(), find_by_file_path() methods
- [X] T030 [US1] Create ExtractedItemRepository class in src/storage/database.py with save(), find_by_source(), find_all_with_anomalies() methods
- [X] T031 [US1] Wire up email parsing → index validation → database persistence pipeline in cli/main.py

**Checkpoint**: At this point, User Story 1 should be fully functional - emails can be parsed, Message-IDs extracted and validated, items created with source bindings

---

## Phase 4: User Story 3 - Index Completeness Validation (Priority: P1)

**Goal**: Detect and flag when emails cannot be properly indexed (missing Message-ID) with clear user-facing warnings

**Independent Test**: Process emails with missing/malformed Message-ID headers, verify [索引异常] markers are displayed with error details

### Validation Logic for US3

- [ ] T032 [P] [US3] Implement validate_message_id() in src/services/indexing/index_validator.py with missing/malformed detection
- [ ] T033 [P] [US3] Implement create_anomaly_record() in src/services/indexing/index_validator.py with database insertion
- [ ] T034 [P] [US3] Implement get_anomalies_summary() in src/services/indexing/index_validator.py returning total_anomalies, by_type, unresolved counts

### Anomaly Handling for US3

- [ ] T035 [US3] Create IndexAnomalyRepository class in src/storage/database.py with save(), find_by_email_path(), find_unresolved() methods
- [ ] T036 [US3] Implement anomaly logging in src/storage/audit_log.py with timestamp, anomaly_type, file_path, message_id_value
- [ ] T037 [US3] Add anomaly marker logic in cli/main.py to display [索引异常] when index_status = anomaly

### Report Generation for US3

- [ ] T038 [US3] Implement generate_anomaly_summary() in cli/main.py with "Processed X emails, Y items with index issues" format
- [ ] T039 [US3] Add anomaly summary footer to report generation in cli/main.py

**Checkpoint**: User Stories 1 AND 3 should now work together - emails with missing Message-IDs are flagged, anomalies logged and summarized

---

## Phase 5: User Story 4 - Cross-Reference Information Display (Priority: P2)

**Goal**: Display key email metadata (sender, date, subject snippet) alongside each item for quick context assessment

**Independent Test**: Generate report, verify each item displays sender name/email, date/time, subject keywords (truncated to 50 chars if needed)

### Metadata Formatting for US4

- [ ] T040 [P] [US4] Create MetadataFormatter class in src/services/reporting/metadata_formatter.py
- [ ] T041 [P] [US4] Implement format_source_metadata() in src/services/reporting/metadata_formatter.py with sender, date, subject formatting
- [ ] T042 [P] [US4] Implement _truncate_subject() in src/services/reporting/metadata_formatter.py with max_length=50, "..." suffix
- [ ] T043 [P] [US4] Load display_templates from app_config.json in src/services/reporting/metadata_formatter.py

### Report Integration for US4

- [ ] T044 [US4] Integrate MetadataFormatter into cli/main.py process_emails() function
- [ ] T045 [US4] Add source_metadata display beneath each item in report generation in cli/main.py
- [ ] T046 [US4] Test subject truncation with long subjects (>50 chars) in cli/main.py

**Checkpoint**: At this point, User Stories 1, 3, AND 4 should all work together - reports display formatted source metadata with anomaly markers

---

## Phase 6: User Story 2 - One-Click Email Access (Priority: P2)

**Goal**: Provide deep links to open emails in desktop clients (Thunderbird, Apple Mail) with fallback for unsupported clients

**Independent Test**: Click "view original" link on item, verify email client opens to correct message or displays file path fallback

### Client Adapter Interface for US2

- [ ] T047 [P] [US2] Create EmailClientAdapter abstract interface in src/services/linking/base.py with generate_deep_link(), open_deep_link(), is_client_installed(), client_name, client_id
- [ ] T048 [P] [US2] Create normalize_message_id() helper in src/services/linking/base.py for Message-ID normalization
- [ ] T049 [P] [US2] Define custom exceptions in src/services/linking/base.py (EmailClientError, MessageIdValidationError, ClientNotInstalledError, DeepLinkExecutionError)

### Thunderbird Adapter for US2

- [ ] T050 [P] [US2] Implement ThunderbirdAdapter class in src/services/linking/thunderbird_adapter.py inheriting from EmailClientAdapter
- [ ] T051 [P] [US2] Implement generate_deep_link() in src/services/linking/thunderbird_adapter.py returning "thunderbird://message?id={clean_id}"
- [ ] T052 [P] [US2] Implement open_deep_link() in src/services/linking/thunderbird_adapter.py with platform detection (Windows/macOS/Linux)
- [ ] T053 [P] [US2] Implement is_client_installed() in src/services/linking/thunderbird_adapter.py with OS-specific detection (registry/defaults/which)
- [ ] T054 [P] [US2] Add client_name property returning "Mozilla Thunderbird" in src/services/linking/thunderbird_adapter.py
- [ ] T055 [P] [US2] Add client_id property returning "thunderbird" in src/services/linking/thunderbird_adapter.py

### Apple Mail Adapter for US2

- [ ] T056 [P] [US2] Implement AppleMailAdapter class in src/services/linking/applemail_adapter.py inheriting from EmailClientAdapter
- [ ] T057 [P] [US2] Implement generate_deep_link() in src/services/linking/applemail_adapter.py returning "message://{clean_id}" (RFC 2392)
- [ ] T058 [P] [US2] Implement open_deep_link() in src/services/linking/applemail_adapter.py for macOS
- [ ] T059 [P] [US2] Implement is_client_installed() in src/services/linking/applemail_adapter.py with macOS-specific detection
- [ ] T060 [P] [US2] Add client_name property returning "Apple Mail" in src/services/linking/applemail_adapter.py
- [ ] T061 [P] [US2] Add client_id property returning "applemail" in src/services/linking/applemail_adapter.py

### Client Detection for US2

- [ ] T062 [US2] Create ClientDetector class in src/services/linking/client_detector.py with detect_default_client(), get_adapter() methods
- [ ] T063 [US2] Implement detect_default_client() in src/services/linking/client_detector.py with OS-specific logic (Windows registry, macOS defaults, Linux xdg)
- [ ] T064 [US2] Implement get_adapter() factory in src/services/linking/client_detector.py returning ThunderbirdAdapter or AppleMailAdapter

### Report Integration for US2

- [ ] T065 [US2] Integrate ClientDetector into cli/main.py process_emails() function
- [ ] T066 [US2] Generate deep links for each item in report generation in cli/main.py
- [ ] T067 [US2] Add "[查看原文]" button/link with deep_link URL in report generation in cli/main.py
- [ ] T068 [US2] Implement fallback display (file path + offset) when client not detected in cli/main.py
- [ ] T069 [US2] Handle open_deep_link() failures gracefully with file path fallback in cli/main.py

**Checkpoint**: All 4 user stories should now be complete and functional - full traceability with metadata display and one-click email access

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

### Configuration & Settings

- [ ] T070 [P] Add email_client section to app_config.json.template with default_client, deep_link_enabled, supported_clients fields
- [ ] T071 [P] Add traceability section to app_config.json.template with message_id_validation_rules, display_templates fields
- [ ] T072 [P] Add storage section to app_config.json.template with database_path, audit_log_path fields
- [ ] T073 [P] Create traceability_rules.json.template with validation_rules, anomaly_handling, duplicate_detection sections

### CLI & User Interface

- [ ] T074 [P] Add init-db command to cli/main.py for database initialization
- [ ] T075 [P] Add export-traceability command to cli/main.py for JSON data export
- [ ] T076 [P] Add --config flag to cli/main.py for custom config file path
- [ ] T077 [P] Add --verbose flag to cli/main.py for detailed logging
- [ ] T078 [P] Add --output flag to cli/main.py for custom report output path

### Error Handling & Edge Cases

- [ ] T079 [P] Add email file moved/deleted handling in src/services/linking/base.py adapters
- [ ] T080 [P] Add duplicate Message-ID handling in src/services/indexing/index_validator.py with composite key (message_id + file_path)
- [ ] T081 [P] Add internationalized email address/subject handling in src/utils/unicode_utils.py with UTF-8 support
- [ ] T082 [P] Add malformed Message-ID normalization attempts in src/services/indexing/index_validator.py
- [ ] T083 [P] Add email client not installed graceful handling in cli/main.py with clear error messages

### Documentation

- [ ] T084 [P] Create README.md with project overview, installation instructions, usage examples
- [ ] T085 [P] Create docs/architecture.md with updated architecture diagram including traceability components
- [ ] T086 [P] Create docs/user_guide.md with traceability feature guide, configuration examples, troubleshooting

### Code Quality

- [ ] T087 [P] Add docstrings to all classes and methods following Google Python Style Guide
- [ ] T088 [P] Add type hints to all function signatures
- [ ] T089 [P] Add inline comments explaining complex logic (Message-ID normalization, RFC 2047 decoding)
- [ ] T090 [P] Add error handling with try-except blocks and user-friendly error messages

### Performance & Validation

- [ ] T091 Validate Message-ID extraction performance (<50ms per email) in cli/main.py
- [ ] T092 Validate report generation performance (<5 seconds for 100 emails) in cli/main.py
- [ ] T093 Validate deep link generation performance (<100ms per item) in cli/main.py
- [ ] T094 Run end-to-end integration test with 10 test emails in cli/main.py

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User Story 1 (P1): Can start after Foundational - No dependencies on other stories
  - User Story 3 (P1): Can start after Foundational - Depends on US1 for item model
  - User Story 4 (P2): Can start after Foundational - Depends on US1 for metadata
  - User Story 2 (P2): Can start after Foundational - Independent of US1/US3/US4
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Foundation for all other stories - provides item models and Message-ID extraction
- **User Story 3 (P1)**: Depends on US1 for item model and index validation framework
- **User Story 4 (P2)**: Depends on US1 for metadata access, US3 for anomaly status
- **User Story 2 (P2)**: Independent - can be developed in parallel with US3/US4 after US1

### Within Each User Story

- Models before services
- Services before integration
- Core implementation before testing/reporting
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T003-T006)
- All Foundational tasks marked [P] can run in parallel (T007-T015)
- Within US1: Models (T016-T019) can run in parallel
- Within US2: Thunderbird adapter tasks (T050-T055) can run in parallel, Apple Mail adapter tasks (T056-T061) can run in parallel
- Within US4: Metadata formatter tasks (T040-T043) can run in parallel
- Polish phase tasks (T070-T094) mostly parallel

---

## Parallel Example: User Story 1

```bash
# Launch all models for US1 together:
Task: "Create EmailMessage dataclass in src/models/email_message.py"
Task: "Create ExtractedItem dataclass in src/models/extracted_item.py"
Task: "Create IndexAnomaly dataclass in src/models/index_anomaly.py"

# Launch parser implementations together:
Task: "Implement MboxParser class in src/services/email_parser/mbox_parser.py"
Task: "Implement MaildirParser class in src/services/email_parser/maildir_parser.py"
```

---

## Parallel Example: User Story 2 (Email Client Adapters)

```bash
# Launch all Thunderbird adapter tasks together:
Task: "Implement generate_deep_link() in src/services/linking/thunderbird_adapter.py"
Task: "Implement open_deep_link() in src/services/linking/thunderbird_adapter.py"
Task: "Implement is_client_installed() in src/services/linking/thunderbird_adapter.py"

# Launch all Apple Mail adapter tasks together:
Task: "Implement generate_deep_link() in src/services/linking/applemail_adapter.py"
Task: "Implement open_deep_link() in src/services/linking/applemail_adapter.py"
Task: "Implement is_client_installed() in src/services/linking/applemail_adapter.py"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 3 Only)

**Minimum Viable Product**: Basic traceability with anomaly detection

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T015)
3. Complete Phase 3: User Story 1 (T016-T031) - Core traceability
4. Complete Phase 4: User Story 3 (T032-T039) - Anomaly validation
5. **STOP and VALIDATE**: Test with 10 emails, verify Message-IDs extracted, anomalies flagged
6. Deploy/demo if ready

**Value Delivered**: Users can see which emails generated items, verify source information, see clear warnings for traceability issues

### Incremental Delivery

1. **Sprint 1**: Setup + Foundational → Foundation ready
2. **Sprint 2**: Add User Story 1 → Test independently → Deploy/Demo (MVP with basic traceability)
3. **Sprint 3**: Add User Story 3 → Test independently → Deploy/Demo (MVP + anomaly detection)
4. **Sprint 4**: Add User Story 4 → Test independently → Deploy/Demo (MVP + metadata display)
5. **Sprint 5**: Add User Story 2 → Test independently → Deploy/Demo (Full feature with deep links)
6. **Sprint 6**: Polish & Cross-Cutting → Final production-ready release

Each sprint adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers (theoretical):

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - **Developer A**: User Story 1 (models + parsers)
   - **Developer B**: User Story 3 (validation logic)
   - **Developer C**: User Story 4 (metadata formatter) - can start after US1 models done
   - **Developer D**: User Story 2 (client adapters) - independent, can run in parallel
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Tasks are numbered sequentially (T001-T094) for easy tracking
- File paths are explicit and follow the project structure from plan.md
- Total tasks: 94
- Tests are OPTIONAL - only included if explicitly requested
- Estimated completion time: 8-12 hours for full implementation
- MVP (US1 + US3): ~6-8 hours
