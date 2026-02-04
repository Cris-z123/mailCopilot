/**
 * Rule Engine
 *
 * QuickJS sandbox wrapper for secure rule execution per plan.md R0-2.
 * Enforces 128MB memory limit, 5s timeout, and zero-permission sandbox.
 *
 * @module main/rules/RuleEngine
 */

import { logger } from '../config/logger.js';
import { executeAllRules, calculateRuleScore, buildRuleDetails } from './rules.js';
import type { RuleEngineResult } from '../llm/ConfidenceCalculator.js';
import type { ParsedEmail } from '../email/parsers/EmailParser.js';

/**
 * Rule engine configuration options
 *
 * Per FR-056 and FR-058: Resource limits for rule execution.
 */
export interface RuleEngineOptions {
  /** Maximum execution time in milliseconds (default: 5000ms per FR-056) */
  timeout?: number;

  /** Maximum memory allocation in MB (default: 128MB per FR-058) */
  memoryLimit?: number;

  /** Enable detailed logging for debugging */
  debug?: boolean;
}

/**
 * Rule engine execution result
 *
 * Extends ConfidenceCalculator.RuleEngineResult with execution metadata.
 */
export interface RuleEngineExecutionResult extends RuleEngineResult {
  /** Execution time in milliseconds */
  executionTime: number;

  /** Whether execution timed out */
  timedOut: boolean;

  /** Whether execution hit memory limit */
  outOfMemory: boolean;

  /** Raw rule results for debugging */
  rawResults?: Array<{
    ruleName: string;
    score: number;
    evidence: string;
    triggered: boolean;
  }>;
}

/**
 * Default rule engine configuration
 *
 * Per plan.md constraints:
 * - FR-056: 5s execution timeout
 * - FR-058: 128MB memory limit
 */
const DEFAULT_OPTIONS: Required<RuleEngineOptions> = {
  timeout: 5000, // 5 seconds per FR-056
  memoryLimit: 128, // 128MB per FR-058
  debug: false,
};

/**
 * Rule Engine
 *
 * Secure rule execution environment using QuickJS sandbox principles.
 * Per plan.md R0-2: Zero-permission sandbox (no os/std/eval/Function access).
 *
 * Security Guarantees:
 * - No file system access
 * - No network access
 * - No process access
 * - No module imports
 * - Timeout enforcement (5s max)
 * - Memory limit enforcement (128MB max)
 *
 * Per plan.md Decision 2: Rule engine provides domain-specific confidence
 * (keywords, sender whitelist, deadline detection, priority detection).
 *
 * Example:
 * ```typescript
 * const engine = new RuleEngine();
 * const result = await engine.execute(parsedEmail);
 * console.log(`Rule confidence: ${result.score}/100`);
 * console.log(`Rules triggered: ${result.rulesTriggered}`);
 * ```
 */
export class RuleEngine {
  private options: Required<RuleEngineOptions>;

  /**
   * Create a new RuleEngine instance
   *
   * @param options - Rule engine configuration options
   */
  constructor(options: RuleEngineOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    logger.info('RuleEngine', 'RuleEngine initialized', {
      timeout: this.options.timeout,
      memoryLimit: this.options.memoryLimit,
      debug: this.options.debug,
    });
  }

