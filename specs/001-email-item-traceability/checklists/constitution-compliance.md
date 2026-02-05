# Constitution Compliance & Requirements Quality Checklist

**Purpose**: Validate constitution adherence and requirement quality for the Email Item Traceability & Verification System
**Created**: 2026-02-05
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [tasks.md](../tasks.md)
**Constitution**: [.specify/memory/constitution.md](../../../../.specify/memory/constitution.md)

**Note**: This checklist tests REQUIREMENT QUALITY (are requirements well-written?), NOT implementation behavior (does the system work correctly?). Each item validates whether specifications are complete, clear, consistent, and measurable.

---

## Principle I: Privacy-First Architecture

- [ ] CHK001 Is the explicit disclosure requirement for remote mode first launch clearly specified with exact text/content? [Completeness, Constitution Principle I]
- [ ] CHK002 Are the specific data transmission scopes disclosed to users documented in requirements? [Completeness, Spec §FR-030]
- [ ] CHK003 Is the default remote mode on first launch explicitly required in functional requirements? [Clarity, Spec §FR-031]
- [ ] CHK004 Are the network-layer blocking requirements for local mode quantified with specific technical implementation details? [Clarity, Spec §FR-040]
- [ ] CHK005 Is the "no cloud backup, no cross-device sync" prohibition explicitly stated as a requirement with acceptance criteria? [Completeness, Constitution Principle I]
- [ ] CHK006 Are the device binding data loss scenarios clearly documented with user-facing messaging requirements? [Completeness, Spec §FR-047]
- [ ] CHK007 Is the distinction between local-only and remote mode data transmission requirements unambiguous and measurable? [Clarity, Spec §FR-030]

## Principle II: Anti-Hallucination Mechanism

- [ ] CHK008 Is the mandatory source association requirement (source_email_indices, evidence, confidence) specified for ALL extracted items without exception? [Completeness, Spec §FR-014]
- [ ] CHK009 Is the Zod schema validation requirement for source_status field explicitly documented with field values? [Clarity, Spec §FR-015]
- [ ] CHK010 Is the "degradation instead of loss" requirement clearly specified with confidence cap and tagging behavior? [Clarity, Spec §FR-018]
- [ ] CHK011 Is the confidence calculation formula (rules 50% + LLM 50%) unambiguous and mathematically precise? [Clarity, Spec §FR-009]
- [ ] CHK012 Is the schema failure adjustment (rules 60% + LLM 20%) explicitly documented as a separate requirement? [Completeness, Spec §FR-010]
- [ ] CHK013 Are the many-to-many email-item relationship requirements specified with entity/table structure? [Completeness, Constitution Principle II]
- [ ] CHK014 Is the "[来源待确认]" tag requirement consistently applied across all low-confidence scenarios? [Consistency, Spec §FR-011]

## Principle III: Data Minimization & Retention

- [ ] CHK015 Is the immediate body cleanup requirement quantified with specific timing (e.g., "immediately after processing")? [Clarity, Spec §FR-044]
- [ ] CHK016 Are the metadata retention fields explicitly enumerated (sender hash, desensitized subject, timestamp, attachment list)? [Completeness, Spec §FR-041]
- [ ] CHK017 Is the default 90-day retention period clearly specified as a requirement, not just an assumption? [Clarity, Spec §FR-041]
- [ ] CHK018 Are the configurable retention period options (30/90/180/365/-1) explicitly documented with -1 = permanent defined? [Completeness, Spec §FR-042, US3 Scenario 4]
- [ ] CHK019 Are the field-level encryption requirements (AES-256-GCM) specified with exact algorithm and scope? [Clarity, Spec §FR-045]
- [ ] CHK020 Is the device-bound key storage requirement (safeStorage API, no user password) explicitly stated? [Completeness, Spec §FR-046]
- [ ] CHK021 Is the "no recovery path" data loss scenario clearly documented with user messaging requirements? [Completeness, Spec §FR-047, Edge Cases]
- [ ] CHK022 Are the feedback data retention requirements aligned with email metadata retention (including -1 permanent option)? [Consistency, Spec §FR-026, §FR-027]

