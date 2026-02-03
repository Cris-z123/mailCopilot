# Research: Email Item Traceability & Verification System

**Feature**: Email Item Traceability & Verification System
**Date**: 2026-02-03
**Status**: Phase 0 Complete

## Overview

This document captures research findings and technology decisions for the email item traceability system. All research questions from the implementation plan have been resolved.

## Research Findings

### R1: OpenAI SDK vs Raw Fetch API for LLM Integration

**Decision**: Use OpenAI SDK (official library)

**Rationale**:
1. **Type Safety**: Generated TypeScript types eliminate runtime errors from manual response parsing
2. **Built-in Retry Logic**: Automatic exponential backoff with configurable maxRetries (default 2 per plan.md R0-5)
3. **Structured Output**: Native JSON mode (`response_format: { type: 'json_object' }`) ensures valid response structure
4. **Error Classification**: Automatic detection of rate limits, timeouts, and network errors
5. **Maintenance**: Officially maintained by OpenAI, updates track API changes
6. **Streaming Support**: Future upgrade path for streaming responses

**Alternatives Considered**:
- **Raw fetch API**: Rejected due to manual error handling, manual retry logic, vulnerability to LLM output format changes
- **axios**: Rejected due to lack of OpenAI-specific features (JSON mode, built-in retries)

**Implementation Notes**:
```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.endpoint, // Custom endpoint support
  timeout: 30000, // 30s per FR-057
  maxRetries: 2, // 2 retries per R0-5
});

const response = await client.chat.completions.create({
  model: 'gpt-4-turbo-preview',
  messages: [...],
  response_format: { type: 'json_object' }, // Structured output
});
```

