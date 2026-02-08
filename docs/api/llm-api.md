# LLM Adapter API Documentation

**Version**: 1.0.0
**Last Updated**: 2026-02-08
**Module**: `src/main/llm/`

## Overview

The LLM Adapter API provides a unified interface for integrating both remote (OpenAI-compatible) and local (Ollama) LLM services for email action item extraction. The architecture enforces type safety, schema validation, and graceful degradation per the mailCopilot constitution.

**Key Features**:
- Unified `LLMAdapter` interface for all LLM providers
- Type-safe implementations using OpenAI SDK v4.x
- Schema validation with 2-retry limit and degradation fallback
- Support for both remote and local processing modes
- Parallel processing capabilities for batch optimization
- Comprehensive error handling and health monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EmailProcessor                            │
│                  (Orchestrator Layer)                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   LLMAdapter Interface                       │
│                  (Abstraction Layer)                         │
└─────────┬───────────────────────────────┬───────────────────┘
          │                               │
          ▼                               ▼
┌──────────────────────┐        ┌──────────────────────┐
│   RemoteLLM          │        │   LocalLLM           │
│  (OpenAI SDK)        │        │  (Ollama API)        │
├──────────────────────┤        ├──────────────────────┤
│ • Native JSON mode   │        │ • Fetch API          │
│ • Auto retry (2x)    │        │ • Health check       │
│ • Type-safe          │        │ • No auto-degrade    │
│ • 30s timeout        │        │ • 30s timeout        │
└──────────────────────┘        └──────────────────────┘
```

## Core Interface

### `LLMAdapter`

All LLM service adapters must implement this interface for consistent behavior.

```typescript
interface LLMAdapter {
  /**
   * Generate action items from email batch
   * @param batch - Email batch with parsed metadata and content
   * @returns Promise resolving to LLM output with extracted items
   * @throws Error if LLM request fails after retries
   */
  generate(batch: EmailBatch): Promise<LLMOutput>;

  /**
   * Check if LLM service is available
   * @returns Promise resolving to true if service is reachable
   */
  checkHealth(): Promise<boolean>;

  /**
   * Get adapter configuration
   * @returns Current adapter configuration (without sensitive data)
   */
  getConfig(): LLMAdapterConfig;

  /**
   * Update adapter configuration
   * @param config - Partial configuration updates
   */
  updateConfig(config: Partial<LLMAdapterConfig>): void;
}
```

### Type Definitions

#### `EmailBatch`

Input structure for LLM processing.

```typescript
interface EmailBatch {
  /** Array of parsed emails with metadata and optional body content */
  emails: ParsedEmail[];

  /** Report date in YYYY-MM-DD format for item association */
  reportDate: string;

  /** Processing mode (affects confidence calculation) */
  mode: 'local' | 'remote';
}
```

**Constraints**:
- Maximum batch size: 50 emails (per plan.md)
- Email body truncated to 100k characters
- Attachments: metadata only (no content storage per FR-044)

#### `ExtractedItem`

Single action item from LLM output.

```typescript
interface ExtractedItem {
  /** Item content (action item text) */
  content: string;

  /** Item classification */
  type: 'completed' | 'pending';

  /** Indices of source emails in batch (0-based) */
  source_email_indices?: number[];

  /** Model's rationale for extraction (desensitized) */
  evidence: string;

  /** LLM confidence score (0-100) */
  confidence: number;

  /** Traceability status */
  source_status: 'verified' | 'unverified';
}
```

#### `LLMOutput`

Complete LLM response structure.

```typescript
interface LLMOutput {
  /** Array of extracted action items */
  items: ExtractedItem[];

  /** Batch processing statistics */
  batch_info: {
    /** Total emails in input batch */
    total_emails: number;

    /** Successfully processed emails */
    processed_emails: number;

    /** Skipped emails (duplicates, parsing failures) */
    skipped_emails: number;
  };
}
```

#### `LLMAdapterConfig`

Configuration options for LLM adapters.

```typescript
interface LLMAdapterConfig {
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Maximum retry attempts (default: 2) */
  maxRetries?: number;

  /** Enable detailed logging */
  debug?: boolean;

  /** Custom API endpoint (remote mode only) */
  endpoint?: string;

  /** API key for authentication (remote mode only) */
  apiKey?: string;

  /** Model name/identifier */
  model?: string;

  /** Enable parallel processing (default: false) */
  parallelRequests?: boolean;

  /** Maximum concurrent requests (default: 5) */
  maxConcurrency?: number;
}
```

## RemoteLLM Implementation

### Overview

`RemoteLLM` uses the official OpenAI SDK v4.x for type-safe LLM integration with cloud services.

**File**: `src/main/llm/RemoteLLM.ts`

### Usage Example

```typescript
import { RemoteLLM } from './RemoteLLM.js';

