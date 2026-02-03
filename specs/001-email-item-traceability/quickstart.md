# Quickstart Guide: Email Item Traceability System

**Feature**: Email Item Traceability & Verification System
**Date**: 2026-02-03
**Audience**: Developers joining the project

## Overview

This guide helps you quickly set up the development environment and understand the codebase architecture for the Email Item Traceability & Verification System.

## Prerequisites

### Required Software

- **Node.js**: v20.x (https://nodejs.org/)
- **npm**: v10.x (comes with Node.js)
- **Git**: Latest version (https://git-scm.com/)
- **Electron**: v29.4.6 (installed via npm)
- **TypeScript**: v5.4.5 (installed via npm)

### Optional Software (for local mode testing)

- **Ollama**: Latest version (https://ollama.ai/)
  - Required for testing local LLM mode
  - Install and run: `ollama serve`
  - Pull model: `ollama pull llama2`

## Initial Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/mailCopilot.git
cd mailCopilot
```

### 2. Install Dependencies

```bash
npm install
```

**Key Dependencies**:
- `openai@^4.0.0` - LLM integration
- `better-sqlite3@^11.10.0` - Database
- `zod@^3.22.4` - Schema validation
- `electron@^29.4.6` - Desktop framework
- `mailparser@^3.6.5` - Email parsing

### 3. Configuration

Create a local configuration file (not committed to git):

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# OpenAI API Configuration (for remote mode)
OPENAI_API_KEY=sk-...
OPENAI_ENDPOINT=https://api.openai.com/v1
OPENAI_MODEL=gpt-4-turbo-preview

# Local LLM Configuration (for local mode)
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=llama2

# Data Retention (days, -1 for permanent)
EMAIL_METADATA_RETENTION=90
FEEDBACK_RETENTION=90
```

### 4. Build Application

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### 5. Run Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Security tests
npm run test:security

# Coverage report
npm run test:coverage
```

### 6. Lint and Type Check

```bash
# Lint
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Type check
npm run typecheck
```

### 7. Start Development

```bash
# Development mode (hot reload)
npm run dev

# Production build
npm run build
npm start
```

---

## Project Structure

```
mailCopilot/
├── main/                      # Electron main process (Node.js)
│   ├── config/
│   │   └── logger.ts          # Structured logging
│   ├── database/
│   │   └── entities/          # Database entities
│   │       ├── EmailSource.ts
│   │       ├── ActionItem.ts
│   │       ├── UserFeedback.ts
│   │       └── DailyReport.ts
│   ├── email/
│   │   ├── parsers/           # Email format parsers
│   │   ├── DuplicateDetector.ts
│   │   └── EmailParser.ts
│   ├── llm/                   # LLM integration
│   │   ├── LLMAdapter.ts      # Base interface
│   │   ├── RemoteLLM.ts       # OpenAI SDK integration
│   │   ├── LocalLLM.ts        # Ollama integration
│   │   └── OutputValidator.ts # Zod validation
│   ├── rules/
│   │   ├── RuleEngine.ts      # QuickJS sandbox
│   │   └── rules.ts           # Rule definitions
│   ├── encryption/
│   │   ├── CryptoManager.ts   # AES-256-GCM
│   │   └── KeyManager.ts      # Key storage
│   └── index.ts
│
├── renderer/                  # Electron renderer (React)
│   ├── components/
│   │   ├── Report/
│   │   ├── Settings/
│   │   └── Feedback/
│   ├── stores/               # Zustand state
│   └── utils/
│
├── shared/                    # Shared code
│   ├── schemas/
│   │   └── validation.ts     # Zod schemas
│   └── types/
│
└── tests/
    ├── unit/                 # Unit tests (60%)
    └── integration/          # Integration tests (40%)
```

---

## Architecture Overview

### Email Processing Pipeline

```
User uploads .eml file
    ↓
[DuplicateDetector] → Check SHA-256 hash
    ↓
[EmailParser] → Parse email metadata
    ↓
[RuleEngine] → Execute QuickJS rules (50% confidence)
    ↓
[RemoteLLM/LocalLLM] → Extract items (50% confidence)
    ↓
[OutputValidator] → Zod validation + degradation
    ↓
[ConfidenceCalculator] → Combine scores
    ↓
[Database] → Store ActionItem + EmailSource
```

### LLM Integration

**Remote Mode** (using OpenAI SDK):
```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: config.apiKey,
  timeout: 30000,  // 30s per FR-057
  maxRetries: 2,   // 2 retries per R0-5
});

const response = await client.chat.completions.create({
  model: 'gpt-4-turbo-preview',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ],
  response_format: { type: 'json_object' }, // Structured output
});
```

**Local Mode** (using Ollama):
```typescript
// Option 1: Direct API call
const response = await fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  body: JSON.stringify({ model: 'llama2', prompt: prompt }),
});

