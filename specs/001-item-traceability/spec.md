# Feature Specification: Item Traceability & Indexing Module

**Feature Branch**: `001-item-traceability`
**Created**: 2026-01-28
**Status**: Draft
**Input**: User description: "基于d:\work\project\mailCopilot\docs\product-design.md 功能需求详述3.1，完善 spec.md 的验收标准"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Email Item Traceability (Priority: P1)

As a user, I need every extracted item (action item, task, deadline) to be precisely traceable to its source email so I can verify the accuracy of the information and understand the full context.

**Why this priority**: This is the foundation of user trust. Without traceability, users cannot verify AI-generated items, leading to skepticism about the system's accuracy. This directly addresses the core product value proposition: "可验证" (verifiable) and "可溯源" (traceable).

**Independent Test**: Can be fully tested by processing a set of emails, generating a report, and verifying that every item contains valid source identification that can be cross-referenced with the original email.

**Acceptance Scenarios**:

1. **Given** a user processes 10 emails, **When** the system generates an items report, **Then** 100% of items MUST display source email information (sender, date, subject keywords)
2. **Given** an item in the report, **When** the user views the item details, **Then** the item MUST contain the Message-ID from the source email
3. **Given** duplicate emails with identical content, **When** items are extracted, **Then** each item MUST be traceable to a specific email instance via unique Message-ID

---

### User Story 2 - One-Click Email Access (Priority: P2)

As a user, I want to quickly navigate from any extracted item to the original email in my email client so I can verify context or read the full message without switching applications manually.

**Why this priority**: Enhances user workflow efficiency and verification capabilities. While traceability (US1) is essential for basic verification, quick access significantly improves user experience and reduces friction in the verification process.

**Independent Test**: Can be tested by clicking the "view original" link on items and verifying that the email client opens to the correct message.

**Acceptance Scenarios**:

1. **Given** an item displayed in the report, **When** the user clicks "view original email", **Then** the system MUST open the email client with the specific message selected
2. **Given** Thunderbird as the default email client, **When** a deep link is triggered, **Then** it MUST use the `thunderbird://message?id=xxx` format
3. **Given** Apple Mail as the default email client, **When** a deep link is triggered, **Then** it MUST use the appropriate macOS mail URL scheme
4. **Given** no supported email client is detected, **When** a user clicks "view original", **Then** the system MUST display the email file path and storage location

---

### User Story 3 - Index Completeness Validation (Priority: P1)

As a rigorous user, I need the system to detect and flag when emails cannot be properly indexed (missing Message-ID) so I am aware of potential traceability issues.

**Why this priority**: Ensures data integrity and user awareness. This is critical for the "可溯源" (traceable) principle - users must know when traceability cannot be guaranteed.

**Independent Test**: Can be tested by processing emails with missing or malformed Message-ID headers and verifying appropriate warnings are displayed.

**Acceptance Scenarios**:

1. **Given** an email without a Message-ID header, **When** the system processes it, **Then** the item MUST be marked with "[索引异常]" (index anomaly)
2. **Given** processing completes with index errors, **When** the report is generated, **Then** a summary MUST indicate "X items with index issues"
3. **Given** items marked with index anomalies, **When** the user views the processing log, **Then** the log MUST record the specific error (e.g., "Message-ID missing: email_path")

---

### User Story 4 - Cross-Reference Information Display (Priority: P2)

As a user reviewing extracted items, I want to see key email metadata (sender, date, subject snippet) alongside each item so I can quickly assess context without opening the original email.

**Why this priority**: Improves user efficiency and context awareness. Users can make informed decisions about which items need full verification without constantly switching contexts.

**Independent Test**: Can be tested by generating a report and verifying each item displays the required metadata fields in a readable format.

**Acceptance Scenarios**:

1. **Given** an extracted item in the report, **When** displayed, **Then** it MUST show: sender name/email, date/time, subject keywords (truncated if long)
2. **Given** a sender with display name "张三 <zhang@example.com>", **When** displayed, **Then** it MUST show the full display name and email
3. **Given** a subject line "RE: [项目A] Q1预算审批 - 请确认", **When** displayed, **Then** the item MUST show subject keywords like "[项目A] Q1预算审批"
4. **Given** metadata display, **When** the subject is over 50 characters, **Then** it MUST be truncated with "..." and preserve key identifying information

---

### Edge Cases

- What happens when an email has a malformed or non-standard Message-ID format?
  - System MUST still attempt to extract and store the Message-ID value
  - If extraction fails, mark as "[索引异常]" and log the error
- How does the system handle emails with the same Message-ID (duplicate emails in different folders)?
  - Each item MUST reference the specific email instance via full path + Message-ID combination
  - Deep links MUST use the most recent or user-configured email instance
- What happens when the email file is moved or deleted after processing?
  - Deep link attempts MUST gracefully handle missing files
  - Display clear error: "Original email no longer at expected location: [path]"
- How are internationalized email addresses and subjects handled?
  - MUST preserve UTF-8 encoding in Message-ID and metadata
  - Display MUST render Unicode characters correctly (Chinese, emojis, etc.)
- What happens when email clients are not installed or deep link protocols fail?
  - System MUST provide fallback: display file path and offer to open in file browser
  - User MUST be informed of the limitation with clear guidance

## Requirements *(mandatory)*

### Functional Requirements

#### TRACE-01: Email Unique Identifier Binding
- **FR-001**: System MUST extract Message-ID from email headers per RFC 5322 standard during email parsing
- **FR-002**: System MUST bind Message-ID as the core index field for every extracted item
- **FR-003**: System MUST prevent duplicate item creation from the same Message-ID within a single processing run
- **FR-004**: System MUST store Message-ID in all item data structures and pass through the entire processing pipeline
- **FR-005**: System MUST validate Message-ID format and flag non-compliant values

