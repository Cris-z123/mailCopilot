<!--
Sync Impact Report:
- Version change: 1.0.0 → 1.1.0
- Modified principles:
  - Principle V (Testing & Quality Standards): Relaxed coverage requirements (85%/80% → 80%/70%)
- Added sections:
  - Technology Stack Constraints: Updated Electron version, added Tailwind CSS v3.4 and shadcn/ui
- Removed sections: None
- Templates requiring updates:
  ✅ .specify/templates/plan-template.md (Constitution Check section aligned)
  ✅ .specify/templates/spec-template.md (Functional requirements aligned)
  ✅ .specify/templates/tasks-template.md (Testing requirements aligned)
- Follow-up TODOs: None
-->

# mailCopilot Constitution

## Core Principles

### I. Privacy-First Architecture

mailCopilot MUST prioritize user privacy in all architectural decisions:

- **Default Remote Mode**: First launch defaults to remote mode with explicit disclosure of data transmission scope to third-party LLM services
- **Complete Offline Option**: Users MAY deploy local LLM services (Ollama/LocalAI) and switch to local mode with network-layer physical blocking of non-local requests
- **No Cloud Backup**: All daily reports and configurations MUST be strictly bound to the current device. Cross-device synchronization, password recovery, and cloud backup mechanisms are PROHIBITED
- **Single Device Binding**: Data access is tied to device-specific hardware environment. System reinstall or device change results in permanent data loss (by design)

**Rationale**: Privacy-sensitive email processing requires users to maintain full control over their data environment. Default remote mode provides accessibility while local mode serves high-compliance scenarios (finance, government, healthcare). The absence of cloud sync/password mechanisms eliminates attack surfaces and simplifies the security model.

### II. Anti-Hallucination Mechanism

All extracted items MUST maintain traceability to source emails. Silent data loss is PROHIBITED:

- **Mandatory Source Association**: Every extracted item MUST include `source_email_indices` (email batch index array), `evidence` (extraction rationale), and `confidence` (0-100) in LLM output
- **Zod Schema Validation**: Output MUST conform to schema with `source_status` field ('verified'/'unverified'). Items without valid sources MUST NOT be discarded
- **Degradation Instead of Loss**: Items lacking verified sources MUST be downgraded to `source_status='unverified'`, `confidence≤0.4`, and tagged "[来源待确认]" (Source Pending Confirmation)
- **Confidence Calculation**: Unified scoring with rule engine 50% + LLM 50%. On schema validation failure, adjust to rules 60% + LLM 20% (halved), capped at 0.6
- **Multi-Email Association**: Single items MAY reference multiple source emails via many-to-many relationship in `item_email_refs` table

**Rationale**: Email-derived action items require source verification for user trust. Automatic deletion of low-confidence items creates hidden data loss. Degradation with explicit tagging preserves information while signaling verification needs.

### III. Data Minimization & Retention

mailCopilot MUST minimize sensitive data retention:

- **Immediate Body Cleanup**: Original email body content MUST be cleared immediately after processing. Only metadata stored
- **Metadata-Only Retention**: Sender hash, desensitized subject, timestamp, attachment list retained for 90 days default (configurable: 30/90/180/365/-1 days, where -1 = permanent)
- **Field-Level Encryption**: Sensitive database fields (`content_encrypted`, `config_value`) MUST use AES-256-GCM encryption. Database file itself is not encrypted
- **Device-Bound Keys**: Encryption keys auto-generated on first launch, stored via Electron safeStorage in system keyring. NO user password input required
- **No Recovery Path**: Key changes due to system reinstall or device replacement result in permanent data loss (intentional design)

**Rationale**: Minimizing attack surface requires limiting stored sensitive data. Metadata-only retention enables source verification within reasonable timeframes while reducing breach impact. Device-bound encryption eliminates password management complexity and associated user security failures.

### IV. Mode Switching & Network Isolation

Local/remote mode switching MUST ensure data processing integrity:

- **Hot Mode Switching**: Mode changes via settings page MUST wait for current batch completion before applying new mode. Application restart PROHIBITED
- **Queue During Switch**: New tasks enter queue during batch processing. New mode applies after current batch completes
- **No Auto-Degradation**: Local mode LLM connection failures MUST block functionality with explicit error. Automatic fallback to remote mode PROHIBITED
- **Network Interceptor**: Local mode MUST physically block non-local requests at network layer. Remote mode permits TLS 1.3 transmission to third-party LLM endpoints
- **Update Policy**: Remote mode enables auto-update checks on startup. Local mode disables auto-checks, requires manual trigger via settings page

**Rationale**: Batch-completion-based switching prevents data corruption from mid-process mode changes. Explicit local mode failure prevents silent data leakage through unintended fallback. Network-layer blocking provides stronger isolation than application-level controls.

### V. Testing & Quality Standards

Comprehensive testing is MANDATORY before feature release:

- **Test Pyramid (No E2E)**: Unit tests 60% (utilities, security algorithms, pure functions), Integration tests 40% (database operations, IPC communication, LLM adapters, process locks)
- **Coverage Requirements**: Unit test line coverage ≥80%, branch coverage ≥70%. Security-critical modules (encryption, validation, desensitization, sandbox) MUST achieve 100% branch coverage
- **Test-First Enforcement**: Red-Green-Refactor cycle strictly enforced. Tests written → User approved → Tests fail → Implementation
- **Integration Test Focus**: New library contract tests, contract changes, inter-service communication, shared schemas
- **Security Testing**: QuickJS sandbox escape testing (20+ scenarios), SQL injection defense, memory residue detection, single-instance lock validation, LLM output degradation testing, mode switch queue testing

**Rationale**: Security-critical local application requires comprehensive validation. High coverage on security modules prevents exploitation. Absence of E2E tests reflects desktop app deployment model where integration tests provide better ROI. Relaxed coverage thresholds (80%/70% vs previous 85%/80%) balance quality with development velocity while maintaining strict security module requirements.

### VI. Single Instance & Concurrency Control

Application MUST enforce single-instance execution:

- **Single Instance Lock**: Use `app.requestSingleInstanceLock()` on startup. Second instance MUST quit immediately
- **Window Focus**: Second-instance events MUST focus existing window with user notification
- **Database Safety**: Single-instance enforcement prevents SQLite concurrent write corruption
- **Batch Processing State**: Mode switches and batch processing MUST use state flags to prevent race conditions

**Rationale**: SQLite corruption risk from concurrent writes requires single-instance guarantee. User experience benefits from explicit notification rather than silent failure.

### VII. Observability & Performance

Structured logging and performance monitoring are MANDATORY:

- **Structured Logging**: All events MUST use structured logging format. Sensitive data in logs PROHIBITED
- **Performance Benchmarks**: 1000 daily report queries <100ms, bulk decrypt 100 items <500ms, process 50 emails ~35s (local 7B) / ~18s (remote)
- **Resource Limits**: Email size limit 20MB, body truncation 100k chars, batch max 50 emails, QuickJS memory limit 128MB, execution timeout 5s
- **Database Optimization**: WAL mode enabled, `synchronous = NORMAL`, all writes wrapped in transactions
- **Memory Management**: Sensitive data MUST be cleared with `Buffer.fill(0)` immediately after use

**Rationale**: Desktop application performance directly impacts user productivity. Resource limits prevent system overload. Structured logs enable troubleshooting while protecting user privacy.

## Data Security Requirements

### Device Binding & Data Loss Scenarios

| Scenario | Policy | User Impact |
|----------|--------|-------------|
| **App Uninstall** | Preserve data directory (`~/.mailcopilot/`), reinstall restores data | Same-device reinstall can recover history |
| **System Reinstall** | System keyring reset, key lost, data undecryptable | **Historical data permanently lost** (intentional) |
| **Device Replacement** | Key bound to original device, new device cannot read old database | **Historical data permanently lost** (intentional) |
| **Export Files** | Plaintext generation, user-managed storage | Exported file security is user responsibility |
| **Email Processing** | Body cleared immediately, metadata retained 90 days (configurable to permanent) | Source verification available within retention period |

### Encryption & Key Management