// Initialize adapter
const adapter = new RemoteLLM({
  apiKey: process.env.OPENAI_API_KEY,
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4-turbo-preview',
  timeout: 30000,
  maxRetries: 2,
});

// Generate items from batch
const batch = {
  emails: [parsedEmail1, parsedEmail2],
  reportDate: '2026-02-08',
  mode: 'remote',
};

const output = await adapter.generate(batch);
console.log(`Extracted ${output.items.length} items`);
```

### Configuration

```typescript
const config = {
  // Required
  apiKey: string,

  // Optional (with defaults)
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4-turbo-preview',
  timeout: 30000,      // 30 seconds per FR-057
  maxRetries: 2,       // 2 retries per R0-5
  parallelRequests: false,
  maxConcurrency: 5,
};
```

### Features

#### 1. Native JSON Mode

```typescript
const response = await client.chat.completions.create({
  model: 'gpt-4-turbo-preview',
  messages: [...],
  response_format: { type: 'json_object' }, // Structured output
});
```

**Benefits**:
- Guaranteed valid JSON response
- No markdown parsing needed
- Type-safe response handling

#### 2. Built-in Retry Logic

```typescript
this.client = new OpenAI({
  apiKey: config.apiKey,
  timeout: 30000,
  maxRetries: 2, // Automatic exponential backoff
});
```

**Behavior**:
- Automatic retry on network errors
- Exponential backoff between retries
- Error classification (rate limits, timeouts, etc.)

#### 3. Parallel Processing (Per T102)

```typescript
const adapter = new RemoteLLM({
  parallelRequests: true,
  maxConcurrency: 5,
});

// Automatically processes emails in parallel
const output = await adapter.generate(batch);
```

**Benefits**:
- Concurrent requests for independent emails
- Configurable concurrency limit
- Graceful error handling per-email

### Error Handling

```typescript
try {
  const output = await adapter.generate(batch);
} catch (error) {
  // Rate limit exceeded (429)
  if (error.status === 429) {
    console.error('Rate limit exceeded');
  }

  // Authentication failed (401)
  if (error.status === 401) {
    console.error('Invalid API key');
  }

  // Server error (5xx)
  if (error.status >= 500) {
    console.error('Server error');
  }

  // Timeout after 30s (FR-057)
  if (error instanceof TimeoutError) {
    console.error('Request timeout');
  }
}
```

### Health Check

```typescript
const isHealthy = await adapter.checkHealth();
// Uses OpenAI SDK's models.list() for lightweight ping
```

## LocalLLM Implementation

### Overview

`LocalLLM` uses the Ollama API for local-only processing with no external dependencies.

**File**: `src/main/llm/LocalLLM.ts`

### Usage Example

```typescript
import { LocalLLM } from './LocalLLM.js';

// Initialize adapter
const adapter = new LocalLLM({
  endpoint: 'http://localhost:11434',
  model: 'llama2',
  timeout: 30000,
  maxRetries: 2,
});

// Generate items from batch
const batch = {
  emails: [parsedEmail1, parsedEmail2],
  reportDate: '2026-02-08',
  mode: 'local',
};

const output = await adapter.generate(batch);
```

### Configuration

```typescript
const config = {
  // Required
  endpoint: 'http://localhost:11434',
  model: 'llama2',

  // Optional (with defaults)
  timeout: 30000,      // 30 seconds per FR-057
  maxRetries: 2,       // 2 retries per R0-5
};
```

### Ollama API Integration

#### 1. Generate Endpoint

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
```

#### 2. Health Check

```typescript
// GET /api/tags to verify Ollama is running
const response = await fetch('http://localhost:11434/api/tags');
const data = await response.json();
// Returns list of available models
```

### Per FR-036: Blocking on Failure

```typescript
async generate(batch: EmailBatch): Promise<LLMOutput> {
  // Check health BEFORE processing
  const isHealthy = await this.checkHealth();

  if (!isHealthy) {
    throw new Error(
      'Local LLM service unavailable. ' +
      'Per FR-036: Local mode requires Ollama service to be available.'
    );
  }

  // Proceed with processing...
}
```

**Key Requirements**:
- Health check before every batch
- Block processing if Ollama unavailable
- **No automatic fallback to remote mode** (per FR-037)

### Error Handling

```typescript
try {
  const output = await adapter.generate(batch);
} catch (error) {
  // Connection refused (Ollama not running)
  if (error.code === 'ECONNREFUSED') {
    console.error('Ollama service not running on localhost:11434');
  }

  // Timeout after 30s
  if (error.message.includes('timeout')) {
    console.error('Request timeout after 30s (per FR-057)');
  }

  // Model not found
  if (error.message.includes('model')) {
    console.error('Model not found in Ollama');
  }
}
```

