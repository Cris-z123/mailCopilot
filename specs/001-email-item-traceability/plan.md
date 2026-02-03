# Implementation Plan: Email Item Traceability & Verification System

**Branch**: `001-email-item-traceability` | **Date**: 2026-02-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-email-item-traceability/spec.md`

## Summary

Implement a comprehensive email action item extraction system with 100% source traceability, dual-mode LLM processing (local/remote), and privacy-first architecture. The system extracts actionable items from emails while maintaining verifiable links to source emails through Message-ID/SHA-256 fingerprinting, implements confidence scoring with dual-engine validation (rule engine + LLM), and provides user feedback mechanisms stored locally with AES-256-GCM encryption.

## Technical Context

**Language/Version**: TypeScript 5.4 + Node.js 20.x
**Primary Dependencies**:
- Electron 29.4.6 (cross-platform desktop framework)
- better-sqlite3 11.10.0 (embedded database)
- OpenAI SDK (latest) - **NEW: Using official OpenAI library for LLM integration**
- Zod 3.22.4 (runtime schema validation)
- date-fns 4.0.0 (date handling)
- mailparser 3.6.5 (email parsing)
- QuickJS (WASM) (rule engine sandbox)

**Storage**: better-sqlite3 with field-level AES-256-GCM encryption, WAL mode
**Testing**: Vitest 3.2.4 with unit (60%) and integration (40%) test coverage, minimum 85% line coverage
**Target Platform**: Desktop (Windows 10+, macOS 10.15+, Linux)
**Project Type**: Electron desktop application (main process + renderer process)
**Performance Goals**:
- 1000 daily report queries <100ms
- Process 50 emails ~18s (remote) / ~35s (local 7B)
- Bulk decrypt 100 items <500ms
- Email metadata extraction <100ms per email

**Constraints**:
- Single instance execution (SQLite corruption prevention)
- TLS 1.3 for remote LLM calls via OpenAI SDK
- 30s timeout per LLM request (FR-057)
- 2-retry limit with exponential backoff (R0-5)
- 128MB QuickJS memory limit, 5s execution timeout
- Email size limit 20MB, body truncation 100k chars
- Batch maximum 50 emails

**Scale/Scope**:
- Single-user desktop application
- Support for 5 email formats (.eml, .msg, .pst, .mbox, .html)
- Daily report generation with item traceability
- Local-only data storage with device-bound encryption

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I: Privacy-First Architecture
✅ **COMPLIANT** - Implementation plan includes:
- Default remote mode with explicit disclosure of data transmission
- Local mode support with Ollama integration
- No cloud backup, all data device-bound
- Network-layer blocking in local mode

### Principle II: Anti-Hallucination Mechanism
✅ **COMPLIANT** - Implementation plan includes:
- Mandatory `source_email_indices` in LLM output
- Zod schema validation with degradation fallback
- Source status field ('verified'/'unverified')
- Confidence scoring (rule engine 50% + LLM 50%)
- Items never silently dropped, only degraded

### Principle III: Data Minimization & Retention
✅ **COMPLIANT** - Implementation plan includes:
- Immediate email body cleanup after processing
- Metadata-only retention (90-day default, configurable)
- AES-256-GCM field-level encryption
- Device-bound keys via Electron safeStorage
- No recovery path (intentional design)

### Principle IV: Mode Switching & Network Isolation
✅ **COMPLIANT** - Implementation plan includes:
- Hot mode switching (wait for batch completion)
- Queue during mode transition
- No auto-degradation (local mode failures block)
- Network interceptor for local mode
- Auto-update policy differs by mode

### Principle V: Testing & Quality Standards
✅ **COMPLIANT** - Implementation plan includes:
- Unit tests (60%) and integration tests (40%)
- 85% line coverage minimum, 80% branch coverage
- 100% branch coverage for security-critical modules
- Red-Green-Refactor test-first enforcement

### Principle VI: Single Instance & Concurrency Control
✅ **COMPLIANT** - Implementation plan includes:
- `app.requestSingleInstanceLock()` on startup
- Second instance immediate quit
- Window focus on second-instance event
- Batch processing state flags

### Principle VII: Observability & Performance
✅ **COMPLIANT** - Implementation plan includes:
- Structured logging (no sensitive data)
- Performance benchmarks defined
- Resource limits enforced
- Database WAL mode optimization
- Memory clearing with `Buffer.fill(0)`

### Technology Stack Compliance
✅ **COMPLIANT** - All required technologies present:
- OpenAI SDK for LLM integration (updated from raw fetch API)
- better-sqlite3 with field-level encryption
- Zod schema validation
- QuickJS sandbox for rule engine
- mailparser for email parsing

**Constitution Status**: ✅ ALL PRINCIPLES SATISFIED - No violations requiring justification

## Project Structure

### Documentation (this feature)

```text
specs/001-email-item-traceability/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Feature specification
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
mailCopilot/
├── main/                    # Electron main process (Node.js)
│   ├── config/
│   │   └── logger.ts        # Structured logging configuration
│   ├── database/
│   │   └── entities/        # Database entities and repositories
│   │       ├── EmailSource.ts
│   │       ├── ActionItem.ts
│   │       ├── UserFeedback.ts
│   │       └── DailyReport.ts
│   ├── email/
│   │   ├── parsers/         # Email format parsers
│   │   │   ├── EmlParser.ts
│   │   │   ├── MsgParser.ts
│   │   │   ├── PstParser.ts
│   │   │   ├── MboxParser.ts
│   │   │   └── HtmlParser.ts
│   │   ├── DuplicateDetector.ts
│   │   └── EmailParser.ts   # Unified parser interface
│   ├── llm/                 # LLM integration layer
│   │   ├── LLMAdapter.ts    # LLM adapter interface
│   │   ├── RemoteLLM.ts     # Remote LLM using OpenAI SDK
│   │   ├── LocalLLM.ts      # Local LLM (Ollama)
│   │   └── OutputValidator.ts # Zod schema validation
│   ├── rules/
│   │   ├── RuleEngine.ts    # QuickJS sandbox wrapper
│   │   └── rules.ts         # Rule definitions
│   ├── encryption/
│   │   ├── CryptoManager.ts # AES-256-GCM encryption
│   │   └── KeyManager.ts    # Device-bound key storage
│   ├── ipc/
│   │   └── handlers/        # IPC channel handlers
│   └── index.ts             # Main process entry point
│
├── renderer/               # Electron renderer process (React)
│   ├── components/
│   │   ├── Report/
│   │   ├── Settings/
│   │   └── Feedback/
│   ├── stores/             # Zustand state management
│   └── utils/
│
├── shared/                 # Shared code between main/renderer
│   ├── schemas/
│   │   └── validation.ts    # Zod schemas
│   └── types/
│
└── tests/
    ├── unit/               # Unit tests (60%)
    │   ├── email/
    │   ├── llm/
    │   ├── rules/
    │   └── encryption/
    └── integration/        # Integration tests (40%)
        ├── database/
        ├── llm/
        └── ipc/
