# Feature Specification: Email Item Traceability & Verification System

**Feature Branch**: `001-email-item-traceability`
**Created**: 2026-01-31
**Status**: Draft
**Input**: User description: "基于PRD文档创建详细规格文档，专注于必做功能"
**Constitution**: This specification adheres to the project governance framework defined [constitution.md](`/.specify/memory/constitution.md`)

## Clarifications

### Session 2026-01-31

- Q: When the same email is processed multiple times across different batches (e.g., user re-processes an email archive with overlap), how should the system handle extracted action items that already exist from previous processing? → A: Skip creating duplicate action items, log that email was already processed, update existing item's timestamp only

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete Email Item Traceability (Priority: P1)

As a user, I need every extracted action item to be traceable to its original email source so that I can verify the accuracy and context of each item.

**Why this priority**: This is the core value proposition of the product. Without 100% traceability, users cannot trust the extracted items, rendering the entire system useless. The PRD explicitly states "事项可溯源率 100%" as a non-negotiable success metric.

**Independent Test**: Can be fully tested by processing a batch of 50 emails with known action items, then verifying that every extracted item displays complete source information (sender, date, subject keywords, and either Message-ID or fingerprint) and provides a working search string that locates the original email within 60 seconds.

**Acceptance Scenarios**:

1. **Given** a standard email format (RFC 5322 .eml file), **When** the system extracts an action item, **Then** the item MUST display:
   - Sender email address
   - Date and time (in user's local timezone)
   - Subject line (up to 30 characters)
   - Message-ID (or SHA-256 fingerprint if Message-ID is missing)
   - A copyable search string in format: `from:sender@example.com subject:"keyword snippet" date:YYYY-MM-DD`
   - File system path to the original email file

2. **Given** an Outlook .msg file with missing Message-ID (common in forwarded emails), **When** the system extracts an action item, **Then** the item MUST display:
   - All metadata fields (sender, date, subject)
   - SHA-256 fingerprint instead of Message-ID
   - A "[来源待确认]" (Source Pending Confirmation) tag
   - Confidence score ≤ 0.4
   - Complete search string and file path

3. **Given** any extracted action item, **When** the user clicks the "Copy Search Keywords" button, **Then** the search string MUST be copied to clipboard and can be pasted into any email client (Thunderbird, Apple Mail, Outlook) to locate the original email within 60 seconds

---

### User Story 2 - Low Confidence Item Warning System (Priority: P1)

As a meticulous user, I need the system to proactively highlight low-confidence items so that I can focus my verification efforts on items most likely to contain errors.

**Why this priority**: The PRD establishes "低置信度事项复核提示覆盖率 100%" as a mandatory success criterion. Users cannot trust the system without knowing which items require manual verification. This directly impacts user satisfaction (target ≥ 4.0/5.0).

**Independent Test**: Can be fully tested by processing emails with known ambiguous content, then verifying that items with confidence < 0.6 are visually distinguished, aggregated in a report summary, and display expanded source information by default.

**Acceptance Scenarios**:

1. **Given** extracted items with confidence score ≥ 0.8, **When** the report is displayed, **Then** these items MUST appear with normal styling and no special warning labels

2. **Given** extracted items with confidence score between 0.6 and 0.79, **When** the report is displayed, **Then** these items MUST display a gray "[建议复核]" (Suggested Review) label in small text

3. **Given** extracted items with confidence score < 0.6, **When** the report is displayed, **Then** these items MUST:
   - Have a light yellow background highlight
   - Display a prominent "[来源待确认]" (Source Pending Confirmation) label
   - Show expanded source information by default (not collapsed)
   - Be included in a summary banner at the top of the report: "⚠️ 发现N条需复核事项 (点击查看)"

4. **Given** a report with mixed confidence levels, **When** the user views the report summary, **Then** the summary MUST show:
   - "✅ 高置信度事项：X条"
   - "⚠️ 需复核事项：Y条 (点击查看)"
   - "❓ 来源待确认：Z条"

---

### User Story 3 - Local Privacy-Preserving Feedback System (Priority: P1)

As a privacy-conscious user, I need to provide feedback on item accuracy without uploading my data to any cloud service so that I maintain control over my information while helping improve local accuracy.

**Why this priority**: The PRD emphasizes privacy-first design and states "用户对事项准确性的满意度 ≥ 4.0/5.0" as a success metric. The feedback mechanism enables continuous improvement while respecting the constitution's mandate for local-only data storage. This is marked as P0 in the PRD user stories.

**Independent Test**: Can be fully tested by marking items as correct/incorrect, selecting error reasons, verifying that feedback data is stored locally (no network traffic), confirming data is encrypted at rest, and validating that the "destroy all feedback data" function permanently removes the data.

**Acceptance Scenarios**:

1. **Given** any extracted action item displayed in a report, **When** the user hovers over the feedback buttons, **Then** a tooltip MUST appear showing "✓ 标记准确" and "✗ 标记错误"

2. **Given** a user clicks the "✗" (mark incorrect) button on an item, **When** the dialog appears, **Then** the system MUST:
   - Display a privacy notice: "您的反馈仅存储在本地设备，不会上传"
   - Present four error reason options:
     - "内容错误" (Content error)
     - "优先级错误" (Priority error)
     - "非事项" (Not an actionable item)
     - "来源错误" (Source error)
   - Store the user's selection locally in encrypted form

3. **Given** a user clicks the "✓" (mark correct) button, **When** the action completes, **Then** the system MUST store the positive feedback locally without displaying additional dialogs

4. **Given** feedback data has been collected, **When** the user views the Settings page, **Then** the system MUST display:
   - "本月修正X处错误" (Corrected X errors this month)
   - Data retention period selector: 30天 / 90天 / 180天 / 365天 / 永久
   - "导出反馈数据" button
   - "立即销毁所有反馈数据" button

5. **Given** the "立即销毁所有反馈数据" button is clicked, **When** the confirmation dialog is confirmed, **Then** all feedback records MUST be permanently deleted from the local database with no recovery option

6. **Given** any feedback operation (marking correct/incorrect), **When** the action is performed, **Then** the system MUST NOT transmit any data to external servers (verified through network monitoring)

---

### User Story 4 - Multi-Format Email Parsing & Indexing (Priority: P2)

As a user with emails in various formats and from different email clients, I need the system to parse all common email formats so that I can process my entire email archive regardless of source.

**Why this priority**: The PRD specifies support for .eml, .msg, .pst/.ost, .mbox, and .html formats. This is essential for real-world usage but can be delivered incrementally. Standard .eml format provides the core P1 value, while legacy formats (.msg, .pst) serve enterprise users.

**Independent Test**: Can be fully tested by processing sample files in each supported format, verifying that action items are extracted with complete metadata, and confirming that Message-ID extraction success rates meet PRD targets (.eml: ≥95%, .msg: ≥85%, .pst: ≥90%).

**Acceptance Scenarios**:

1. **Given** a standard RFC 5322 .eml file, **When** the system processes it, **Then** the Message-ID MUST be extracted with ≥95% success rate

2. **Given** an Outlook .msg file (forwarded or automated notification), **When** the system processes it, **Then**:
   - Message-ID extraction must succeed in ≥85% of cases
   - When Message-ID is missing, SHA-256 fingerprint MUST be generated as fallback
   - The item MUST be marked with "[来源待确认]" tag

3. **Given** an Outlook .pst or .ost archive file, **When** the system processes it, **Then**:
   - All individual emails must be extracted from the archive
   - Message-ID extraction must succeed in ≥90% of cases
   - Processing time overhead is documented to user (~200ms additional per email)

4. **Given** a Unix mbox format file, **When** the system processes it, **Then**:
   - Individual emails must be separated using From_ delimiter logic
   - File offset information must be recorded for each email
   - Message-ID extraction must succeed in ≥95% of cases
   - SHA-256 fingerprint must be generated as fallback

5. **Given** an exported .htm/.html email file, **When** the system processes it, **Then**:
   - Basic metadata must be extracted from <meta> tags or <title>
   - SHA-256 fingerprint MUST be generated (Message-ID extraction rate ~30% expected)
   - Any extracted items MUST have confidence score capped at 0.6
   - Items MUST be marked with "[格式受限]" (Format Limited) label

---

### User Story 5 - Dual-Mode Operation with Hot Switching (Priority: P2)

As a user with varying privacy and performance needs, I need to switch between local (offline-only) and remote (cloud LLM) processing modes without restarting the application so that I can adapt to different scenarios.

**Why this priority**: The PRD defines two operational modes (local and remote) with different trade-offs. Hot switching enables users to maintain workflow continuity while adapting to changing requirements (e.g., switching to local mode for sensitive work, then back to remote for faster processing).

**Independent Test**: Can be fully tested by initiating a mode switch while a batch of emails is being processed, verifying that the current batch completes under the old mode, subsequent batches use the new mode, and the user is notified of the pending switch and its completion.

**Acceptance Scenarios**:

1. **Given** the application is in remote mode, **When** the user initiates processing of 50 emails, **Then** the system MUST use the remote LLM service

2. **Given** a batch of emails is currently being processed, **When** the user switches from remote to local mode in Settings, **Then**:
   - The current batch MUST continue processing with remote mode
   - The system MUST display: "当前任务处理完成后将切换模式，新任务已进入队列等待"
   - New processing requests MUST enter a waiting queue
   - After current batch completes, the mode MUST automatically switch to local
   - Queued tasks MUST then process using local mode

3. **Given** the application is in local mode, **When** the user attempts to process emails and the local LLM service (Ollama) is unavailable, **Then**:
   - Processing MUST be blocked with error message: "本地模型服务不可用，请检查 Ollama 是否运行在 localhost:11434"
   - The system MUST NOT automatically fall back to remote mode
   - The user MUST explicitly switch modes in Settings to enable remote processing

4. **Given** the application is in remote mode, **When** the application starts, **Then** the system MUST automatically check for updates from GitHub Releases

5. **Given** the application is in local mode, **When** the application starts, **Then** the system MUST NOT automatically check for updates, but MUST provide a "手动检查更新" button in Settings

---

### User Story 6 - Configurable Data Retention with Privacy Controls (Priority: P2)

As a user concerned about data accumulation, I need to configure how long email metadata and feedback data are retained so that I can balance traceability needs with minimal data storage.

**Why this priority**: The PRD establishes data retention as a configurable user right with options including permanent retention (-1). This supports both minimal-data users and users who need long-term audit trails. The ability to permanently delete data on demand is a constitutional requirement.

**Independent Test**: Can be fully tested by setting different retention periods, verifying that data older than the retention period is automatically deleted (except when set to permanent), confirming that the "permanent" setting preserves data indefinitely, and validating that immediate deletion functions work correctly.

**Acceptance Scenarios**:

1. **Given** the default configuration, **When** the system is first installed, **Then** email metadata MUST be retained for 90 days (configurable to 30/90/180/365/永久)

2. **Given** a retention period of 90 days is configured, **When** the daily cleanup task runs, **Then** all email metadata records older than 90 days MUST be automatically deleted (the extracted action items themselves are preserved in daily reports)

3. **Given** a retention period of "永久" (permanent, represented as -1) is configured, **When** the daily cleanup task runs, **Then** email metadata MUST NOT be deleted regardless of age

4. **Given** feedback data retention is set to 30 days, **When** the daily cleanup task runs, **Then** all feedback records older than 30 days MUST be automatically deleted

5. **Given** a retention period change from 90 days to 30 days is made, **When** the change is saved, **Then** the system MUST immediately trigger cleanup of data older than 30 days (not wait for scheduled task)

6. **Given** the Settings page, **When** the retention period is displayed, **Then** the system MUST show:
   - Currently configured retention period
   - Estimated storage usage of retained data
   - Clear indication when "永久" (permanent) is selected

---

### Edge Cases

#### Email Format Edge Cases

- **What happens when** an email file is corrupted or cannot be parsed?
  - System MUST skip the email and log the error
  - Report footer MUST display: "跳过N封无法解析的邮件"
  - No action items are extracted from the corrupted email
  - Processing continues with remaining emails

- **What happens when** Message-ID is missing from an email AND the content is too short to generate a reliable fingerprint (< 200 characters)?
  - System MUST still generate a fingerprint from available content (sender + date + subject + whatever body content exists)
  - Item MUST be marked with "[来源待确认]"
  - Confidence score MUST be capped at 0.4
  - A warning MUST be logged but processing continues

- **What happens when** the same email content is processed twice (duplicate detection)?
  - System MUST use SHA-256 fingerprint to detect duplicates (both within same batch and across previous batches)
  - When duplicate detected in same batch: skip email with log entry, no action items created
  - When duplicate detected across batches: skip creating new action items, update existing item's `last_seen_at` timestamp, log that email was re-processed
  - User is informed in report footer: "跳过N封重复邮件" (for same-batch duplicates) and "跳过N封已处理邮件" (for cross-batch duplicates)

#### Confidence Calculation Edge Cases

- **What happens when** the rule engine fails completely (no keywords matched, no sender recognition)?
  - Rule score MUST be 0.0
  - LLM output (if valid) still contributes to confidence
  - If both rule and LLM fail, item MUST still be created with confidence 0.0
  - Item MUST be marked with "[来源待确认]" and highlighted

- **What happens when** the LLM service times out or returns an error during local mode operation?
  - System MUST retry the request up to 2 times
  - If all retries fail, system MUST fall back to rule-engine-only extraction
  - Confidence score MUST be capped at 0.6
  - Item MUST be marked with "[来源待确认]"

- **What happens when** LLM output JSON schema validation fails (missing required fields)?
  - System MUST retry the request up to 2 times with reinforced schema instructions
  - If all retries fail, system MUST degrade to rule-engine-only extraction
  - Confidence calculation MUST adjust: rules 60% + LLM 20% (halved), capped at 0.6
  - Item MUST be marked with "[来源待确认]"

#### Data Privacy & Security Edge Cases

- **What happens when** the device's system keyring is inaccessible (e.g., system reinstall, key ring cleared)?
  - System MUST detect the condition on startup
  - User MUST be presented with clear message: "检测到设备环境变更，无法访问历史数据。如已更换设备或重装系统，历史数据已丢失。"
  - Application MUST continue to function with fresh database
  - Old encrypted data MUST remain inaccessible (no automatic decryption attempts)

- **What happens when** a user sets retention to "永久" (permanent) and later wants to free disk space?
  - Settings page MUST provide explicit "清理30天前数据" button (separate from retention setting)
  - Clicking the button MUST trigger one-time cleanup regardless of permanent retention setting
  - User MUST confirm the action with clear warning: "此操作将删除30天前的元数据，历史日报中的事项仍可查看但无法查看来源邮件详情。确定继续？"

- **What happens when** feedback data encryption key is lost or corrupted?
  - System MUST detect unreadable feedback records on startup
  - Affected feedback records MUST be skipped (not displayed in statistics)
  - Error MUST be logged for diagnostics
  - User MUST NOT be blocked from using the application
  - Settings page SHOULD offer "清除损坏的反馈数据" option

#### Mode Switching Edge Cases

- **What happens when** a mode switch is requested while no batch is processing (idle state)?
  - Switch MUST execute immediately
  - User MUST see confirmation: "模式已切换"
  - Network interceptor MUST reconfigure immediately
  - No queue delay occurs

- **What happens when** multiple mode switch requests are made while a batch is processing?
  - Only the most recent request MUST be honored
  - Previous pending switch requests MUST be discarded
  - User MUST see: "模式切换请求已更新为：[目标模式]"

- **What happens when** local mode is active but the local LLM service (Ollama) stops mid-batch?
  - Currently processing emails in the batch MUST complete or timeout after 30 seconds per email
  - Remaining emails in the batch MUST fail with error
  - Report MUST indicate which emails failed processing
  - User MUST see error message guiding them to check Ollama service
  - System MUST NOT automatically switch to remote mode

## Requirements *(mandatory)*

### Functional Requirements

#### Email Indexing & Traceability

- **FR-001**: System MUST extract Message-ID from email headers for all standard RFC 5322 format emails with ≥95% success rate
- **FR-002**: System MUST generate SHA-256 content fingerprint as backup index when Message-ID is missing or extraction fails
- **FR-003**: System MUST extract and display the following metadata for each action item:
  - Sender email address
  - Date and time (normalized to user's local timezone)
  - Subject line (first 30 characters, with Re:/Fwd: prefixes removed)
  - Message-ID or SHA-256 fingerprint
  - File system path to original email file
  - Search string in format: `from:email subject:"keyword snippet" date:YYYY-MM-DD`

- **FR-004**: System MUST provide a "Copy Search Keywords" button for each action item that copies the search string to system clipboard
- **FR-005**: System MUST ensure 100% of extracted action items have either a valid Message-ID or a SHA-256 fingerprint (no items without source traceability)
- **FR-006**: System MUST mark items with fingerprint-only index (no Message-ID) with "[来源待确认]" tag and cap confidence at ≤0.4
- **FR-007**: System MUST support parsing of multiple email formats: .eml, .msg, .pst, .ost, .mbox, .html
- **FR-008**: System MUST achieve Message-ID extraction rates of:
  - .eml files: ≥95%
  - .msg files: ≥85%
  - .pst/.ost files: ≥90%
  - .mbox files: ≥95%
  - .html files: ~30% (expected low rate due to format limitations)

- **FR-008A**: System MUST detect and handle duplicate emails across processing batches:
  - Use SHA-256 fingerprint to identify emails processed in previous batches
  - Skip creating new action items for previously processed emails
  - Update existing item's `last_seen_at` timestamp when duplicate detected
  - Log duplicate detection events for audit trail
  - Distinguish between same-batch duplicates and cross-batch duplicates in user reporting

#### Confidence Calculation & Display

- **FR-009**: System MUST calculate confidence score for each extracted action item using dual-engine approach:
  - Rule engine score (50% weight): based on keyword density, sender whitelist matching, deadline detection
  - LLM score (50% weight): based on output logprobs (remote mode) or schema completeness + keyword coherence (local mode)
  - Combined confidence = (rule score × 0.5) + (LLM score × 0.5)

- **FR-010**: System MUST adjust confidence calculation when LLM output schema validation fails:
  - Rule engine weight: 60%
  - LLM weight: 20% (halved score)
  - Maximum confidence: 0.6
  - Item marked with "[来源待确认]"

- **FR-011**: System MUST display confidence-based visual indicators:
  - Confidence ≥ 0.8: Normal display, no warning labels
  - Confidence 0.6 - 0.79: Gray text "[建议复核]" label
  - Confidence < 0.6: Light yellow background, "[来源待确认]" label, expanded source information

- **FR-012**: System MUST display a summary banner at top of reports showing:
  - "✅ 高置信度事项：X条"
  - "⚠️ 需复核事项：Y条 (点击查看)"
  - "❓ 来源待确认：Z条"

- **FR-013**: System MUST cap confidence score at 0.6 for items extracted from non-standard email formats (.html, .txt)

#### LLM Output Validation & Degradation

- **FR-014**: System MUST enforce structured JSON schema validation for all LLM outputs
- **FR-015**: System MUST require LLM output to include: `source_message_id` (or `source_fingerprint`), `confidence`, `action_type`, and `evidence` fields
- **FR-016**: System MUST retry LLM request up to 2 times if schema validation fails, with reinforced schema instructions
- **FR-017**: System MUST degrade to rule-engine-only extraction if LLM fails after 2 retries, with confidence capped at 0.6
- **FR-018**: System MUST create action items even when source traceability is incomplete (degraded to unverified status, never silently dropped)

#### User Feedback System

- **FR-019**: System MUST display feedback buttons (✓ and ✗) next to each action item in reports
- **FR-020**: System MUST display tooltip "✓ 标记准确" and "✗ 标记错误" on hover over feedback buttons
- **FR-021**: System MUST show privacy notice "您的反馈仅存储在本地设备，不会上传" when user clicks ✗ button
- **FR-022**: System MUST present four error reason options when user marks item as incorrect:
  - "内容错误" (Content error)
  - "优先级错误" (Priority error)
  - "非事项" (Not an actionable item)
  - "来源错误" (Source error)

- **FR-023**: System MUST store all user feedback locally with field-level encryption (AES-256-GCM)
- **FR-024**: System MUST NOT upload any feedback data to external servers under any circumstances
- **FR-025**: System MUST display feedback statistics in Settings page: "本月修正X处错误"
- **FR-026**: System MUST provide configurable feedback data retention periods: 30/90/180/365/永久 days (default: 90 days)
- **FR-027**: System MUST automatically delete feedback records older than configured retention period (except when set to 永久/-1)
- **FR-028**: System MUST provide "导出反馈数据" button in Settings that exports feedback as unencrypted file (user-managed)
- **FR-029**: System MUST provide "立即销毁所有反馈数据" button in Settings that permanently deletes all feedback records with confirmation dialog

#### Dual-Mode Operation

- **FR-030**: System MUST support two operational modes:
  - Remote mode: Data transmitted via TLS 1.3 to third-party LLM service
  - Local mode: All processing performed locally on user's device

- **FR-031**: System MUST default to remote mode on first launch
- **FR-032**: System MUST allow users to switch between remote and local modes via Settings page
- **FR-033**: System MUST implement hot mode switching: wait for current processing batch to complete before applying new mode
- **FR-034**: System MUST queue new processing tasks during mode transition and process them after switch completes
- **FR-035**: System MUST display message "当前任务处理完成后将切换模式，新任务已进入队列等待" during pending mode switch
- **FR-036**: System MUST block functionality in local mode if local LLM service is unavailable, with error message "本地模型服务不可用，请检查 Ollama 是否运行在 localhost:11434"
- **FR-037**: System MUST NOT automatically fall back from local to remote mode under any circumstances
- **FR-038**: System MUST enable automatic update checks on startup in remote mode
- **FR-039**: System MUST disable automatic update checks in local mode, requiring manual trigger via Settings
- **FR-040**: System MUST enforce network-layer blocking of non-local requests in local mode

#### Data Retention & Privacy

- **FR-041**: System MUST retain email metadata (sender hash, desensitized subject, timestamp, attachment list) for default 90 days
- **FR-042**: System MUST support configurable email metadata retention periods: 30/90/180/365/永久 days
- **FR-043**: System MUST automatically delete email metadata older than configured retention period (except when set to 永久/-1)
- **FR-044**: System MUST clear original email body content immediately after processing (metadata only retained)
- **FR-045**: System MUST encrypt sensitive database fields using AES-256-GCM encryption
- **FR-046**: System MUST bind encryption keys to device hardware environment (no cross-device recovery)
- **FR-047**: System MUST detect device environment changes (system reinstall, device replacement) and inform user of permanent data loss
- **FR-048**: System MUST provide "清理30天前数据" button in Settings for one-time manual cleanup regardless of retention setting

#### Report Generation

- **FR-049**: System MUST generate daily reports in Markdown format containing:
  - Summary banner with confidence breakdown
  - All extracted action items with complete source information
  - Footer with data source explanation: "ℹ️ 所有事项均可追溯至原始邮件。请复制搜索关键词至邮件客户端查找原文"

- **FR-050**: System MUST include search string and file path for each action item in generated reports
- **FR-051**: System MUST support exporting reports as unencrypted Markdown or PDF files
- **FR-052**: System MUST display security warning before export: "导出的文件未加密，请妥善保管"

#### Error Handling & Logging

- **FR-053**: System MUST log all errors with structured format including: error type, module, message, timestamp, context ID
- **FR-054**: System MUST skip corrupted or unparseable emails and continue processing remaining emails
- **FR-055**: System MUST display count of skipped emails in report footer
- **FR-056**: System MUST enforce timeout of 5 seconds per email for rule engine execution
- **FR-057**: System MUST enforce timeout of 30 seconds per email for LLM processing
- **FR-058**: System MUST enforce memory limit of 128MB for rule engine sandbox

#### Single Instance & Concurrency

- **FR-059**: System MUST enforce single-instance application execution
- **FR-060**: System MUST quit immediately if second instance detects existing instance is running
- **FR-061**: System MUST focus existing application window and display "应用已在运行中" message when second instance launch is attempted

### Key Entities

#### Action Item (Todo Item)

Represents a single task, commitment, or deadline extracted from email content. Key attributes include:
- Item content (description of the action required)
- Item type (completed/pending - indicates whether the item represents a completed task or a pending todo)
- Confidence score (0.0 - 1.0 - indicates system's certainty about accuracy)
- Source status (verified/unverified - indicates whether source email was successfully traced)
- Source traceability information (search string, file path, Message-ID or fingerprint)
- Email metadata (sender, date, subject, attachment list)
- User feedback (if provided - correct/incorrect indication with error reason)
- Creation timestamp and report date association

#### Email Source

Represents the original email from which action items were extracted. Key attributes include:
- Email hash (SHA-256 of Message-ID + Date + From fields - serves as unique identifier)
- Processing timestamp (first processed date)
- Last seen timestamp (updated when email is re-processed in subsequent batches)
- Associated report date
- Attachment metadata (filenames, sizes, MIME types - no attachment content stored)
- Extraction status (success/no content/error)
- Search string (generated for user copy-paste verification)
- File path (absolute path to original email file)
- Error log (if extraction failed)

#### User Feedback

Represents user's assessment of action item accuracy. Key attributes include:
- Associated action item reference
- Feedback type (content_error/priority_error/not_actionable/source_error)
- Timestamp
- Encrypted storage (all feedback data encrypted at rest)

#### Daily Report

Represents a generated report for a specific date containing extracted action items. Key attributes include:
- Report date (YYYY-MM-DD format)
- Generation mode (local/remote - indicates which LLM mode was used)
- Created and updated timestamps
- Completed items count
- Pending items count
- Encrypted content (JSON containing completed items array, pending items array, and summary)
- Content checksum (SHA-256 for tamper detection)
- Associated email source hashes

#### Data Retention Configuration

Represents user's data retention preferences. Key attributes include:
- Email metadata retention period (30/90/180/365/-1 days, where -1 = permanent)
- Feedback data retention period (30/90/180/365/-1 days)
- Last cleanup timestamp
- Estimated storage usage

## Success Criteria *(mandatory)*

### Measurable Outcomes

#### Traceability & Verification

- **SC-001**: 100% of generated action items contain either a valid Message-ID or SHA-256 fingerprint
- **SC-002**: 100% of generated action items display complete source metadata (sender, date, subject, file path, search string)
- **SC-003**: 90% of users can locate the original email for an action item within 60 seconds using the provided search string
- **SC-004**: Message-ID extraction success rate meets or exceeds format-specific targets (.eml: ≥95%, .msg: ≥85%, .pst: ≥90%, .mbox: ≥95%)

#### Accuracy & User Trust

- **SC-005**: Items marked with confidence < 0.6 have a user-confirmed error rate of ≥40% (validates that low-confidence warning system effectively identifies problematic items)
- **SC-006**: User survey shows ≥80% agreement with "I trust that action item sources in reports are authentic" (5-point scale, 4-5 counts as agreement)
- **SC-007**: ≥50% of low-confidence items (< 0.6) are viewed by users (validates that warning system effectively directs user attention)

#### User Engagement & Satisfaction

- **SC-008**: User satisfaction score for action item accuracy is ≥4.0/5.0 in post-use survey
- **SC-009**: ≥60% of users return to use action item viewing or feedback features within 7 days of first use
- **SC-010**: First-time setup completion rate is ≥80% (users successfully complete initial configuration)

#### Privacy & Data Control

- **SC-011**: 100% of users can successfully locate and use feedback data deletion controls in Settings
- **SC-012**: Zero network transmissions occur for feedback data operations (verified through network monitoring)
- **SC-013**: All feedback data is encrypted at rest with AES-256-GCM (verified through security audit)

#### Performance & Reliability

- **SC-014**: Email metadata extraction completes in ≤100ms per email on mid-range hardware (i5 processor, single email < 1MB)
- **SC-015**: Local LLM processing completes in ≤2 seconds per email when service is available
- **SC-016**: Application startup completes in ≤3 seconds when processing 1000 historical reports
- **SC-017**: 1000-report query executes in <100ms

#### Feature Completeness

- **SC-018**: All P1 user stories (US1-US3) are fully implemented and pass acceptance tests
- **SC-019**: All P2 user stories (US4-US6) are fully implemented and pass acceptance tests
- **SC-020**: All functional requirements (FR-001 through FR-061) pass automated testing
- **SC-021**: System supports all required email formats (.eml, .msg, .pst, .ost, .mbox, .html) with specified extraction success rates

#### Error Handling & Edge Cases

- **SC-022**: 100% of edge cases specified in User Scenarios section are handled gracefully (no application crashes, clear user communication)
- **SC-023**: Corrupted or unparseable emails are skipped and logged without blocking processing of remaining emails
- **SC-024**: System recovers gracefully from LLM service failures with appropriate degradation and user notification

#### Compliance & Constitutional Alignment

- **SC-025**: 100% of constitutional requirements from `.specify/memory/constitution.md` are satisfied
- **SC-026**: All user data is stored locally with device-bound encryption (no cloud backup, no cross-device sync)
- **SC-027**: Mode switching respects constitution mandates (no automatic degradation, batch completion before switch, network-layer isolation in local mode)

### Assumptions

1. **User Technical Proficiency**: Users have basic computer literacy and can copy-paste text, navigate file systems, and understand email client search functionality. Users do not need technical knowledge of email protocols or encryption.

2. **Email Client Availability**: Users have access to an email client (Thunderbird, Apple Mail, Outlook, webmail) capable of processing search strings in the format `from:sender subject:"keyword" date:YYYY-MM-DD`. If users only have mobile email clients, search functionality may be limited.

3. **Local LLM Service**: Users choosing local mode are responsible for installing and configuring Ollama (or compatible LocalAI service) on their machines. The application provides configuration guidance but does not bundle LLM software.

4. **System Keyring Availability**: The operating system provides a keyring or credential manager (Windows Credential Manager, macOS Keychain, Linux Secret Service API) for secure storage of encryption keys. Systems without keyring support will show degraded security but remain functional.

5. **Network Connectivity**: Users in remote mode have stable internet connection for LLM API calls. Network interruptions cause processing failures with clear error messages.

6. **File System Access**: Users grant the application read access to email storage directories. For macOS, this may require explicit user permission through privacy controls.

7. **Email Format Distribution**: Based on industry data, assumed email format distribution in user archives is: .eml (60%), .msg (25%), .pst/.ost (10%), .mbox (4%), .html (1%). Performance targets are calibrated to this distribution.

8. **Language Support**: Initial release supports Chinese and English interface languages. Email content processing supports major languages (Chinese, English) with degraded accuracy for other languages (documented limitation).

9. **Hardware Requirements**: Minimum hardware for acceptable local LLM performance: 8GB RAM, 4 CPU cores, SSD storage. Users with lower specifications will experience slower processing but functional correctness is maintained.

10. **Legal Jurisdiction**: Product is designed for privacy-conscious users in jurisdictions with strong data protection laws (GDPR, CCPA). Legal compliance is user's responsibility; the product provides technical controls but not legal guarantees.

11. **Update Distribution**: Automatic updates are distributed via GitHub Releases. Users in regions with restricted GitHub access may need to download updates manually.

12. **Data Loss Acceptance**: Users understand and accept that device replacement or system reinstall results in permanent data loss (by design). Users are responsible for exporting data before such events if they wish to preserve it.

13. **Feedback Utility**: User feedback is collected for potential future rule optimization but is NOT guaranteed to be used. The primary value of feedback is immediate user expression of accuracy assessment.

14. **Search String Compatibility**: While search string format is designed for broad compatibility, some email clients may require syntax adjustments. The application provides a standard format that works with most major clients.

15. **Batch Processing Limits**: Maximum batch size is 50 emails to balance performance and memory usage. Users with larger archives process multiple batches sequentially.