**Reference**: [OpenAI Node.js SDK Documentation](https://github.com/openai/openai-node)

---

### R2: Email Format Parsing Libraries

**Decision**: Use format-specific libraries for each email type

**Rationale**:
1. **.eml (RFC 5322)**: mailparser (already in dependencies) - battle-tested, handles MIME parsing
2. **.msg (Outlook)**: msg-extractor (optional dependency) - supports Outlook msg format
3. **.pst/.ost (Outlook Archive)**: libpff (optional dependency) - handles Outlook archives
4. **.mbox (Unix)**: mailparser with custom delimiter logic - standard mbox format
5. **.html (Exported)**: Custom parser with cheerio - basic metadata extraction

**Alternatives**:
- **Unified library approach**: Rejected due to format complexity and maintenance burden
- **Cloud-based parsing**: Rejected due to privacy requirements (constitution Principle I)

**Message-ID Extraction Rates** (per spec.md FR-008):
- .eml: ≥95% (standard RFC 5322 headers)
- .msg: ≥85% (Outlook variability)
- .pst/.ost: ≥90% (archived emails)
- .mbox: ≥95% (standard format)
- .html: ~30% (limited metadata)

---

### R3: Duplicate Detection Algorithm

**Decision**: SHA-256 fingerprint of Message-ID + Date + From fields

**Rationale**:
1. **Collision Resistance**: SHA-256 provides near-zero collision probability
2. **Performance**: O(1) hash lookup vs O(n) content comparison
3. **Privacy**: Hash eliminates storage of sensitive email addresses
4. **Fallback**: Works with missing Message-ID (uses available fields)

**Algorithm** (per plan.md R0-4):
```typescript
import { createHash } from 'crypto';

function computeEmailHash(
  message_id: string | undefined,
  date: string,
  from: string
): string {
  const idPart = message_id || 'no-message-id';
  const datePart = date || new Date().toISOString();
  const fromPart = from || 'unknown-sender';

  const hashInput = `${idPart}${datePart}${fromPart}`;
  return createHash('sha256').update(hashInput).digest('hex');
}
```

**Detection Strategy**:
- **Same-batch**: In-memory Set of hashes, skip entirely
- **Cross-batch**: Database query by hash, update `last_seen_at` timestamp

**Alternatives Considered**:
- **Content hashing**: Rejected due to body content retention (violates data minimization)
- **Message-ID only**: Rejected due to missing Message-ID in forwarded emails

---

### R4: Local LLM Integration (Ollama)

**Decision**: Use fetch API for Ollama's `/api/generate` endpoint

**Rationale**:
1. **Ollama API**: Simple HTTP API, no official SDK
2. **Lightweight**: Fetch API sufficient for POST requests
3. **No Retry Logic**: Per FR-037, local mode failures should block (no auto-degradation)
4. **OpenAI-Compatible**: Ollama provides OpenAI-compatible API endpoint (`/v1/chat/completions`)

**Implementation Notes**:
```typescript
const response = await fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'llama2',
    prompt: systemPrompt + '\n\n' + userPrompt,
    stream: false,
  }),
});

// OR use OpenAI-compatible endpoint
const ollamaClient = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama', // Required but ignored
});
```

**Health Check**: GET http://localhost:11434/api/tags (list available models)

---

### R5: Database Schema Design

**Decision**: SQLite with better-sqlite3 and field-level encryption

**Rationale**:
1. **Embedded**: No separate database server, single-file storage
2. **Performance**: WAL mode enables concurrent reads during writes
3. **Encryption**: AES-256-GCM field-level encryption for sensitive data
4. **Type Safety**: TypeScript interfaces + Zod schema validation

**Schema Overview**:

| Table | Purpose | Encryption |
|-------|---------|------------|
| `email_sources` | Email metadata and traceability | None (metadata only) |
| `action_items` | Extracted todo items | Content encrypted |
| `user_feedback` | User accuracy feedback | All fields encrypted |
| `daily_reports` | Generated daily reports | Full JSON encrypted |
| `data_retention` | User retention preferences | None (config only) |

**Key Relationships**:
- `action_items` → `email_sources` (many-to-many via `item_email_refs`)
- `action_items` → `user_feedback` (one-to-many)
- `action_items` → `daily_reports` (many-to-one)

---

### R6: Rule Engine Sandbox

**Decision**: QuickJS (WASM) with zero-permission sandbox

**Rationale**:
1. **Security**: Zero-permission sandbox prevents file/network access
2. **Performance**: WASM execution ~2x slower than native but acceptable for simple rules
3. **Memory Limit**: 128MB limit enforced (per FR-058)
4. **Timeout**: 5s execution timeout (per FR-056)

**Alternatives Considered**:
- **Node.js vm module**: Rejected due to security concerns (escape vulnerabilities)
- **isolated-vm**: Rejected due to native compilation complexity
- **Deno**: Rejected due to framework incompatibility with Electron

**Rule Example**:
```javascript
// Rule: Detect deadline keywords
function execute(email) {
  const deadlineKeywords = ['deadline', 'due date', '截止', '到期'];
  const body = email.body.toLowerCase();
  const hasDeadline = deadlineKeywords.some(kw => body.includes(kw));

  return {
    score: hasDeadline ? 80 : 0,
    evidence: hasDeadline ? 'Found deadline keyword' : 'No deadline',
  };
}
```

---

### R7: Confidence Scoring Algorithm

**Decision**: Dual-engine weighted average with degradation fallback

**Algorithm**:
```
Normal Mode:
  confidence = (rule_score × 0.5) + (llm_score × 0.5)

Degradation Mode (after LLM validation failure):
  confidence = (rule_score × 0.6) + (llm_score × 0.2)
  confidence = min(confidence, 0.6)  // Cap at 60%
```

**Rationale**:
1. **Dual Validation**: Rule engine provides domain confidence, LLM provides semantic confidence
2. **Equal Weighting**: Prevents over-reliance on either engine
3. **Degradation**: Reduces LLM weight on validation failure while maintaining utility
4. **Capping**: Ensures degraded items are flagged for user review

**Score Sources**:
- **Rule Engine**: Keyword density, sender whitelist, deadline detection (0-100)
- **Remote LLM**: Output logprobs from OpenAI API (0-100)
- **Local LLM**: Schema completeness + keyword coherence (0-100)

---

### R8: Encryption Strategy

**Decision**: AES-256-GCM field-level encryption with device-bound keys

**Rationale**:
1. **Field-Level**: Encrypt only sensitive fields (email bodies, feedback, reports)
2. **AES-256-GCM**: Authenticated encryption prevents tampering
3. **Device Binding**: Keys stored in system keyring via Electron safeStorage
4. **No Recovery**: Intentional data loss on device change (per constitution Principle III)

**Implementation**:
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function encrypt(plaintext: string, key: Buffer): { encrypted: string; iv: string } {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted + authTag.toString('hex'),
    iv: iv.toString('hex'),
  };
}
```

**Key Storage**:
```typescript
import { safeStorage } from 'electron';