// Option 2: OpenAI-compatible endpoint
const client = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama', // Required but ignored
});
```

### Confidence Scoring

**Normal Mode**:
```
confidence = (rule_score × 0.5) + (llm_score × 0.5)
```

**Degradation Mode** (after LLM validation failure):
```
confidence = (rule_score × 0.6) + (llm_score × 0.2)
confidence = min(confidence, 0.6)  // Cap at 60%
```

---

## Common Development Tasks

### Task 1: Add a New Email Parser

1. Create parser in `main/email/parsers/`:
```typescript
// main/email/parsers/MyFormatParser.ts
import { ParsedEmail } from './EmailParser.js';

export class MyFormatParser {
  parse(filePath: string): ParsedEmail {
    // Parse email format
    return {
      message_id: '...',
      from: '...',
      subject: '...',
      date: '...',
      body: '...',
      email_hash: '...',
    };
  }
}
```

2. Register in `main/email/EmailParser.ts`:
```typescript
import { MyFormatParser } from './parsers/MyFormatParser.js';

export class EmailParser {
  private parsers = {
    myformat: new MyFormatParser(),
    // ... other parsers
  };
}
```

3. Add tests in `tests/unit/email/MyFormatParser.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { MyFormatParser } from './main/email/parsers/MyFormatParser';

describe('MyFormatParser', () => {
  it('should parse email correctly', () => {
    const parser = new MyFormatParser();
    const result = parser.parse('test.eml');
    expect(result.from).toBe('test@example.com');
  });
});
```

### Task 2: Add a New Rule

1. Add rule in `main/rules/rules.ts`:
```javascript
// Rule: Detect high-priority keywords
function detectHighPriority(email) {
  const priorityKeywords = ['urgent', 'asap', '紧急', '优先'];
  const body = email.body.toLowerCase();

  const hasPriority = priorityKeywords.some(kw => body.includes(kw));

  return {
    score: hasPriority ? 90 : 0,
    evidence: hasPriority ? 'Found priority keyword' : 'No priority',
  };
}
```

2. Add tests in `tests/unit/rules/detectHighPriority.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { RuleEngine } from './main/rules/RuleEngine';

describe('detectHighPriority', () => {
  it('should detect urgent keyword', () => {
    const engine = new RuleEngine();
    const result = engine.execute({
      body: 'This is urgent',
    });
    expect(result.score).toBe(90);
  });
});
```

### Task 3: Modify LLM Prompt

1. Edit `main/llm/RemoteLLM.ts`:
```typescript
private buildSystemPrompt(): string {
  return `You are an email action item extraction assistant.

**CRITICAL REQUIREMENTS:**
1. Extract ONLY clear, actionable items
2. Each item MUST include source_email_indices
3. Provide confidence score (0-100)

**OUTPUT FORMAT (JSON only):**
{
  "items": [
    {
      "content": "action item text",
      "type": "completed" | "pending",
      "source_email_indices": [0, 1],
      "evidence": "explanation",
      "confidence": 85
    }
  ],
  "batch_info": {
    "total_emails": <number>,
    "processed_emails": <number>,
    "skipped_emails": <number>
  }
}`;
}
```

2. Test changes manually or update integration tests.

### Task 4: Add Database Index

1. Create migration file:
```sql
-- migrations/v12_add_action_item_confidence_index.sql
CREATE INDEX IF NOT EXISTS idx_action_items_confidence
ON action_items(confidence);
```

2. Run migration:
```bash
npm run migrate:up
```

### Task 5: Debug Email Processing

1. Enable debug logging in `.env`:
```env
LOG_LEVEL=debug
```

2. Check logs in console or file:
```bash
# Console output
npm run dev