- **Key Generation**: Random 256-bit key generated on first launch, stored via Electron safeStorage API
- **Encryption Algorithm**: AES-256-GCM for sensitive database fields
- **Key Binding**: Keys bound to system user account + hardware environment. No export/migration capability
- **Configuration Integrity**: HMAC-SHA256 signing prevents tampering with user configurations

## Development Workflow

### Code Quality Gates

All pull requests MUST verify:

- Constitution compliance (this document)
- Test coverage meets minimum thresholds (≥80% line, ≥70% branch)
- Security-critical modules have 100% branch coverage
- No unencrypted sensitive data in database fields
- IPC channel whitelist compliance (6 channels max: `llm:generate`, `db:query:history`, `db:export`, `config:get/set`, `app:check-update`, `email:fetch-meta`)
- CSP policy compliance (`default-src 'self'; script-src 'self'; connect-src 'self' https://api.github.com` for remote, `'self'` for local)

### Technology Stack Constraints

| Component | Technology | Security Constraints |
|-----------|-----------|---------------------|
| **Cross-Platform Framework** | Electron 29.4.6 | sandbox enabled, contextIsolation enforced, single-instance lock |
| **Frontend Styling** | Tailwind CSS v3.4 + shadcn/ui | Utility-first CSS, component library for consistent UI |
| **Frontend Framework** | React 18 + TypeScript 5.4 | Error boundary isolation, Zod runtime validation |
| **State Management** | Zustand 4.4 | In-memory encryption for sensitive state, clear on page unload |
| **Database** | better-sqlite3 11.10.0 | Field-level AES-256-GCM encryption, WAL mode |
| **Configuration** | JSON Schema + Ajv | HMAC-SHA256 signature anti-tampering |
| **Rule Execution** | QuickJS (WASM) | Zero-permission sandbox, 128MB memory limit, 5s timeout |
| **LLM Output Validation** | Zod Schema | Structured output validation, auto-retry (max 2x), fallback to unverified |
| **Email Import** | imapflow + mailparser | TLS 1.3 enforced, 20MB size limit |
| **Format Extensions** | msg-extractor / libpff | Local library parsing, no cloud upload |
| **Export** | Internal template + puppeteer | Plaintext export, security warning before export |
| **Auto-Update** | electron-updater | GitHub Releases, mandatory code signature verification |

### Error Handling Standards

| Error Scenario | Handling Strategy | User Message |
|----------------|-------------------|--------------|
| **Database Key Read Failure** | Detect device environment change, notify data unrecoverable | "Detected device environment change. Historical data inaccessible. If device replaced or system reinstalled, historical data is permanently lost." |
| **Local LLM Connection Failure** | Block functionality, prohibit auto-degradation | "Local model service unavailable. Please verify Ollama is running on localhost:11434" |
| **LLM Output Validation Failure** | No retry, downgrade to database, mark `source_status='unverified'`, `confidence≤0.4` | Item tagged "[来源待确认]" (Source Pending Confirmation) |
| **Single Instance Conflict** | Focus existing window | "Application already running" |
| **Mode Switch Request** | Wait for current batch completion, apply new mode | "Mode will switch after current task batch completes" |

## Governance

### Amendment Process

1. Constitution supersedes all other development practices
2. Amendments require documentation, approval, and migration plan
3. Version follows semantic versioning:
   - **MAJOR**: Backward-incompatible governance/principle removals or redefinitions
   - **MINOR**: New principle/section added or material guidance expansion
   - **PATCH**: Clarifications, wording fixes, non-semantic refinements
4. All developers MUST review constitution before implementing features
5. Constitution violations in implementation plans MUST be explicitly justified in Complexity Tracking section

### Compliance Review

- Pre-implementation: Constitution check gate in plan.md (before Phase 0 research)
- Pre-commit: Verify compliance with all applicable principles
- Post-implementation: Validate adherence in code review

### Runtime Development Guidance

For detailed implementation guidance, refer to technical architecture documentation: `docs/tech-architecture.md`

**Version**: 1.1.0 | **Ratified**: 2026-01-31 | **Last Amended**: 2026-02-06
