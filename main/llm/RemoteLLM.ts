/**
 * Remote LLM Adapter
 *
 * Implements LLM integration using OpenAI SDK.
 * Per plan.md Decision 1: Use OpenAI SDK for type safety, built-in retry logic, and structured output.
 * Per plan.md FR-057: 30s timeout, TLS 1.3 transmission, error handling.
 *
 * @module main/llm/RemoteLLM
 */

import OpenAI from 'openai';
import { logger } from '../config/logger.js';
import type {
  LLMAdapter,
  EmailBatch,
  LLMOutput,
  LLMAdapterConfig,
} from './LLMAdapter.js';

/**
 * Remote LLM Adapter Implementation
 *
 * Uses OpenAI SDK for type-safe LLM integration with built-in retry logic.
 *
 * Per plan.md Decision 1:
 * - OpenAI SDK for automatic retries, timeout handling, and error classification
 * - Native JSON mode for structured output guarantees
 * - Type-safe response parsing
 *
 * Per plan.md constraints:
 * - FR-057: 30s timeout for remote LLM requests
 * - R0-5: 2-retry limit with reinforced schema instructions
 * - FR-017: Degradation fallback to rule-engine-only on validation failure
 * - Security: TLS 1.3 transmission, API key from encrypted config
 */
export class RemoteLLM implements LLMAdapter {
  private config: Required<LLMAdapterConfig>;
  private client: OpenAI;

  /**
   * Default configuration for RemoteLLM
   */
  private static readonly DEFAULT_CONFIG: Required<LLMAdapterConfig> = {
    timeout: 30000, // 30 seconds per FR-057
    maxRetries: 2, // 2 retries per R0-5 (handled by OpenAI SDK)
    debug: false,
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4-turbo-preview',
  };