## Principle IV: Mode Switching & Network Isolation

- [ ] CHK023 Is the hot mode switching requirement (wait for batch completion, NO restart) explicitly specified? [Clarity, Spec §FR-033, Plan §I]
- [ ] CHK024 Is the queue behavior during mode switch clearly documented with state management requirements? [Completeness, Spec §FR-034]
- [ ] CHK025 Is the "no auto-degradation from local to remote" prohibition explicitly stated as a MUST NOT requirement? [Completeness, Spec §FR-037]
- [ ] CHK026 Are the network interceptor requirements (physical blocking at network layer) specified with measurable implementation criteria? [Clarity, Spec §FR-040]
- [ ] CHK027 Is the auto-update behavior difference between remote (startup check) and local (manual trigger) modes clearly specified? [Clarity, Spec §FR-038, §FR-039]
- [ ] CHK028 Is the local mode failure blocking requirement explicit with user-facing error messages? [Completeness, Spec §FR-036]

## Principle V: Testing & Quality Standards

- [ ] CHK029 Is the test pyramid split (60% unit, 40% integration) explicitly specified as a requirement? [Clarity, Constitution Principle V]
- [ ] CHK030 Are the coverage threshold requirements (≥85% line, ≥80% branch, 100% for security modules) quantified and measurable? [Measurability, Constitution Principle V]
- [ ] CHK031 Is the Red-Green-Refactor test-first enforcement requirement documented as a mandatory process? [Completeness, Constitution Principle V]
- [ ] CHK032 Are the QuickJS sandbox escape testing scenarios (20+) explicitly enumerated with specific escape vectors? [Completeness, Constitution Principle V]
- [ ] CHK033 Is the IPC whitelist validation requirement (exactly 6 channels) specified as a testable requirement? [Completeness, Tasks §T109a, Constitution Development Workflow]
- [ ] CHK034 Are the security-critical modules (encryption, validation, desensitization, sandbox) explicitly listed for 100% branch coverage? [Completeness, Constitution Principle V]

## Principle VI: Single Instance & Concurrency Control

- [ ] CHK035 Is the single-instance lock requirement (app.requestSingleInstanceLock()) explicitly specified? [Clarity, Spec §FR-059]
- [ ] CHK036 Is the second-instance quit behavior clearly documented with no ambiguity? [Completeness, Spec §FR-060]
- [ ] CHK037 Are the window focus and user notification requirements for second-instance launch attempts specified? [Completeness, Spec §FR-061]
- [ ] CHK038 Is the SQLite corruption prevention rationale clearly connected to single-instance requirements? [Traceability, Constitution Principle VI]

## Principle VII: Observability & Performance

- [ ] CHK039 Is the structured logging format requirement explicitly specified with field requirements (error type, module, message, timestamp, context ID)? [Clarity, Spec §FR-053]
- [ ] CHK040 Are the performance benchmark requirements quantified with specific metrics (<100ms for 1000 reports, <500ms for 100 decrypt)? [Measurability, SC-016, SC-017]
- [ ] CHK041 Are the resource limits (20MB email, 100k char truncation, 50 email batches, 128MB QuickJS, 5s timeout) explicitly enumerated? [Completeness, Spec §FR-056-§FR-058]
- [ ] CHK042 Is the memory cleanup requirement (Buffer.fill(0) after sensitive data use) specified as a mandatory practice? [Completeness, Constitution Principle VII]
- [ ] CHK043 Are the database optimization requirements (WAL mode, synchronous=NORMAL, transactions) explicitly documented? [Clarity, Constitution Principle VII]

## Functional Requirements Quality

### Completeness