```

**Structure Decision**: Electron desktop application with clear separation between main process (Node.js) and renderer process (React). Main process handles all data operations, encryption, and LLM integration. Renderer process displays UI and communicates via IPC. Shared schemas and types ensure type safety across process boundary.

## Implementation Architecture

### Core Components

#### 1. LLM Integration Layer (main/llm/)

**UPDATED APPROACH: Using OpenAI SDK**

The LLM integration layer now uses the official OpenAI SDK instead of raw fetch API calls. This provides:

- Built-in retry logic and exponential backoff
- Automatic error handling and type safety
- Structured output support (JSON mode)
- Streaming response capability (future enhancement)
- Better TypeScript integration

**RemoteLLM Implementation (using OpenAI SDK)**:
```typescript
import OpenAI from 'openai';

export class RemoteLLM implements LLMAdapter {
  private client: OpenAI;

  constructor(config: LLMAdapterConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.endpoint, // Support for custom endpoints
      timeout: config.timeout || 30000, // 30s default per FR-057
      maxRetries: config.maxRetries || 2, // 2 retries per R0-5
    });
  }

  async generate(batch: EmailBatch): Promise<LLMOutput> {
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [
        { role: 'system', content: this.buildSystemPrompt() },
        { role: 'user', content: this.buildUserPrompt(batch) }
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' }, // Structured output
    });

    // Parse and validate response
    const output = this.parseResponse(response);
    return output;
  }
}
```

**Benefits of OpenAI SDK over raw fetch**:
1. **Type Safety**: Full TypeScript support with generated types
2. **Error Handling**: Built-in error classification (rate limits, timeouts, network errors)
3. **Retry Logic**: Automatic retries with exponential backoff (configurable)
4. **Structured Output**: Native JSON mode ensures valid response format
5. **Streaming Support**: Easy upgrade path for streaming responses
6. **Monitoring**: Built-in request ID tracking for debugging

**LocalLLM Implementation (Ollama)**:
- Uses fetch API for Ollama's `/api/generate` endpoint
- Implements same LLMAdapter interface
- No timeout auto-degradation (per FR-037: block on failure)

#### 2. Email Processing Pipeline

```
Email Import
    ↓