const key = safeStorage.encryptString('device-bound-key-32-bytes');
```

---

### R9: Date Handling Strategy

**Decision**: Use date-fns v4.x for all date operations

**Rationale**:
1. **Type Safety**: Full TypeScript support
2. **Immutable**: Pure functions prevent accidental mutation
3. **Tree-shakeable**: Small bundle size with modern bundlers
4. **Timezone Support**: Proper UTC/local timezone conversion
5. **Consistency**: Already in dependencies (v4.0.0)

**Alternatives Considered**:
- **Native Date**: Rejected due to mutation bugs and poor API
- **Luxon**: Rejected due to larger bundle size
- **Day.js**: Rejected due to plugin complexity for timezone support

**Usage Examples**:
```typescript
import { format, parseISO, differenceInDays } from 'date-fns';
import { utcToZonedTime } from 'date-fns/utcToZonedTime';

// Format for display
const formatted = format(date, 'yyyy-MM-dd HH:mm:ss');

// Timezone conversion
const zoned = utcToZonedTime(utcDate, userTimezone);

// Retention calculation
const ageInDays = differenceInDays(new Date(), parsedDate);
```

---

### R10: Testing Strategy

**Decision**: Vitest with 60% unit tests, 40% integration tests

**Rationale**:
1. **Native ESM**: Vitest supports TypeScript + ESM out-of-box
2. **Performance**: Faster test execution than Jest
3. **Compatibility**: Works with Vite build system
4. **Coverage**: Built-in coverage with c8

**Coverage Requirements**:
- Overall: 85% line coverage, 80% branch coverage
- Security-critical: 100% branch coverage (encryption, validation, sandbox)
- Integration: 40% of total tests (database operations, IPC, LLM adapters)

**Test Structure**:
```
tests/
├── unit/              # 60% - Pure functions, utilities
│   ├── email/
│   ├── llm/
│   ├── encryption/
│   └── rules/
└── integration/       # 40% - Database, IPC, LLM
    ├── database/
    ├── llm/
    └── ipc/
```

---

## Technology Stack Summary

| Component | Technology | Version | Justification |
|-----------|-----------|---------|---------------|
| **LLM Integration** | OpenAI SDK | ^4.0.0 | Type safety, built-in retries, JSON mode |
| **Local LLM** | Ollama API | Latest | OpenAI-compatible endpoint |
| **Database** | better-sqlite3 | ^11.10.0 | Embedded, WAL mode, TypeScript |
| **Encryption** | Node.js crypto | Built-in | AES-256-GCM support |
| **Validation** | Zod | ^3.22.4 | Runtime type validation |
| **Date Handling** | date-fns | ^4.0.0 | Immutable, timezone support |
| **Email Parsing** | mailparser | ^3.6.5 | MIME parsing, attachments |
| **Rule Sandbox** | QuickJS WASM | Latest | Zero-permission sandbox |
| **Testing** | Vitest | ^3.2.4 | Native ESM, fast execution |

---

## Unresolved Questions

**None** - All research questions from Phase 0 have been resolved.

---

## Next Steps

**Phase 1**: Design & Contracts
1. Generate `data-model.md` with entity definitions
2. Generate `/contracts/` with API specifications
3. Generate `quickstart.md` with developer onboarding guide
4. Update agent context with new OpenAI SDK dependency

**Phase 2**: Task Breakdown (via `/speckit.tasks` command)
1. Generate actionable task list from design artifacts
2. Assign tasks to implementation phases
3. Define acceptance criteria for each task

---

**Research Complete**: 2026-02-03
**All Clarifications Resolved**: ✅
