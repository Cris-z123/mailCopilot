/**
 * Local LLM Adapter
 *
 * Implements LLM integration using Ollama API for local-only processing.
 * Per plan.md FR-036, FR-037: Local mode requires health check, no auto-degradation to remote.
 * Per tasks.md T077-T078: Ollama API integration via fetch API to localhost:11434.
 *
 * @module main/llm/LocalLLM
 */

import { logger } from '../config/logger.js';
import type {
  LLMAdapter,
  EmailBatch,
  LLMOutput,
  LLMAdapterConfig,
} from './LLMAdapter.js';

/**
 * Ollama API response structure
 */
interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama API error response
 */
interface OllamaErrorResponse {
  error: string;
}

/**
 * Ollama /api/tags response for health check
 */
interface OllamaTagsResponse {
  models: Array<{
    name: string;
    modified_at: string;
    size: number;
  }>;
}

/**
 * Local LLM Adapter Implementation
 *
 * Uses Ollama API for local-only LLM integration.
 *
 * Per plan.md constraints:
 * - FR-036: Local mode requires health check, block if unavailable
 * - FR-037: No automatic degradation from local to remote mode
 * - FR-057: 30s timeout for local LLM requests
 * - R0-5: 2-retry limit with reinforced schema instructions
 * - Per tasks.md T077: Ollama API integration, fetch API to http://localhost:11434/api/generate
 *
 * Implementation details:
 * - Uses native Node.js fetch API (no external dependencies)
 * - Ollama endpoint: http://localhost:11434
 * - Health check: GET /api/tags to verify service availability
 * - Generate endpoint: POST /api/generate with stream=false
 * - No auto-fallback to remote mode per FR-037
 */
export class LocalLLM implements LLMAdapter {
  private config: Required<LLMAdapterConfig>;
  private baseUrl: string;
  private modelName: string;

  /**
   * Default configuration for LocalLLM
   */
  private static readonly DEFAULT_CONFIG: Required<LLMAdapterConfig> = {
    timeout: 30000, // 30 seconds per FR-057
    maxRetries: 2, // 2 retries per R0-5
    debug: false,
    endpoint: 'http://localhost:11434',
    apiKey: '', // Not used for local Ollama
    model: 'llama2', // Default Ollama model
  };