#### TRACE-02: In-Report Source Information Display
- **FR-006**: System MUST display source metadata beneath each extracted item in the report
- **FR-007**: Source metadata MUST include: sender (name + email), date/time, subject keywords, Message-ID
- **FR-008**: Source information display format: `📧 来源：张三 <zhang@example.com> | 2026-01-27 14:30 | [项目A]进度确认`
- **FR-009**: Subject keywords MUST be truncated to max 50 characters with "..." if longer
- **FR-010**: Message-ID display MUST be collapsible or shown in a tooltip to reduce visual clutter (optional enhancement)

#### TRACE-03: One-Click Original Email Access
- **FR-011**: System MUST generate deep links to open specific emails in supported email clients
- **FR-012**: For Thunderbird: System MUST use `thunderbird://message?id=<message-id>` URL scheme
- **FR-013**: For Apple Mail: System MUST use macOS mail URL scheme (specific format TBD during implementation)
- **FR-014**: System MUST detect the default email client from the user's system configuration
- **FR-015**: When no supported client is detected, System MUST display email storage path and offset information
- **FR-016**: System MUST provide a "view original" button or link adjacent to each item

#### TRACE-04: Index Completeness Validation
- **FR-017**: System MUST validate Message-ID presence during email parsing stage
- **FR-018**: When Message-ID is missing, System MUST mark the item with "[索引异常]" (index anomaly) label
- **FR-019**: System MUST log all index anomalies with: timestamp, error type, email file path, Message-ID value (if any)
- **FR-020**: System MUST generate a summary in the report footer: "Processed X emails, Y items with index issues"
- **FR-021**: Audit log MUST record index anomalies for troubleshooting and user transparency

#### Data Processing Requirements
- **FR-022**: Message-ID extraction MUST occur in the first stage of email processing (before LLM analysis)
- **FR-023**: Message-ID MUST be passed through all processing stages (parsing → rule engine → LLM → report generation)
- **FR-024**: Item data structure MUST include `source_message_id` as a required field
- **FR-025**: System MUST validate that `source_message_id` is present before finalizing any item

### Key Entities

#### Email Message
- **Purpose**: Represents the source email from which items are extracted
- **Key Attributes**:
  - Message-ID (RFC 5322 unique identifier)
  - Sender name and email address
  - Sent date/time
  - Subject line
  - File path (for local email storage)
  - Storage offset (for fallback定位)

#### Extracted Item
- **Purpose**: Represents a task, deadline, or action item extracted from an email
- **Key Attributes**:
  - Item content/description
  - source_message_id (required reference to Email Message)
  - Source metadata (sender, date, subject keywords)
  - Confidence score (calculated from rules + LLM)
  - Index status (normal/anomaly)

#### Index Anomaly Log
- **Purpose**: Records traceability failures for user awareness and debugging
- **Key Attributes**:
  - Timestamp
  - Anomaly type (missing Message-ID, malformed Message-ID, duplicate detection failure)
  - Email file path
  - Message-ID value (if available)
  - Error details

## Success Criteria *(mandatory)*

### Measurable Outcomes

#### Traceability Completeness
- **SC-001**: 100% of extracted items contain a valid source_message_id field (for emails with standard Message-ID)
- **SC-002**: Message-ID extraction success rate ≥ 99% for standard RFC 5322 compliant emails
- **SC-003**: Zero items are generated without source binding; if Message-ID cannot be extracted, item MUST be marked with index anomaly

#### User Verification Efficiency
- **SC-004**: 90% of users can locate the original email for any item within 10 seconds using deep links
- **SC-005**: User satisfaction survey shows "I can easily verify item sources" score ≥ 4.3/5.0
- **SC-006**: Report generation includes source metadata for 100% of items (sender, date, subject)

#### Data Integrity & Transparency
- **SC-007**: All index anomalies (missing Message-ID, extraction failures) are logged and visible in the processing summary
- **SC-008**: 100% of users can identify when an item has traceability issues (clear visual marking)
- **SC-009**: Audit log captures 100% of index anomalies with sufficient detail for diagnosis

#### Cross-Client Compatibility
- **SC-010**: Deep links successfully open the correct email in ≥ 95% of cases for supported email clients (Thunderbird, Apple Mail)
- **SC-011**: Fallback mechanism (file path display) activates in 100% of cases when email client is unsupported or unavailable

## Assumptions

1. **Email Storage**: Emails are stored locally in standard formats (mbox, Maildir, or similar) accessible by the system
2. **Message-ID Availability**: Most emails comply with RFC 5322 and contain Message-ID headers; non-compliant emails are rare exceptions
3. **Email Client Detection**: The system can detect the default email client from OS configuration (registry on Windows, defaults on macOS/Linux)
4. **Deep Link Protocols**: Major email clients (Thunderbird, Apple Mail) support URL schemes for deep linking to specific messages
5. **User Workflow**: Users primarily use a desktop email client; mobile client access is a lower priority for V1.0

## Dependencies

- **Email Parsing Module**: Must provide access to raw email headers for Message-ID extraction
- **Configuration System**: Must allow users to specify their preferred email client and email storage locations
- **Report Generation Module**: Must support display of source metadata and interactive elements (deep links, buttons)
- **Logging System**: Must capture index anomalies in audit logs

## Out of Scope for V1.0

- Web-based email clients (Gmail, Outlook Web) - deep linking to web interfaces
- Mobile email client integration (iOS Mail app, Android email clients)
- Automatic duplicate detection across multiple email folders
- Message-ID repair or heuristic generation for missing IDs
- Real-time email monitoring - this feature processes batches of emails on-demand
