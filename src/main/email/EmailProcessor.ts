/**
 * Email Processor - Orchestrates end-to-end email processing pipeline
 *
 * Per plan.md Email Processing Pipeline:
 * 1. DuplicateDetector (SHA-256 fingerprint check)
 * 2. EmailParser (format-specific parser)
 * 3. RuleEngine (QuickJS sandbox, 50% confidence)
 * 4. LLM Adapter (Remote/Local, 50% confidence)
 * 5. OutputValidator (Zod schema + degradation)
 * 6. ConfidenceCalculator (rule+LLM weighted sum)
 * 7. Database storage (ActionItem + EmailSource + ItemEmailRef)
 *
 * @module main/email/EmailProcessor
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/config/logger.js';
import { DuplicateDetector } from './DuplicateDetector.js';
import { EmlParser } from './parsers/EmlParser.js';
import { TraceabilityGenerator } from './TraceabilityGenerator.js';
import { RuleEngine } from '@/rules/RuleEngine.js';
import type { LLMAdapter, EmailBatch } from '@/llm/LLMAdapter.js';
import { OutputValidator } from '@/llm/OutputValidator.js';
import { ConfidenceCalculator } from '@/llm/ConfidenceCalculator.js';
import { ActionItemRepository, ItemType, SourceStatus } from '@/database/entities/ActionItem.js';
import { EmailSourceRepository, ExtractStatus } from '@/database/entities/EmailSource.js';
import { ItemEmailRefRepository } from '@/database/entities/ItemEmailRef.js';
import type { ParsedEmail } from './parsers/EmailParser.js';

/**
 * Email processing options
 *
 * Per plan.md constraints:
 * - Maximum batch size: 50 emails
 * - Email body truncated to 100k characters
 * - 30s timeout for LLM requests
 */
export interface EmailProcessorOptions {
  /** Maximum batch size (default: 50 per FR-057) */
  maxBatchSize?: number;

  /** Maximum email body length in characters (default: 100k) */
  maxBodyLength?: number;

  /** Enable detailed logging for debugging */
  debug?: boolean;
}

/**
 * Email processing result
 *
 * Contains extracted items, processing statistics, and error information.
 */
export interface EmailProcessorResult {
  /** Extracted action items with confidence scores */
  items: Array<{
    item_id: string;
    content: string;
    item_type: 'completed' | 'pending';
    confidence: number;
    source_status: 'verified' | 'unverified';
    evidence: string;
  }>;

  /** Processing statistics */
  batch_info: {
    /** Total emails in input batch */
    total_emails: number;

    /** Successfully processed emails */
    processed_emails: number;

    /** Skipped emails (duplicates, parsing failures) */
    skipped_emails: number;

    /** Same-batch duplicates skipped */
    same_batch_duplicates: number;

    /** Cross-batch duplicates updated */
    cross_batch_duplicates: number;
  };

  /** Whether processing was successful */
  success: boolean;

  /** Error message if processing failed */
  error?: string;
}

/**
 * Processing context for error handling
 *
 * Tracks intermediate state for degradation handling per FR-018.
 */
interface ProcessingContext {
  /** Report date for all items in this batch */
  reportDate: string;

  /** Processing mode (affects confidence calculation) */
  mode: 'local' | 'remote';

  /** Duplicate detection statistics */
  duplicateStats: ReturnType<DuplicateDetector['createStats']>;

  /** Emails that failed parsing */
  parseErrors: Array<{ email: string; error: string }>;

  /** Whether schema validation failed (triggers degraded mode) */
  isDegraded: boolean;
}

/**
 * Default email processor configuration
 *
 * Per plan.md constraints:
 * - FR-057: Maximum batch size 50 emails
 * - FR-057: Email body truncation 100k characters
 */
const DEFAULT_OPTIONS: Required<EmailProcessorOptions> = {
  maxBatchSize: 50,
  maxBodyLength: 100000,
  debug: false,
};