  /**
   * Create a new RemoteLLM adapter
   *
   * @param config - Adapter configuration (partial, merged with defaults)
   */
  constructor(config: LLMAdapterConfig = {}) {
    this.config = { ...RemoteLLM.DEFAULT_CONFIG, ...config };

    // Validate required configuration
    if (!this.config.apiKey) {
      logger.warn('RemoteLLM', 'API key not provided, RemoteLLM will not function', {
        endpoint: this.config.endpoint,
      });
    }

    // Initialize OpenAI client
    // Per plan.md Decision 1: Use OpenAI SDK with built-in features
    this.client = new OpenAI({
      apiKey: this.config.apiKey || 'dummy-key', // SDK requires a key, will fail if missing
      baseURL: this.config.endpoint,
      timeout: this.config.timeout, // 30s per FR-057
      maxRetries: this.config.maxRetries, // 2 retries per R0-5
    });

    logger.info('RemoteLLM', 'RemoteLLM adapter initialized with OpenAI SDK', {
      endpoint: this.config.endpoint,
      model: this.config.model,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Generate action items from email batch
   *
   * @param batch - Email batch with parsed metadata and content
   * @returns Promise resolving to LLM output with extracted items
   * @throws Error if LLM request fails after all retries
   *
   * Implementation notes (OpenAI SDK):
   * - Uses OpenAI SDK's chat.completions.create() for type-safe API calls
   * - Native JSON mode (response_format: { type: 'json_object' }) for structured output
   * - Built-in retry logic with exponential backoff (configured via maxRetries)
   * - Automatic error classification (rate limits, timeouts, network errors)
   * Per R0-5: 2-retry limit enforced by OpenAI SDK configuration
   */
  async generate(batch: EmailBatch): Promise<LLMOutput> {
    const startTime = Date.now();

    logger.info('RemoteLLM', 'Processing email batch using OpenAI SDK', {
      emailCount: batch.emails.length,
      reportDate: batch.reportDate,
      mode: batch.mode,
      model: this.config.model,
    });

    // Validate batch size
    if (batch.emails.length > 50) {
      throw new Error('Batch size exceeds maximum of 50 emails per plan.md constraints');
    }

    // Build prompts
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(batch);

    try {
      // Use OpenAI SDK for type-safe LLM integration
      // Per plan.md Decision 1: Native JSON mode for structured output guarantees
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for consistent extraction
        max_tokens: 4000, // Limit response length
        response_format: { type: 'json_object' }, // JSON mode per plan.md Decision 1
      });

      // Extract and parse response
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI API returned empty response content');
      }

      const output = this.parseJSONResponse(content);

      logger.info('RemoteLLM', 'Batch processing completed with OpenAI SDK', {
        itemCount: output.items.length,
        processedEmails: output.batch_info.processed_emails,
        skippedEmails: output.batch_info.skipped_emails,
        duration: Date.now() - startTime,
        model: response.model,
        usage: {
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
          totalTokens: response.usage?.total_tokens,
        },
      });

      return output;
    } catch (error) {
      // Handle errors from OpenAI SDK
      // Use duck typing instead of instanceof for better testability
      const err = error as Record<string, unknown>;

      // Check for API error (has status property)
      if (err.status !== undefined) {
        logger.error('RemoteLLM', 'OpenAI API error', {
          status: err.status,
          message: err.message,
          type: err.type,
          code: err.code,
        });

        const status = err.status as number;
        const message = err.message as string;

        // Handle specific error types based on status code
        if (status === 429) {
          throw new Error(`Rate limit exceeded: ${message}`);
        } else if (status === 401) {
          throw new Error(`Authentication failed: ${message}`);
        } else if (status >= 500) {
          throw new Error(`Server error (${status}): ${message}`);
        }
      }

      // Check for connection errors (has no status but is an APIError)
      if (err.constructor?.name === 'APIConnectionError') {
        throw new Error(`Network connection error: ${err.message}`);
      }

      if (err.constructor?.name === 'APIConnectionTimeoutError') {
        throw new Error(`Request timeout after ${this.config.timeout}ms (per FR-057)`);
      }

      if (err.constructor?.name === 'RateLimitError') {
        throw new Error(`Rate limit exceeded: ${err.message}`);
      }

      // Re-throw unknown errors
      throw error;
    }
  }

  /**
   * Check if remote LLM service is available
   *
   * @returns Promise resolving to true if service is reachable
   *
   * Implementation: Sends lightweight request using OpenAI SDK
   * Per plan.md: Quick health check for service availability
   */
  async checkHealth(): Promise<boolean> {
    try {
      // Use OpenAI SDK to send a minimal request for health check
      // Request models list as a lightweight health check
      await this.client.models.list();

      logger.debug('RemoteLLM', 'Health check successful', {
        endpoint: this.config.endpoint,
      });

      return true;
    } catch (error) {
      logger.warn('RemoteLLM', 'Health check failed', {
        error: error instanceof Error ? error.message : String(error),
        endpoint: this.config.endpoint,
      });
      return false;
    }
  }

  /**
   * Get current adapter configuration
   *
   * @returns Current configuration (without sensitive API key)
   */
  getConfig(): LLMAdapterConfig {
    // Return config without API key for security
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { apiKey, ...safeConfig } = this.config;
    return safeConfig;
  }