## Schema Validation & Degradation

### OutputValidator Integration

```typescript
import { OutputValidator } from './OutputValidator.js';

// After LLM response
const validator = new OutputValidator();

const result = await validator.validate(output.items, {
  retryCount: 0,
  maxRetries: 2,
});

if (!result.success) {
  // Degradation mode: Rule engine only
  degradedItems = result.degradedItems;
}
```

### Degradation Handling (Per R0-5)

**Scenario**: LLM output fails Zod schema validation twice

```typescript
// Retry 1: Reinforced schema instructions
const reinforcedPrompt = `
${originalPrompt}

CRITICAL: Your response MUST follow this exact JSON schema:
{
  "items": [
    {
      "content": "string",
      "type": "completed|pending",
      "source_email_indices": [number],
      "evidence": "string",
      "confidence": number
    }
  ]
}
`;

// Retry 2: Further reinforcement
// If still fails: Degrade to rule-engine-only

// Degraded items
degradedItems = [{
  content: "item from rule engine",
  type: "pending",
  source_status: 'unverified',  // Degraded flag
  confidence: 0.4,              // Capped at 0.6 (per FR-011)
  evidence: "Rule engine extraction (LLM validation failed)",
}];
```

## Confidence Calculation (Per R0-8)

### Algorithm

```typescript
// Normal Mode
confidence = (rule_score × 0.5) + (llm_score × 0.5)

// Degradation Mode (after schema failure)
confidence = (rule_score × 0.6) + (llm_score × 0.2)
confidence = min(confidence, 0.6)  // Cap at 60%
```

### Implementation

```typescript
import { ConfidenceCalculator } from './ConfidenceCalculator.js';

const calculator = new ConfidenceCalculator();

const finalScore = calculator.calculate({
  ruleScore: 80,   // From rule engine
  llmScore: 90,    // From LLM output
  mode: 'normal',  // or 'degraded'
});
```

## Testing

### Unit Tests

```typescript
// RemoteLLM tests
describe('RemoteLLM', () => {
  it('should generate items with OpenAI SDK', async () => {
    const adapter = new RemoteLLM({ apiKey: 'test-key' });
    const output = await adapter.generate(mockBatch);
    expect(output.items).toHaveLength(5);
  });

  it('should retry on network errors', async () => {
    // Test retry logic
  });

  it('should timeout after 30s', async () => {
    // Test timeout enforcement
  });
});

// LocalLLM tests
describe('LocalLLM', () => {
  it('should block if Ollama unavailable', async () => {
    const adapter = new LocalLLM();
    await expect(adapter.generate(mockBatch))
      .rejects.toThrow('Local LLM service unavailable');
  });

  it('should check health via /api/tags', async () => {
    const isHealthy = await adapter.checkHealth();
    expect(isHealthy).toBe(true);
  });
});
```

### Integration Tests

```typescript
describe('LLM Integration', () => {
  it('should process 50-email batch in <18s (remote)', async () => {
    const adapter = new RemoteLLM({ apiKey: process.env.TEST_API_KEY });
    const start = Date.now();
    await adapter.generate(largeBatch);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(18000);
  });

  it('should process 50-email batch in <35s (local)', async () => {
    const adapter = new LocalLLM();
    const start = Date.now();
    await adapter.generate(largeBatch);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(35000);
  });
});
```

## Best Practices

### 1. Always Use Health Checks

```typescript
// Pre-flight check before batch processing
const isHealthy = await adapter.checkHealth();
if (!isHealthy) {
  // Show error to user
  return;
}
```

### 2. Handle Timeouts Gracefully

```typescript
try {
  const output = await adapter.generate(batch);
} catch (error) {
  if (error.message.includes('timeout')) {
    // User-friendly timeout message
    showNotification('Request timeout. Please try again.');
  }
}
```

### 3. Use Parallel Processing for Large Batches

```typescript
// Enable parallel processing for batches > 10 emails
if (batch.emails.length > 10) {
  adapter.updateConfig({ parallelRequests: true });
}
```

### 4. Validate Configuration

```typescript
if (!config.apiKey) {
  logger.warn('RemoteLLM', 'API key not provided');
  // Show configuration UI to user
}
```

## References

- **OpenAI SDK Documentation**: https://github.com/openai/openai-node
- **Ollama API Documentation**: https://github.com/ollama/ollama/blob/main/docs/api.md
- **Research Document**: `specs/001-email-item-traceability/research.md`
- **Data Model**: `specs/001-email-item-traceability/data-model.md`
- **Implementation Plan**: `specs/001-email-item-traceability/plan.md`

---

**API Version**: 1.0.0
**Last Updated**: 2026-02-08
**Maintainer**: mailCopilot Development Team