/**
 * Email Processor
 *
 * Orchestrates the complete email processing pipeline from file input to database storage.
 *
 * Per plan.md:
 * - R0-4: SHA-256 fingerprint duplicate detection
 * - R0-8: Dual-engine confidence calculation (rules 50% + LLM 50%)
 * - FR-018: Degraded items stored with source_status='unverified', confidence ≤ 0.6
 * - FR-008A: Cross-batch duplicate detection with last_seen_at update
 *
 * Pipeline Flow:
 * 1. Parse emails (format-specific parsers)
 * 2. Check duplicates (SHA-256 fingerprint)
 * 3. Execute rule engine (QuickJS sandbox, 50% confidence)
 * 4. Call LLM adapter (remote/local, 50% confidence)
 * 5. Validate output (Zod schema, 2-retry limit)
 * 6. Calculate confidence (weighted sum: rules 50% + LLM 50%)
 * 7. Store to database (ActionItem + EmailSource + ItemEmailRef)
 *
 * Example:
 * ```typescript
 * const processor = new EmailProcessor(llmAdapter);
 * const result = await processor.processBatch(emailFiles, '2026-01-31', 'remote');
 * console.log(`Extracted ${result.items.length} items`);
 * console.log(`Processed: ${result.batch_info.processed_emails}/${result.batch_info.total_emails}`);
 * ```
 */
export class EmailProcessor {
  private llmAdapter: LLMAdapter;
  private ruleEngine: RuleEngine;
  private duplicateDetector: DuplicateDetector;
  private traceabilityGenerator: TraceabilityGenerator;
  private emlParser: EmlParser;
  private options: Required<EmailProcessorOptions>;

  /**
   * Create a new EmailProcessor instance
   *
   * @param llmAdapter - LLM adapter (local or remote)
   * @param options - Processor configuration options
   */
  constructor(llmAdapter: LLMAdapter, options: EmailProcessorOptions = {}) {
    this.llmAdapter = llmAdapter;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Initialize pipeline components
    this.ruleEngine = new RuleEngine({
      timeout: 5000, // 5s per FR-056
      memoryLimit: 128, // 128MB per FR-058
      debug: this.options.debug,
    });

    this.duplicateDetector = new DuplicateDetector();
    this.traceabilityGenerator = new TraceabilityGenerator();
    this.emlParser = new EmlParser();

    logger.info('EmailProcessor', 'EmailProcessor initialized', {
      maxBatchSize: this.options.maxBatchSize,
      maxBodyLength: this.options.maxBodyLength,
      llmMode: llmAdapter.getConfig().model ?? 'unknown',
    });
  }