- [ ] CHK044 Are all 6 user stories (US1-US6) specified with acceptance criteria and independent tests? [Coverage, Spec §User Scenarios]
- [ ] CHK045 Are all 61 functional requirements (FR-001 through FR-061) mapped to user stories or tasks? [Traceability, Spec §Requirements]
- [ ] CHK046 Is the FR-004A requirement (no deep linking, display-only file paths) clearly specified? [Completeness, Spec §FR-004A]
- [ ] CHK047 Is the report footer skip count display requirement (FR-055) addressed in functional requirements? [Gap, identified in analysis]
- [ ] CHK048 Are the subject truncation indicator requirements (ellipsis for >30 chars) explicitly documented? [Gap, identified in analysis]
- [ ] CHK049 Are the timezone handling requirements (UTC to user-local conversion) clearly specified? [Gap, identified in analysis]

### Clarity & Measurability

- [ ] CHK050 Is "light yellow background" quantified with specific color codes or design tokens? [Clarity, Spec §US2 Scenario 3]
- [ ] CHK051 Is the "small text" label size requirement quantified with specific font sizes or percentages? [Clarity, Spec §FR-011]
- [ ] CHK052 Is the 60-second email location success criterion (SC-003) objectively measurable? [Measurability, Spec §SC-003]
- [ ] CHK053 Are the Message-ID extraction rate targets (≥95%, ≥85%, ≥90%) consistently specified across all format requirements? [Consistency, Spec §FR-008]
- [ ] CHK054 Is the search string format (`from:subject:"snippet" date:YYYY-MM-DD) unambiguous and compatible with major email clients? [Clarity, Spec §FR-003]
- [ ] CHK055 Are the confidence threshold boundaries (≥0.8, 0.6-0.79, <0.6) mathematically precise with no overlap? [Measurability, Spec §FR-011]

### Consistency & Alignment

- [ ] CHK056 Are the confidence display requirements consistent between US2 acceptance scenarios and FR-011? [Consistency, Spec §US2, §FR-011]
- [ ] CHK057 Do the feedback retention requirements in US3 align with FR-026 and FR-027? [Consistency, Spec §US3, §FR-026]
- [ ] CHK058 Is the -1 permanent retention option consistently specified for both email metadata and feedback data? [Consistency, Spec §FR-042, §FR-026]
- [ ] CHK059 Do the mode switching requirements in US5 align with FR-033 through FR-040? [Consistency, Spec §US5, §FR-033-§FR-040]
- [ ] CHK060 Are the duplicate detection requirements consistent between FR-008A and Edge Cases section? [Consistency, Spec §FR-008A, Edge Cases]

### Edge Cases & Exception Handling

- [ ] CHK061 Are requirements specified for all email format edge cases (corrupted files, missing Message-ID, short content)? [Coverage, Spec §Edge Cases]
- [ ] CHK062 Are the LLM timeout and retry requirements explicitly documented with retry counts and fallback behavior? [Completeness, Spec §Edge Cases, §FR-017]
- [ ] CHK063 Is the device key loss scenario clearly documented with user messaging and application behavior? [Completeness, Spec §Edge Cases]
- [ ] CHK064 Are the mode switching edge cases (idle state switch, multiple switch requests, local LLM mid-batch failure) specified? [Coverage, Spec §Edge Cases]
- [ ] CHK065 Is the feedback data corruption scenario addressed with clear requirements? [Coverage, Spec §Edge Cases]
- [ ] CHK066 Are the manual cleanup button requirements (30-day cleanup regardless of retention setting) clearly specified? [Completeness, Spec §FR-048]

### Non-Functional Requirements

- [ ] CHK067 Are all performance requirements (SC-014 through SC-017) quantified with specific metrics? [Measurability, Spec §Success Criteria]
- [ ] CHK068 Are the security requirements (encryption, key management, network isolation) specified with exact algorithms and protocols? [Clarity, Spec §FR-045, §FR-040]
- [ ] CHK069 Are the accessibility requirements for the feedback system (tooltips, keyboard navigation) explicitly documented? [Gap, Spec §US3]
- [ ] CHK070 Are the internationalization requirements (Chinese/English UI language support) specified? [Gap, Assumptions §8]
- [ ] CHK071 Is the error logging requirement (structured format with specific fields) clearly specified? [Clarity, Spec §FR-053]

### Dependencies & Assumptions

- [ ] CHK072 Is the assumption of email client search string compatibility validated with specific client examples? [Assumption, Spec §Assumptions §2]
- [ ] CHK073 Are the external LLM service dependencies (remote mode API availability) documented with failure handling? [Dependency, Spec §FR-030]
- [ ] CHK074 Is the local LLM service (Ollama) installation requirement clearly communicated to users? [Dependency, Spec §Assumptions §3]
- [ ] CHK075 Are the system keyring availability requirements for different operating systems specified? [Completeness, Spec §Assumptions §4]
- [ ] CHK076 Is the assumption of "60% .eml, 25% .msg format distribution" documented with rationale? [Assumption, Spec §Assumptions §7]

### Traceability & Coverage

- [ ] CHK077 Does every functional requirement (FR-001 through FR-061) map to at least one task in tasks.md? [Coverage, Analysis: 60/61 = 98%]
- [ ] CHK078 Is the missing task coverage for report footer skip count (FR-055) identified as a gap? [Gap, identified in analysis]
- [ ] CHK079 Do all success criteria (SC-001 through SC-027) map to specific functional requirements or user stories? [Traceability, Spec §Success Criteria]
- [ ] CHK080 Are the first-run disclosure tasks (T018a, T018b) explicitly linked to Constitution Principle I? [Traceability, Plan §I, Tasks §T018a]
- [ ] CHK081 Is the IPC whitelist validation task (T109a) explicitly linked to Constitution Principle V? [Traceability, Plan §V, Tasks §T109a]

### Acceptance Criteria Quality

- [ ] CHK082 Are all user story acceptance scenarios specified in Given-When-Then format with observable outcomes? [Measurability, Spec §User Scenarios]
- [ ] CHK083 Are the independent tests for each user story objectively verifiable without implementation details? [Measurability, Spec §User Scenarios]
- [ ] CHK084 Can the "90% of users locate email within 60 seconds" criterion (SC-003) be tested with measurable methodology? [Measurability, Spec §SC-003]
- [ ] CHK085 Are the confidence display requirements (visual indicators, summary banner) objectively verifiable? [Measurability, Spec §FR-011, §FR-012]
- [ ] CHK086 Are the feedback privacy requirements (local-only, encrypted, no network traffic) testably specified? [Measurability, Spec §FR-023, §FR-024]

---

## Recent Remediation Validation

- [ ] CHK087 Is the FR-004A requirement (no deep linking) correctly added and referenced in plan.md? [Completeness, Spec §FR-004A, Plan §14]
- [ ] CHK088 Are the T018a and T018b tasks (first-run disclosure) correctly specified with constitution references? [Completeness, Tasks §T018a, §T018b]
- [ ] CHK089 Is the T109a task (IPC whitelist validation) correctly specified with exact channel list? [Completeness, Tasks §T109a]
- [ ] CHK090 Is the .txt format removal from FR-013 correctly reflected across all documents? [Consistency, Spec §FR-013]
- [ ] CHK091 Is the feedback retention -1 permanent option consistently specified across spec, plan, and tasks? [Consistency, Spec §FR-026, Tasks §T059]

---

## Summary

**Total Items**: 91
**Focus Areas**: Constitution compliance (Principles I-VII), functional requirements quality, traceability
**Depth**: Standard (comprehensive coverage of all 7 constitutional principles)
**Audience**: Requirements reviewer, implementation team, constitution compliance validator
**Timing**: Pre-implementation gate (must pass before `/speckit.implement`)

**Critical Gaps Identified**:
- FR-055 report footer skip count display requirement missing task coverage
- Subject truncation indicator (ellipsis) not specified
- Timezone handling requirements not clarified
- Accessibility requirements not fully documented
- Internationalization requirements not specified

**Constitution Compliance Status**: ✅ All 7 principles addressed with requirements