# File output (macOS)
~/Library/Logs/mailCopilot/main.log

# File output (Windows)
%APPDATA%\mailCopilot\logs\main.log

# File output (Linux)
~/.config/mailCopilot/logs/main.log
```

3. Add custom logging:
```typescript
import { logger } from './config/logger.js';

logger.debug('MyModule', 'Processing email', {
  email_hash: '...',
  from: '...',
});
```

---

## Testing Strategy

### Unit Tests (60%)

**Purpose**: Test pure functions, utilities, and individual components

**Examples**:
- Email parser logic
- Rule engine scoring
- Encryption/decryption
- Schema validation
- Confidence calculation

**Structure**:
```
tests/unit/
├── email/
│   ├── EmlParser.test.ts
│   └── DuplicateDetector.test.ts
├── llm/
│   └── OutputValidator.test.ts
├── rules/
│   └── RuleEngine.test.ts
└── encryption/
    └── CryptoManager.test.ts
```

**Example Test**:
```typescript
import { describe, it, expect } from 'vitest';
import { DuplicateDetector } from './main/email/DuplicateDetector';

describe('DuplicateDetector', () => {
  it('should compute correct SHA-256 fingerprint', () => {
    const hash = DuplicateDetector.computeFingerprint(
      'msg-123@example.com',
      '2026-02-03T10:00:00Z',
      'sender@example.com'
    );

    expect(hash).toMatch(/^[a-f0-9]{64}$/i);
    expect(hash).toHaveLength(64);
  });
});
```

### Integration Tests (40%)

**Purpose**: Test inter-service communication, database operations, LLM adapters

**Examples**:
- Database CRUD operations
- IPC communication
- LLM adapter integration
- End-to-end email processing

**Structure**:
```
tests/integration/
├── database/
│   ├── EmailSource.test.ts
│   └── ActionItem.test.ts
├── llm/
│   ├── RemoteLLM.test.ts
│   └── LocalLLM.test.ts
└── ipc/
    └── handlers.test.ts
```

**Example Test**:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Database } from './main/database';
import { ActionItemRepository } from './main/database/entities/ActionItem';

describe('ActionItem Integration', () => {
  let db: Database;
  let repo: ActionItemRepository;

  beforeAll(() => {
    db = new Database(':memory:');
    repo = new ActionItemRepository(db);
  });

  afterAll(() => {
    db.close();
  });

  it('should create and retrieve action item', () => {
    const item = repo.create({
      content_encrypted: 'encrypted content',
      item_type: 'pending',
      confidence: 0.8,
      source_status: 'verified',
      evidence: 'test evidence',
      report_date: '2026-02-03',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const retrieved = repo.findById(item.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.item_type).toBe('pending');
  });
});
```

### Security Tests

**Purpose**: Test security-critical modules with 100% branch coverage

**Examples**:
- QuickJS sandbox escape (20+ scenarios)
- SQL injection defense
- Memory residue detection
- Single-instance lock validation

**Structure**:
```
tests/security/
├── sandbox-escape.test.ts
├── sql-injection.test.ts
├── memory-cleanup.test.ts
└── single-instance.test.ts
```

---

## Code Style

### TypeScript Guidelines

1. **Strict Mode**: Always use strict TypeScript
2. **Type Imports**: Use `import type` for type-only imports
3. **No Any**: Avoid `any` type, use `unknown` or proper types
4. **Readonly**: Use `readonly` for immutable data
5. **Async/Await**: Prefer async/await over promises