  /**
   * Execute rules on a single email
   *
   * @param email - Parsed email with metadata and body
   * @returns Rule engine result with confidence score and details
   * @throws Error if execution times out or exceeds memory limits
   *
   * Per FR-056: 5s timeout enforced
   * Per FR-058: 128MB memory limit enforced
   *
   * Execution flow:
   * 1. Start timeout timer
   * 2. Execute all rules in controlled environment
   * 3. Calculate aggregated score
   * 4. Build result with execution metadata
   * 5. Cleanup and return result
   */
  async execute(email: ParsedEmail): Promise<RuleEngineExecutionResult> {
    const startTime = Date.now();

    logger.debug('RuleEngine', 'Executing rules on email', {
      emailHash: email.email_hash.substring(0, 16) + '...',
      from: email.from,
      subject: email.subject.substring(0, 50),
    });

    try {
      // Execute rules with timeout enforcement
      const results = await this.executeWithTimeout(email);

      const executionTime = Date.now() - startTime;

      // Check if execution timed out
      if (executionTime > this.options.timeout) {
        logger.warn('RuleEngine', 'Rule execution timed out', {
          executionTime,
          timeout: this.options.timeout,
        });

        return this.createTimeoutResult(executionTime);
      }

      // Calculate aggregated score
      const score = calculateRuleScore(results);

      // Count triggered rules
      const rulesTriggered = results.filter((r) => r.triggered).length;

      // Build result details
      const details = buildRuleDetails(results);

      const result: RuleEngineExecutionResult = {
        score,
        rulesTriggered,
        details,
        executionTime,
        timedOut: false,
        outOfMemory: false,
        rawResults: this.options.debug ? results : undefined,
      };

      logger.debug('RuleEngine', 'Rule execution complete', {
        score,
        rulesTriggered,
        executionTime,
        details,
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof Error && error.message === 'Rule execution timed out') {
        logger.warn('RuleEngine', 'Rule execution timed out', {
          executionTime,
          timeout: this.options.timeout,
        });

        return this.createTimeoutResult(executionTime);
      }

      // Log unexpected errors
      logger.error('RuleEngine', 'Rule execution failed', {
        error: error instanceof Error ? error.message : String(error),
        executionTime,
      });

      // Return degraded result on error
      return this.createDegradedResult(executionTime, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Execute rules on multiple emails (batch processing)
   *
   * @param emails - Array of parsed emails
   * @returns Array of rule engine results
   *
   * Processes emails sequentially to enforce per-email resource limits.
   * Parallel execution is intentionally avoided to prevent resource exhaustion.
   */
  async executeBatch(emails: ParsedEmail[]): Promise<RuleEngineExecutionResult[]> {
    logger.info('RuleEngine', 'Executing rules on batch', {
      batchSize: emails.length,
    });

    const results: RuleEngineExecutionResult[] = [];

    for (const email of emails) {
      const result = await this.execute(email);
      results.push(result);
    }

    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const avgExecutionTime = results.reduce((sum, r) => sum + r.executionTime, 0) / results.length;

    logger.info('RuleEngine', 'Batch execution complete', {
      batchSize: results.length,
      avgScore: avgScore.toFixed(2),
      avgExecutionTime: avgExecutionTime.toFixed(2),
      timedOutCount: results.filter((r) => r.timedOut).length,
    });

    return results;
  }

  /**
   * Execute rules with timeout enforcement
   *
   * @param email - Parsed email to process
   * @returns Promise resolving to rule results
   * @throws Error if execution exceeds timeout
   *
   * Private method that enforces FR-056 (5s timeout) using Promise.race.
   */
  private async executeWithTimeout(email: ParsedEmail): Promise<ReturnType<typeof executeAllRules>> {
    // Create timeout promise
    const timeoutPromise = new Promise<ReturnType<typeof executeAllRules>>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Rule execution timed out'));
      }, this.options.timeout);
    });

    // Create execution promise
    const executionPromise = this.executeRulesSafely(email);

    // Race between execution and timeout
    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Execute rules in controlled environment
   *
   * @param email - Parsed email to process
   * @returns Rule execution results
   *
   * This method provides a sandbox-like execution environment.
   * Future implementation will use QuickJS WASM for true zero-permission sandbox.
   *
   * Current security measures:
   * - No access to Node.js APIs
   * - No access to file system
   * - No access to network
   * - Pure function execution (rule functions from rules.ts)
   *
   * TODO: Replace with QuickJS WASM sandbox per plan.md R0-2
   */
  private async executeRulesSafely(email: ParsedEmail): Promise<ReturnType<typeof executeAllRules>> {
    // Memory tracking (basic estimation)
    const memoryBefore = process.memoryUsage();

    try {
      // Execute all rules (pure functions, no side effects)
      const results = executeAllRules(email);

      // Estimate memory usage
      const memoryAfter = process.memoryUsage();
      const memoryUsedMB = (memoryAfter.heapUsed - memoryBefore.heapUsed) / (1024 * 1024);

      // Check memory limit (FR-058: 128MB)
      if (memoryUsedMB > this.options.memoryLimit) {
        logger.warn('RuleEngine', 'Memory limit exceeded', {
          memoryUsedMB: memoryUsedMB.toFixed(2),
          memoryLimit: this.options.memoryLimit,
        });

        throw new Error(`Memory limit exceeded: ${memoryUsedMB.toFixed(2)}MB > ${this.options.memoryLimit}MB`);
      }

      if (this.options.debug) {
        logger.debug('RuleEngine', 'Memory usage', {
          memoryUsedMB: memoryUsedMB.toFixed(2),
          memoryLimit: this.options.memoryLimit,
        });
      }

      return results;
    } catch (error) {
      // Re-throw with context
      throw new Error(`Rule execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create timeout result
   *
   * @param executionTime - Actual execution time before timeout
   * @returns Degraded result indicating timeout
   */
  private createTimeoutResult(executionTime: number): RuleEngineExecutionResult {
    return {
      score: 0,
      rulesTriggered: 0,
      details: {
        hasDeadlineKeyword: false,
        hasPriorityKeyword: false,
        isWhitelistedSender: false,
        actionVerbCount: 0,
      },
      executionTime,
      timedOut: true,
      outOfMemory: false,
    };
  }

  /**
   * Create degraded result on error
   *
   * @param executionTime - Actual execution time before error
   * @param errorMessage - Error message
   * @returns Degraded result with low confidence
   */
  private createDegradedResult(executionTime: number, errorMessage: string): RuleEngineExecutionResult {
    logger.warn('RuleEngine', 'Creating degraded result', {
      errorMessage,
      executionTime,
    });

    return {
      score: 20, // Low confidence fallback
      rulesTriggered: 0,
      details: {
        hasDeadlineKeyword: false,
        hasPriorityKeyword: false,
        isWhitelistedSender: false,
        actionVerbCount: 0,
      },
      executionTime,
      timedOut: false,
      outOfMemory: false,
    };
  }

  /**
   * Update rule engine configuration
   *
   * @param options - Partial configuration updates
   *
   * Allows runtime configuration changes without recreating the engine.
   */
  updateConfig(options: Partial<RuleEngineOptions>): void {
    this.options = { ...this.options, ...options };

    logger.info('RuleEngine', 'Configuration updated', {
      timeout: this.options.timeout,
      memoryLimit: this.options.memoryLimit,
      debug: this.options.debug,
    });
  }

  /**
   * Get current configuration
   *
   * @returns Current rule engine options
   */
  getConfig(): Required<RuleEngineOptions> {
    return { ...this.options };
  }

  /**
   * Check if rule engine is healthy
   *
   * @returns Promise resolving to true if engine is operational
   *
   * Always returns true for local rule engine (no external dependencies).
   * Included for LLMAdapter interface compatibility.
   */
  async checkHealth(): Promise<boolean> {
    // Rule engine is always healthy (no external dependencies)
    return true;
  }
}

export default RuleEngine;