DuplicateDetector (SHA-256 fingerprint check)
    ↓
EmailParser (format-specific parser)
    ↓
RuleEngine (QuickJS sandbox, 50% confidence)
    ↓
LLM Adapter (Remote/Local, 50% confidence)
    ↓
OutputValidator (Zod schema + degradation)
    ↓
ActionItem creation + EmailSource storage
```

#### 3. Data Flow

```
User uploads .eml file
    ↓
[EML Parser] → ParsedEmail { message_id, from, date, subject, body }
    ↓
[DuplicateDetector] → Check SHA-256 fingerprint
    ↓
[RuleEngine] → QuickJS executes rules → ruleScore (0-100)
    ↓
[RemoteLLM] → OpenAI SDK → LLMOutput { items[], batch_info }
    ↓
[OutputValidator] → Zod validation → degrade if invalid
    ↓
[Confidence Calculator] → (ruleScore × 0.5) + (llmScore × 0.5)
    ↓
[Database] → ActionItem + EmailSource (with encryption)
```

### Key Design Decisions

#### Decision 1: OpenAI SDK vs Raw Fetch API
**Chosen**: OpenAI SDK for remote LLM integration

**Rationale**:
- Type-safe TypeScript integration eliminates runtime errors
- Built-in retry logic reduces code complexity
- Native JSON mode ensures structured output (eliminates parse errors)
- Automatic error classification (rate limits, timeouts, API errors)
- Future-proof for streaming responses and advanced features

**Trade-offs**:
- Adds ~200KB dependency vs ~0 for raw fetch
- Slightly less control over HTTP headers (mitigated by custom baseURL support)
- Vendor lock-in to OpenAI API format (mitigated by baseURL for compatible APIs)

**Rejected Alternative**: Raw fetch API
- Manual retry logic implementation (error-prone)
- Manual error type detection (maintenance burden)
- Manual JSON parsing (vulnerable to LLM hallucinations)

#### Decision 2: Dual-Engine Confidence Calculation
**Chosen**: Rule engine 50% + LLM 50% with degradation fallback

**Rationale**:
- Rule engine provides domain-specific confidence (keywords, sender whitelist)
- LLM provides semantic understanding confidence (logprobs or output quality)
- Equal weighting prevents over-reliance on either engine
- Degradation mode (rules 60%, LLM 20%) maintains utility when LLM fails

**Rejected Alternative**: LLM-only confidence
- LLM may be overconfident on hallucinations
- No fallback when LLM service unavailable
- Violates anti-hallucination principle (items dropped on LLM failure)

#### Decision 3: Duplicate Detection Before Processing
**Chosen**: SHA-256 fingerprint check before rule engine + LLM

**Rationale**:
- Avoids wasting compute resources on re-processing
- Maintains `last_seen_at` timestamp for retention policy
- Distinguishes same-batch vs cross-batch duplicates for user reporting

**Rejected Alternative**: Post-processing duplicate detection
- Wastes LLM API calls on already-processed emails
- Increases cost (remote mode) and latency (local mode)
- User must wait longer for batch completion

### Technology Additions

**New Dependency**: OpenAI SDK
```json
{
  "dependencies": {
    "openai": "^4.0.0"  // Official OpenAI Node.js SDK
  }
}
```

**Installation**: `npm install openai`

**Usage Considerations**:
- API key management via Electron safeStorage (encrypted config)
- Custom endpoint support via `baseURL` parameter
- Timeout configuration: 30s default (per FR-057)
- Max retries: 2 (per R0-5)

### Security Considerations

1. **API Key Storage**: OpenAI API key stored in encrypted config (AES-256-GCM)
2. **Network Transmission**: TLS 1.3 enforced by OpenAI SDK (default)
3. **Request Logging**: No sensitive email content in logs (desensitized subjects only)
4. **Structured Output**: JSON mode prevents prompt injection attacks
5. **Timeout Enforcement**: 30s timeout prevents resource exhaustion

### Performance Optimization

1. **Batch Processing**: Process up to 50 emails per batch (spec limit)
2. **Parallel LLM Calls**: Future enhancement - concurrent requests for independent emails
3. **Duplicate Detection**: O(1) hash lookup prevents re-processing
4. **Database WAL**: Enables concurrent reads during write operations
5. **Memory Management**: Immediate email body cleanup after processing

---

## Phase 0: Research & Technology Validation