**Example**:
```typescript
// Good
import type { ParsedEmail } from './EmailParser.js';

export async function processEmail(email: ParsedEmail): Promise<ActionItem> {
  const result = await llmAdapter.generate({ emails: [email] });
  return result.items[0];
}

// Bad
import { ParsedEmail } from './EmailParser';

export function processEmail(email: any): any {
  return llmAdapter.generate({ emails: [email] });
}
```

### ESLint Rules

Key ESLint configurations:
- `@typescript-eslint/no-explicit-any`: Error
- `@typescript-eslint/explicit-function-return-type`: Warn
- `no-console`: Error (use logger instead)
- `no-var`: Error (use const/let)

### Naming Conventions

- **Files**: PascalCase for classes (`ActionItem.ts`), camelCase for utilities (`cryptoManager.ts`)
- **Classes**: PascalCase (`class DuplicateDetector`)
- **Functions**: camelCase (`function computeHash`)
- **Constants**: UPPER_SNAKE_CASE (`const MAX_RETRIES = 2`)
- **Interfaces**: PascalCase with `I` prefix (`interface LLMAdapter`)

---

## Debugging Tips

### 1. Enable Verbose Logging

```typescript
import { logger } from './config/logger.js';

logger.setLogLevel('debug');
```

### 2. Inspect Database

```bash
# Using sqlite3 command line
sqlite3 ~/.mailcopilot/database.db

# Query action items
SELECT * FROM action_items LIMIT 10;

# Query email sources
SELECT * FROM email_sources WHERE report_date = '2026-02-03';
```

### 3. Test LLM Integration Manually

```typescript
// main/llm/test-llm.ts
import { RemoteLLM } from './RemoteLLM.js';

const adapter = new RemoteLLM({
  apiKey: 'sk-...',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4-turbo-preview',
});

const batch = {
  emails: [{
    message_id: 'test',
    from: 'test@example.com',
    subject: 'Test Email',
    date: '2026-02-03T10:00:00Z',
    body: 'Please complete the task by Friday.',
  }],
  reportDate: '2026-02-03',
  mode: 'remote',
};

const result = await adapter.generate(batch);
console.log(result);
```

### 4. Profile Performance

```typescript
import { performance } from 'perf_hooks';

const start = performance.now();
await processEmail(email);
const duration = performance.now() - start;

logger.info('ProcessEmail', 'Email processed', { duration });
```

---

## Common Issues

### Issue 1: "Cannot find module 'better-sqlite3'"

**Solution**: Rebuild native dependencies
```bash
npm rebuild better-sqlite3
```

### Issue 2: "OpenAI API timeout"

**Solution**: Increase timeout in configuration
```typescript
const adapter = new RemoteLLM({
  timeout: 60000, // 60 seconds
});
```

### Issue 3: "Local LLM connection refused"

**Solution**: Ensure Ollama is running
```bash
# Start Ollama
ollama serve

# Verify
curl http://localhost:11434/api/tags
```

### Issue 4: "Database locked"

**Solution**: Enable WAL mode
```typescript
db.pragma('journal_mode = WAL');
```

---

## Resources

### Documentation

- [Feature Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Research Findings](./research.md)
- [Data Model](./data-model.md)
- [Constitution](../.specify/memory/constitution.md)

### External Links

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [OpenAI Node.js SDK](https://github.com/openai/openai-node)
- [Electron Documentation](https://www.electronjs.org/docs)
- [Zod Documentation](https://zod.dev/)
- [Vitest Documentation](https://vitest.dev/)
- [Ollama Documentation](https://ollama.ai/)

---

## Getting Help

1. **Check logs**: Look for error messages in console or log files
2. **Run tests**: `npm test` to identify failing tests
3. **Read spec**: Check [spec.md](./spec.md) for requirements
4. **Ask questions**: Contact team via GitHub Issues or Slack

---

**Quickstart Status**: ✅ Complete - Ready for onboarding
