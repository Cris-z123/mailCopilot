/**
 * LLM Adapter Interface
 *
 * Defines the contract for all LLM service adapters (local and remote).
 * Per plan.md R0-5, all LLM adapters must implement this interface to ensure
 * consistent behavior across different LLM providers.
 *
 * @module main/llm/LLMAdapter
 */

import type { ParsedEmail } from '../email/parsers/EmailParser.js';

/**
 * Email batch input for LLM processing
 *
 * Per plan.md constraints:
 * - Maximum batch size: 50 emails
 * - Email body truncated to 100k characters
 * - Attachments: metadata only (no content storage per FR-044)
 */
export interface EmailBatch {
  /** Array of parsed emails with metadata and optional body content */
  emails: ParsedEmail[];

  /** Report date in YYYY-MM-DD format for item association */
  reportDate: string;

  /** Processing mode (affects confidence calculation per R0-8) */
  mode: 'local' | 'remote';
}

/**
 * Extracted action item from LLM output
 *
 * Per plan.md R0-5:
 * - source_email_indices: Optional for degradation mode
 * - source_status: Defaults to 'verified', set to 'unverified' on schema failure
 */
export interface ExtractedItem {
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

/**
 * LLM output structure
 *
 * Per plan.md R0-5: Schema validation with 2-retry limit
 * - Items with missing required fields trigger retry
 * - After 2 failed retries: degrade to rule-engine-only extraction
 */
export interface LLMOutput {
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

/**
 * LLM adapter configuration options
 *
 * Shared configuration for all LLM adapters.
 * Remote-specific and local-specific options are defined
 * in respective adapter implementations.
 */
export interface LLMAdapterConfig {
  /** Request timeout in milliseconds (per FR-057: 30s for remote) */
  timeout?: number;

  /** Maximum retry attempts for LLM requests (per R0-5: 2 retries) */
  maxRetries?: number;

  /** Enable detailed logging for debugging */
  debug?: boolean;

  /** Custom API endpoint (remote mode only) */
  endpoint?: string;

  /** API key for authentication (remote mode only) */
  apiKey?: string;

  /** Model name/identifier */
  model?: string;
}

/**
 * LLM Adapter Interface
 *
 * All LLM service adapters (LocalLLM, RemoteLLM) must implement this interface
 * to ensure consistent behavior across different LLM providers.
 *
 * Per plan.md:
 * - R0-5: Schema validation with 2-retry limit
 * - R0-8: Dual-engine confidence calculation (rules 50% + LLM 50%)
 * - FR-057: 30s timeout for remote LLM requests
 * - FR-017: Degradation fallback to rule-engine-only on validation failure
 *
 * @interface LLMAdapter
 */
export interface LLMAdapter {
  /**
   * Generate action items from email batch
   *
   * This method is the core LLM integration point. It accepts a batch of
   * parsed emails and returns extracted action items with source attribution.
   *
   * @param batch - Email batch with parsed metadata and content
   * @returns Promise resolving to LLM output with extracted items
   * @throws Error if LLM request fails after retries (per R0-5)
   *
   * Behavior:
   * - Send email batch to LLM service (local or remote)
   * - Parse LLM response into structured output
   * - Return items with source attribution (email indices)
   * - Include batch statistics (total, processed, skipped)
   *
   * Error Handling:
   * - Network errors: Retry up to maxRetries (default: 2)
   * - Timeout errors: Fail immediately (no retry for timeout per FR-057)
   * - Validation errors: Degrade to rule-engine-only (per R0-5)
   * - Parse errors: Retry with reinforced schema instructions
   *
   * Confidence Scoring (per R0-8):
   * - Remote mode: Use LLM-provided confidence score
   * - Local mode: Calculate from schema completeness + keyword matching
   *
   * Degradation Handling (per R0-5):
   * - Schema validation failure → retry with reinforced instructions
   * - After 2 failed retries → return degraded items
   * - Degraded items: source_status='unverified', confidence ≤ 0.6
   *
   * Example:
   * ```typescript
   * const adapter = new RemoteLLM({ timeout: 30000, maxRetries: 2 });
   * const batch = { emails: [parsedEmail1, parsedEmail2], reportDate: '2026-01-31', mode: 'remote' };
   * const output = await adapter.generate(batch);
   * console.log(`Extracted ${output.items.length} items`);
   * ```
   */
  generate(batch: EmailBatch): Promise<LLMOutput>;

  /**
   * Check if LLM service is available
   *
   * @returns Promise resolving to true if service is reachable
   *
   * Use cases:
   * - Pre-flight check before batch processing
   * - Health monitoring for UI status indicators
   * - Mode switching validation (per FR-036: block if unavailable in local mode)
   *
   * Implementation notes:
   * - Remote: Ping API endpoint with HEAD request or lightweight GET
   * - Local: Check if Ollama process is running on localhost:11434
   */
  checkHealth(): Promise<boolean>;

  /**
   * Get adapter configuration
   *
   * @returns Current adapter configuration
   *
   * Used for debugging and configuration display in UI.
   */
  getConfig(): LLMAdapterConfig;

  /**
   * Update adapter configuration
   *
   * @param config - Partial configuration updates
   *
   * Allows runtime configuration changes without recreating adapter.
   * Used for mode switching (per US5: hot mode switching without restart).
   */
  updateConfig(config: Partial<LLMAdapterConfig>): void;
}