  /**
   * Update adapter configuration
   *
   * @param config - Partial configuration updates
   *
   * Note: Recreates OpenAI client if endpoint, apiKey, timeout, or maxRetries changes
   */
  updateConfig(config: Partial<LLMAdapterConfig>): void {
    const previousConfig = { ...this.config };

    // Merge with existing config
    this.config = { ...this.config, ...config } as Required<LLMAdapterConfig>;

    // Recreate OpenAI client if critical config changed
    const criticalKeys = ['endpoint', 'apiKey', 'timeout', 'maxRetries'] as const;
    const criticalChanged = criticalKeys.some(
      (key) => config[key] !== undefined && config[key] !== previousConfig[key]
    );

    if (criticalChanged) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey || 'dummy-key',
        baseURL: this.config.endpoint,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
      });

      logger.info('RemoteLLM', 'Configuration updated - OpenAI client recreated', {
        previous: {
          endpoint: previousConfig.endpoint,
          model: previousConfig.model,
          timeout: previousConfig.timeout,
          maxRetries: previousConfig.maxRetries,
        },
        current: {
          endpoint: this.config.endpoint,
          model: this.config.model,
          timeout: this.config.timeout,
          maxRetries: this.config.maxRetries,
        },
      });
    } else {
      logger.info('RemoteLLM', 'Configuration updated (no client recreation needed)', {
        previous: {
          model: previousConfig.model,
          debug: previousConfig.debug,
        },
        current: {
          model: this.config.model,
          debug: this.config.debug,
        },
      });
    }
  }

  /**
   * Build system prompt with extraction instructions
   *
   * @returns System prompt string
   */
  private buildSystemPrompt(): string {
    return `You are an email action item extraction assistant. Your task is to analyze emails and extract actionable items.

**CRITICAL REQUIREMENTS:**
1. Extract ONLY clear, actionable items (tasks, deadlines, decisions)
2. Each item MUST include source_email_indices (array of email indices 0-N)
3. Provide confidence score (0-100) based on clarity and source evidence
4. Include evidence text explaining extraction rationale
5. Classify items as "completed" (done) or "pending" (needs action)

**OUTPUT FORMAT (JSON only, no markdown):**
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

  /**
   * Build user prompt with email content
   *
   * @param batch - Email batch
   * @returns User prompt string
   */
  private buildUserPrompt(batch: EmailBatch): string {
    const emailContents = batch.emails
      .map((email, index) => {
        const parts = [
          `Email ${index}:`,
          `From: ${email.from}`,
          `Subject: ${email.subject}`,
          `Date: ${email.date}`,
        ];

        if (email.body) {
          parts.push(`Body: ${email.body}`);
        }

        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    return `Extract action items from the following emails:\n\n${emailContents}\n\nRespond with JSON only, following the output format specified in the system prompt.`;
  }

  /**
   * Parse JSON response string
   *
   * @param jsonString - JSON string from LLM response
   * @returns Parsed LLM output
   * @throws Error if JSON is invalid
   */
  private parseJSONResponse(jsonString: string): LLMOutput {
    try {
      // Remove markdown code blocks if present (though JSON mode should prevent this)
      const cleaned = jsonString
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      const parsed = JSON.parse(cleaned);

      // Validate structure
      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error('Response missing "items" array');
      }

      if (!parsed.batch_info) {
        throw new Error('Response missing "batch_info" object');
      }

      // Ensure all items have required fields
      const items = parsed.items.map((item: unknown) => {
        if (typeof item !== 'object' || item === null) {
          throw new Error('Invalid item in response');
        }

        const typedItem = item as Record<string, unknown>;

        return {
          content: String(typedItem.content || ''),
          type: (typedItem.type === 'completed' || typedItem.type === 'pending')
            ? typedItem.type
            : 'pending',
          source_email_indices: Array.isArray(typedItem.source_email_indices)
            ? typedItem.source_email_indices.map(Number)
            : [],
          evidence: String(typedItem.evidence || ''),
          confidence: typeof typedItem.confidence === 'number' ? typedItem.confidence : 50,
          source_status: (typedItem.source_status === 'verified' || typedItem.source_status === 'unverified')
            ? typedItem.source_status
            : 'verified' as const,
        };
      });

      return {
        items,
        batch_info: {
          total_emails: Number(parsed.batch_info.total_emails || 0),
          processed_emails: Number(parsed.batch_info.processed_emails || 0),
          skipped_emails: Number(parsed.batch_info.skipped_emails || 0),
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse LLM JSON response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export default RemoteLLM;