  /**
   * Process a batch of email files through the complete pipeline
   *
   * @param emailFiles - Array of email file paths
   * @param reportDate - Report date in YYYY-MM-DD format
   * @param mode - Processing mode ('local' or 'remote')
   * @returns Promise resolving to processing result with extracted items
   *
   * Processing steps:
   * 1. Parse all emails (detect format, extract metadata)
   * 2. Check duplicates (same-batch skip, cross-batch update timestamp)
   * 3. Execute rule engine on unique emails
   * 4. Call LLM adapter for item extraction
   * 5. Validate LLM output (Zod schema, retry with reinforcement)
   * 6. Calculate confidence (rules 50% + LLM 50%, cap at 0.6 for degraded)
   * 7. Store to database (ActionItem + EmailSource + ItemEmailRef)
   *
   * Per FR-018: Degraded items are stored with source_status='unverified',
   * confidence ≤ 0.6, never discarded (Principle II: Anti-Hallucination)
   */
  async processBatch(
    emailFiles: string[],
    reportDate: string,
    mode: 'local' | 'remote'
  ): Promise<EmailProcessorResult> {
    const startTime = Date.now();

    logger.info('EmailProcessor', 'Starting batch processing', {
      emailCount: emailFiles.length,
      reportDate,
      mode,
      maxBatchSize: this.options.maxBatchSize,
    });

    // Validate batch size
    if (emailFiles.length > this.options.maxBatchSize) {
      const error = `Batch size ${emailFiles.length} exceeds maximum ${this.options.maxBatchSize}`;
      logger.error('EmailProcessor', error);

      return {
        items: [],
        batch_info: {
          total_emails: emailFiles.length,
          processed_emails: 0,
          skipped_emails: emailFiles.length,
          same_batch_duplicates: 0,
          cross_batch_duplicates: 0,
        },
        success: false,
        error,
      };
    }

    try {
      // Initialize processing context
      const context: ProcessingContext = {
        reportDate,
        mode,
        duplicateStats: this.duplicateDetector.createStats(),
        parseErrors: [],
        isDegraded: false,
      };

      // Step 1: Parse emails
      const { parsedEmails, parseErrors } = await this.parseEmails(emailFiles);
      context.parseErrors = parseErrors;

      logger.info('EmailProcessor', 'Email parsing complete', {
        total: emailFiles.length,
        parsed: parsedEmails.length,
        parseErrors: parseErrors.length,
      });

      // Step 2: Check duplicates
      const { unique, duplicates, stats } = await this.duplicateDetector.batchCheckDuplicates(
        parsedEmails
      );
      context.duplicateStats = stats;

      logger.info('EmailProcessor', 'Duplicate detection complete', {
        unique: unique.length,
        duplicates: duplicates.length,
        same_batch: stats.same_batch_count,
        cross_batch: stats.cross_batch_count,
      });

      // Step 3: Execute rule engine
      const ruleResults = await this.ruleEngine.executeBatch(unique);

      logger.info('EmailProcessor', 'Rule engine execution complete', {
        ruleResultsCount: ruleResults.length,
        avgRuleScore: (
          ruleResults.reduce((sum, r) => sum + r.score, 0) / ruleResults.length
        ).toFixed(2),
      });

      // Step 4: Call LLM adapter
      const emailBatch: EmailBatch = {
        emails: unique,
        reportDate,
        mode,
      };

      const llmOutput = await this.llmAdapter.generate(emailBatch);

      logger.info('EmailProcessor', 'LLM generation complete', {
        itemCount: llmOutput.items.length,
        totalEmails: llmOutput.batch_info.total_emails,
        processedEmails: llmOutput.batch_info.processed_emails,
        skippedEmails: llmOutput.batch_info.skipped_emails,
      });

      // Step 5: Validate LLM output
      const validationResult = await OutputValidator.validate(llmOutput);
      context.isDegraded = validationResult.isDegraded;

      logger.info('EmailProcessor', 'Output validation complete', {
        itemCount: validationResult.output.items.length,
        firstItem: validationResult.output.items[0],
      });

      logger.info('EmailProcessor', 'Output validation complete', {
        isValid: validationResult.isValid,
        isDegraded: validationResult.isDegraded,
        retryCount: validationResult.retryCount,
        itemCount: validationResult.output.items.length,
      });

      // Step 6: Calculate confidence for each item
      const confidenceResults = this.calculateConfidenceForBatch(
        validationResult.output.items,
        ruleResults,
        context.isDegraded
      );

      logger.info('EmailProcessor', 'Confidence calculation complete', {
        itemCount: confidenceResults.length,
        isDegraded: context.isDegraded,
        avgConfidence: (
          confidenceResults.reduce((sum, r) => sum + r.confidence, 0) / confidenceResults.length
        ).toFixed(3),
      });

      // Step 7: Store to database
      const storedItems = await this.storeToDatabase(
        confidenceResults,
        validationResult.output.items,
        unique,
        context
      );

      const executionTime = Date.now() - startTime;

      logger.info('EmailProcessor', 'Batch processing complete', {
        executionTime,
        itemsStored: storedItems.length,
        totalEmails: emailFiles.length,
        processedEmails: unique.length,
        skippedEmails: emailFiles.length - unique.length,
        sameBatchDuplicates: stats.same_batch_count,
        crossBatchDuplicates: stats.cross_batch_count,
        parseErrors: parseErrors.length,
        isDegraded: context.isDegraded,
      });

      return {
        items: storedItems,
        batch_info: {
          total_emails: emailFiles.length,
          processed_emails: unique.length,
          skipped_emails: emailFiles.length - unique.length,
          same_batch_duplicates: stats.same_batch_count,
          cross_batch_duplicates: stats.cross_batch_count,
        },
        success: true,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('EmailProcessor', 'Batch processing failed', {
        executionTime,
        error: errorMessage,
        emailCount: emailFiles.length,
        reportDate,
        mode,
      });

      return {
        items: [],
        batch_info: {
          total_emails: emailFiles.length,
          processed_emails: 0,
          skipped_emails: emailFiles.length,
          same_batch_duplicates: 0,
          cross_batch_duplicates: 0,
        },
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Parse email files
   *
   * @param emailFiles - Array of email file paths
   * @returns Promise resolving to parsed emails and parse errors
   *
   * Detects email format from file extension and delegates to appropriate parser.
   * Currently only .eml format is supported (T067-T070 will add more parsers).
   */
  private async parseEmails(
    emailFiles: string[]
  ): Promise<{ parsedEmails: ParsedEmail[]; parseErrors: Array<{ email: string; error: string }> }> {
    const parsedEmails: ParsedEmail[] = [];
    const parseErrors: Array<{ email: string; error: string }> = [];

    for (const filePath of emailFiles) {
      try {
        // Detect format from file extension
        const format = this.detectEmailFormat(filePath);

        if (format !== 'eml') {
          logger.warn('EmailProcessor', `Unsupported email format: ${format}`, {
            filePath,
            format,
          });
          parseErrors.push({
            email: filePath,
            error: `Unsupported format: ${format} (only .eml supported in MVP)`,
          });
          continue;
        }

        // Parse email
        const parsedEmail = await this.emlParser.parse(filePath);

        // Truncate body if necessary (per FR-057)
        if (parsedEmail.body && parsedEmail.body.length > this.options.maxBodyLength) {
          parsedEmail.body = parsedEmail.body.substring(0, this.options.maxBodyLength);
          logger.debug('EmailProcessor', 'Email body truncated', {
            filePath,
            originalLength: parsedEmail.body.length,
            truncatedLength: this.options.maxBodyLength,
          });
        }

        // Generate search string for traceability
        const traceabilityInfo = this.traceabilityGenerator.generateTraceability(parsedEmail);
        parsedEmail.search_string = traceabilityInfo.search_string;
        parsedEmail.file_path = filePath;

        parsedEmails.push(parsedEmail);

        logger.debug('EmailProcessor', 'Email parsed successfully', {
          filePath,
          emailHash: parsedEmail.email_hash.substring(0, 16) + '...',
          message_id: parsedEmail.message_id,
          from: parsedEmail.from,
          subject: parsedEmail.subject.substring(0, 50),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('EmailProcessor', 'Failed to parse email', {
          filePath,
          error: errorMessage,
        });
        parseErrors.push({
          email: filePath,
          error: errorMessage,
        });
      }
    }

    return { parsedEmails, parseErrors };
  }

  /**
   * Detect email format from file extension
   *
   * @param filePath - Email file path
   * @returns Email format ('eml', 'msg', 'pst', 'ost', 'mbox', 'html')
   *
   * TODO: T075 will implement format detection logic with file extension validation
   */
  private detectEmailFormat(filePath: string): 'eml' | 'msg' | 'pst' | 'ost' | 'mbox' | 'html' {
    const extension = filePath.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'eml':
        return 'eml';
      case 'msg':
        return 'msg';
      case 'pst':
      case 'ost':
        return extension;
      case 'mbox':
      case 'mbx':
        return 'mbox';
      case 'html':
      case 'htm':
        return 'html';
      default:
        // Default to eml for MVP
        return 'eml';
    }
  }

  /**
   * Calculate confidence for all extracted items
   *
   * @param llmItems - Items extracted by LLM
   * @param uniqueEmails - Unique non-duplicate emails
   * @param ruleResults - Rule engine execution results
   * @param isDegraded - Whether schema validation failed (triggers degraded mode)
   * @returns Array of confidence calculation results
   *
   * Per FR-010: Schema failure adjustment (rules 60% + LLM 20%, capped at 0.6)
   *
   * Maps LLM items to rule engine results based on source_email_indices.
   * For items without source attribution, uses average rule score.
   */
  private calculateConfidenceForBatch(
    llmItems: Array<{ content: string; type: 'completed' | 'pending'; source_email_indices?: number[]; evidence: string; confidence: number; source_status: 'verified' | 'unverified' }>,
    ruleResults: Array<{ score: number; rulesTriggered: number; details: { hasDeadlineKeyword: boolean; hasPriorityKeyword: boolean; isWhitelistedSender: boolean; actionVerbCount: number } }>,
    isDegraded: boolean
  ): Array<{ confidence: number; ruleContribution: number; llmContribution: number; isDegraded: boolean; details: { ruleScore: number; llmScore: number; ruleWeight: number; llmWeight: number; capApplied: boolean } }> {
    // Calculate average rule score for fallback
    // Default to 0 if no rule results (e.g., no emails parsed)
    const avgRuleScore =
      ruleResults.length > 0
        ? ruleResults.reduce((sum, r) => sum + r.score, 0) / ruleResults.length
        : 0;

    return llmItems.map((llmItem) => {
      // Map LLM item to rule result based on source_email_indices
      let ruleResult;

      if (llmItem.source_email_indices && llmItem.source_email_indices.length > 0) {
        // Use rule result from first source email
        const firstEmailIndex = llmItem.source_email_indices[0];
        ruleResult = ruleResults[firstEmailIndex] || {
          score: avgRuleScore,
          rulesTriggered: 0,
          details: {
            hasDeadlineKeyword: false,
            hasPriorityKeyword: false,
            isWhitelistedSender: false,
            actionVerbCount: 0,
          },
        };
      } else {
        // No source attribution, use average rule score (degraded)
        ruleResult = {
          score: avgRuleScore,
          rulesTriggered: 0,
          details: {
            hasDeadlineKeyword: false,
            hasPriorityKeyword: false,
            isWhitelistedSender: false,
            actionVerbCount: 0,
          },
        };
      }

      // Calculate confidence using dual-engine formula
      return ConfidenceCalculator.calculate(ruleResult, llmItem, {
        isDegraded,
        // FR-010: Schema failure adjustment (rules 60% + LLM 20%, capped at 0.6)
        maxConfidence: isDegraded ? 0.6 : 1.0,
      });
    });
  }

  /**
   * Store extracted items to database
   *
   * @param confidenceResults - Confidence calculation results
   * @param llmItems - LLM-extracted items
   * @param uniqueEmails - Unique non-duplicate emails
   * @param context - Processing context (report date, mode, etc.)
   * @returns Promise resolving to stored items with metadata
   *
   * Stores:
   * - ActionItem records with encrypted content
   * - EmailSource records with metadata
   * - ItemEmailRef junction records (many-to-many relationship)
   *
   * Per FR-018: Degraded items are stored with source_status='unverified',
   * never discarded (Principle II: Anti-Hallucination)
   */
  private async storeToDatabase(
    confidenceResults: Array<{ confidence: number; ruleContribution: number; llmContribution: number; isDegraded: boolean; details: { ruleScore: number; llmScore: number; ruleWeight: number; llmWeight: number; capApplied: boolean } }>,
    llmItems: Array<{ content: string; type: 'completed' | 'pending'; source_email_indices?: number[]; evidence: string; confidence: number; source_status: 'verified' | 'unverified' }>,
    uniqueEmails: ParsedEmail[],
    context: ProcessingContext
  ): Promise<Array<{ item_id: string; content: string; item_type: 'completed' | 'pending'; confidence: number; source_status: 'verified' | 'unverified'; evidence: string }>> {
    const storedItems: Array<{
      item_id: string;
      content: string;
      item_type: 'completed' | 'pending';
      confidence: number;
      source_status: 'verified' | 'unverified';
      evidence: string;
    }> = [];

    // Store email sources
    for (const email of uniqueEmails) {
      try {
        EmailSourceRepository.create(email.email_hash, {
          processed_at: Math.floor(Date.now() / 1000),
          last_seen_at: Math.floor(Date.now() / 1000),
          report_date: context.reportDate,
          attachments_meta: JSON.stringify(email.attachments || []),
          extract_status: ExtractStatus.SUCCESS,
          search_string: email.search_string || '',
          file_path: email.file_path || '',
        });
      } catch (error) {
        // Email source might already exist (cross-batch duplicate)
        logger.debug('EmailProcessor', 'Email source already exists, skipping', {
          emailHash: email.email_hash.substring(0, 16) + '...',
        });
      }
    }

    // Store action items with email references
    for (let i = 0; i < llmItems.length; i++) {
      const llmItem = llmItems[i];
      const confidenceResult = confidenceResults[i];

      const item_id = uuidv4();

      try {
        // Create action item
        await ActionItemRepository.create(item_id, {
          report_date: context.reportDate,
          content: llmItem.content,
          item_type: llmItem.type === 'completed' ? ItemType.COMPLETED : ItemType.PENDING,
          source_status: context.isDegraded ? SourceStatus.UNVERIFIED : (llmItem.source_status === 'verified' ? SourceStatus.VERIFIED : SourceStatus.UNVERIFIED),
          confidence_score: confidenceResult.confidence,
          tags: [],
          created_at: Math.floor(Date.now() / 1000),
          is_manually_edited: false,
        });

        // Create email references if source_email_indices provided
        if (llmItem.source_email_indices && llmItem.source_email_indices.length > 0) {
          for (let j = 0; j < llmItem.source_email_indices.length; j++) {
            const emailIndex = llmItem.source_email_indices[j];
            const email = uniqueEmails[emailIndex];

            if (email) {
              const ref_id = uuidv4();
              ItemEmailRefRepository.create(ref_id, {
                item_id,
                email_hash: email.email_hash,
                evidence_text: llmItem.evidence || '',
                confidence: Math.round(confidenceResult.confidence * 100),
              });
            }
          }
        }

        storedItems.push({
          item_id,
          content: llmItem.content,
          item_type: llmItem.type,
          confidence: confidenceResult.confidence,
          source_status: context.isDegraded ? 'unverified' : llmItem.source_status,
          evidence: llmItem.evidence,
        } as any);

        logger.debug('EmailProcessor', 'Action item stored', {
          item_id,
          contentPreview: llmItem.content.substring(0, 50),
          confidence: confidenceResult.confidence,
          source_status: context.isDegraded ? 'unverified' : llmItem.source_status,
          isDegraded: context.isDegraded,
        });
      } catch (error) {
        logger.error('EmailProcessor', 'Failed to store action item', {
          item_id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with next item (partial failure handling)
      }
    }

    return storedItems;
  }

  /**
   * Update LLM adapter configuration
   *
   * @param config - Partial configuration updates
   *
   * Allows runtime configuration changes without recreating the processor.
   * Used for mode switching (per US5: hot mode switching without restart).
   */
  updateLLMAdapter(config: Partial<{ timeout: number; maxRetries: number; debug: boolean; endpoint: string; apiKey: string; model: string }>): void {
    this.llmAdapter.updateConfig(config);

    logger.info('EmailProcessor', 'LLM adapter configuration updated', {
      config,
    });
  }

  /**
   * Update rule engine configuration
   *
   * @param options - Partial configuration updates
   */
  updateRuleEngine(options: Partial<{ timeout: number; memoryLimit: number; debug: boolean }>): void {
    this.ruleEngine.updateConfig(options);

    logger.info('EmailProcessor', 'Rule engine configuration updated', {
      options,
    });
  }

  /**
   * Check if processor is healthy
   *
   * @returns Promise resolving to true if all components are operational
   */
  async checkHealth(): Promise<boolean> {
    try {
      // Check LLM adapter health
      const llmHealthy = await this.llmAdapter.checkHealth();
      if (!llmHealthy) {
        logger.warn('EmailProcessor', 'LLM adapter health check failed');
        return false;
      }

      // Rule engine is always healthy (no external dependencies)
      return true;
    } catch (error) {
      logger.error('EmailProcessor', 'Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