  /**
   * Create a new LocalLLM adapter
   *
   * @param config - Adapter configuration (partial, merged with defaults)
   */
  constructor(config: LLMAdapterConfig = {}) {
    this.config = { ...LocalLLM.DEFAULT_CONFIG, ...config };
    this.baseUrl = this.config.endpoint;
    this.modelName = this.config.model || 'llama2';

    logger.info('LocalLLM', 'LocalLLM adapter initialized for Ollama', {
      endpoint: this.baseUrl,
      model: this.modelName,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Generate action items from email batch using Ollama API
   *
   * @param batch - Email batch with parsed metadata and content
   * @returns Promise resolving to LLM output with extracted items
   * @throws Error if Ollama API fails after all retries
   *
   * Implementation notes (Ollama API):
   * - Uses POST /api/generate endpoint
   * - stream=false for non-streaming response (simpler parsing)
   * - Native fetch API with AbortController for timeout enforcement
   * - Manual retry logic with exponential backoff
   * Per FR-037: No auto-degradation to remote mode on failure
   */
  async generate(batch: EmailBatch): Promise<LLMOutput> {
    const startTime = Date.now();

    logger.info('LocalLLM', 'Processing email batch using Ollama API', {
      emailCount: batch.emails.length,
      reportDate: batch.reportDate,
      mode: batch.mode,
      model: this.modelName,
    });

    // Validate batch size
    if (batch.emails.length > 50) {
      throw new Error('Batch size exceeds maximum of 50 emails per plan.md constraints');
    }

    // Build prompts
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(batch);

    // Build Ollama API request payload
    const requestBody = {
      model: this.modelName,
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      stream: false, // Disable streaming for simpler response handling
      options: {
        temperature: 0.3, // Lower temperature for consistent extraction
        num_predict: 4000, // Limit response length
      },
    };

    let lastError: Error | null = null;

    // Retry loop with exponential backoff (per R0-5: 2-retry limit)
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          logger.info('LocalLLM', `Retry attempt ${attempt}/${this.config.maxRetries}`, {
            delay: `${delay}ms`,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        // Create AbortController for timeout enforcement
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        try {
          // Send request to Ollama API
          const response = await fetch(`${this.baseUrl}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Check for HTTP errors
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API returned ${response.status}: ${errorText}`);
          }

          // Parse JSON response
          const data = (await response.json()) as OllamaGenerateResponse;

          // Extract and parse response
          const output = this.parseOllamaResponse(data.response);

          logger.info('LocalLLM', 'Batch processing completed with Ollama API', {
            itemCount: output.items.length,
            processedEmails: output.batch_info.processed_emails,
            skippedEmails: output.batch_info.skipped_emails,
            duration: Date.now() - startTime,
            model: data.model,
            totalDuration: data.total_duration,
            evalCount: data.eval_count,
          });

          return output;
        } catch (fetchError) {
          clearTimeout(timeoutId);

          // Check for timeout error
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error(`Request timeout after ${this.config.timeout}ms (per FR-057)`);
          }

          throw fetchError;
        }
      } catch (error) {
        lastError = error as Error;

        logger.warn('LocalLLM', `Attempt ${attempt + 1}/${this.config.maxRetries + 1} failed`, {
          error: lastError.message,
        });

        // If this is the last attempt, don't continue
        if (attempt === this.config.maxRetries) {
          break;
        }

        // Check if error is retryable
        const isRetryable = this.isRetryableError(lastError);
        if (!isRetryable) {
          logger.error('LocalLLM', 'Non-retryable error encountered', {
            error: lastError.message,
          });
          break;
        }
      }
    }

    // All retries exhausted
    logger.error('LocalLLM', 'All retry attempts exhausted', {
      error: lastError?.message,
      attempts: this.config.maxRetries + 1,
    });

    throw new Error(
      `Ollama API request failed after ${this.config.maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Check if Ollama service is available
   *
   * @returns Promise resolving to true if service is reachable
   *
   * Implementation: Sends GET request to /api/tags endpoint
   * Per tasks.md T078: GET http://localhost:11434/api/tags to verify service availability
   */
  async checkHealth(): Promise<boolean> {
    try {
      logger.debug('LocalLLM', 'Checking Ollama service health', {
        endpoint: this.baseUrl,
      });

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout for health check

      try {
        // Send GET request to /api/tags endpoint
        const response = await fetch(`${this.baseUrl}/api/tags`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          logger.warn('LocalLLM', 'Health check failed: Ollama API returned non-OK status', {
            status: response.status,
          });
          return false;
        }

        // Parse response to verify it's valid Ollama API
        const data = (await response.json()) as OllamaTagsResponse;

        if (!Array.isArray(data.models)) {
          logger.warn('LocalLLM', 'Health check failed: Invalid response structure', {
            response: JSON.stringify(data),
          });
          return false;
        }

        // Check if configured model is available
        const modelAvailable = data.models.some((model) => model.name.includes(this.modelName));

        if (!modelAvailable) {
          logger.warn('LocalLLM', 'Configured model not found in Ollama', {
            configuredModel: this.modelName,
            availableModels: data.models.map((m) => m.name),
          });
          // Don't fail health check if model is missing - that's a configuration issue
          // Health check only verifies service is running
        }

        logger.debug('LocalLLM', 'Health check successful', {
          endpoint: this.baseUrl,
          modelCount: data.models.length,
        });

        return true;
      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          logger.warn('LocalLLM', 'Health check timeout after 5000ms');
          return false;
        }

        throw fetchError;
      }
    } catch (error) {
      logger.warn('LocalLLM', 'Health check failed', {
        error: error instanceof Error ? error.message : String(error),
        endpoint: this.baseUrl,
      });
      return false;
    }
  }

  /**
   * Get current adapter configuration
   *
   * @returns Current configuration (without sensitive fields)
   */
  getConfig(): LLMAdapterConfig {
    // Return config without sensitive fields (apiKey not used for local)
    return {
      endpoint: this.config.endpoint,
      model: this.config.model,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      debug: this.config.debug,
    };
  }

  /**
   * Update adapter configuration
   *
   * @param config - Partial configuration updates
   *
   * Note: Updates baseUrl and modelName if endpoint or model changes
   */
  updateConfig(config: Partial<LLMAdapterConfig>): void {
    const previousConfig = { ...this.config };

    // Merge with existing config
    this.config = { ...this.config, ...config } as Required<LLMAdapterConfig>;

    // Update derived properties if critical config changed
    const criticalKeys = ['endpoint', 'model'] as const;
    const criticalChanged = criticalKeys.some(
      (key) => config[key] !== undefined && config[key] !== previousConfig[key]
    );

    if (criticalChanged) {
      this.baseUrl = this.config.endpoint;
      this.modelName = this.config.model || 'llama2';

      logger.info('LocalLLM', 'Configuration updated - endpoint or model changed', {
        previous: {
          endpoint: previousConfig.endpoint,
          model: previousConfig.model,
        },
        current: {
          endpoint: this.config.endpoint,
          model: this.config.model,
        },
      });
    } else {
      logger.info('LocalLLM', 'Configuration updated (no endpoint/model change)', {
        previous: {
          timeout: previousConfig.timeout,
          maxRetries: previousConfig.maxRetries,
          debug: previousConfig.debug,
        },
        current: {
          timeout: this.config.timeout,
          maxRetries: this.config.maxRetries,
          debug: this.config.debug,
        },
      });
    }
  }

  /**
   * Check if error is retryable
   *
   * @param error - Error to evaluate
   * @returns true if error should trigger a retry
   *
   * Retryable errors: network errors, timeouts, 5xx server errors
   * Non-retryable errors: 4xx client errors, JSON parse errors
   */
  private isRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();

    // Network errors (ECONNREFUSED, ENOTFOUND, etc.)
    if (
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('etimedout') ||
      errorMessage.includes('econnreset') ||
      errorMessage.includes('network') ||
      errorMessage.includes('fetch failed')
    ) {
      return true;
    }

    // Timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('abort')) {
      return true; // Retry on timeout
    }

    // HTTP 5xx errors (server errors)
    if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
      return true;
    }

    // HTTP 429 (rate limit)
    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return true;
    }

    // JSON parse errors (non-retryable)
    if (errorMessage.includes('json') || errorMessage.includes('parse')) {
      return false;
    }

    // HTTP 4xx errors (client errors, non-retryable)
    if (errorMessage.includes('400') || errorMessage.includes('401') || errorMessage.includes('404')) {
      return false;
    }

    // Default: don't retry unknown errors
    return false;
  }

  /**
   * Parse Ollama API response string
   *
   * @param responseString - Response text from Ollama API
   * @returns Parsed LLM output
   * @throws Error if response is invalid
   *
   * Ollama may return JSON in markdown code blocks or plain JSON
   */
  private parseOllamaResponse(responseString: string): LLMOutput {
    try {
      // Remove markdown code blocks if present
      const cleaned = responseString
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
      throw new Error(`Failed to parse Ollama JSON response: ${error instanceof Error ? error.message : String(error)}`);
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
}

export default LocalLLM;
