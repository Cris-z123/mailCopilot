import { z } from 'zod';

/**
 * Base Zod Schemas for validation
 *
 * These schemas provide type-safe validation for all data structures
 * per plan.md contracts section.
 */

// =============================================================================
// LLM Output Schemas
// =============================================================================

/**
 * Individual action item schema
 * Per plan.md FR-006 and Principle II: source_email_indices is REQUIRED for traceability
 */
export const ItemSchema = z.object({
  content: z.string().min(1),
  type: z.enum(['completed', 'pending']),
  source_email_indices: z.array(z.number()).min(1), // Required, must have at least one index
  evidence: z.string().min(1),
  confidence: z.number().min(0).max(100),
  source_status: z.enum(['verified', 'unverified']).default('verified'),
});

export type Item = z.infer<typeof ItemSchema>;

/**
 * Complete LLM output schema
 */
export const LLMOutputSchema = z.object({
  items: z.array(ItemSchema),
  batch_info: z.object({
    total_emails: z.number(),
    processed_emails: z.number(),
    skipped_emails: z.number(),
  }),
});

export type LLMOutput = z.infer<typeof LLMOutputSchema>;

// =============================================================================
// Email Metadata Schemas
// =============================================================================

/**
 * Email attachment metadata
 */
export const AttachmentMetadataSchema = z.object({
  filename: z.string(),
  size: z.number().nonnegative(),
  mime_type: z.string(),
});

export type AttachmentMetadata = z.infer<typeof AttachmentMetadataSchema>;

/**
 * Complete email metadata schema
 */
export const EmailMetadataSchema = z.object({
  email_hash: z.string(),
  message_id: z.string().optional(),
  from: z.string().email(),
  subject: z.string(),
  date: z.string(), // ISO 8601
  attachments: z.array(AttachmentMetadataSchema),
  file_path: z.string(),
  format: z.enum(['eml', 'msg', 'pst', 'ost', 'mbox', 'html']),
});

export type EmailMetadata = z.infer<typeof EmailMetadataSchema>;

// =============================================================================
// Configuration Schemas
// =============================================================================

/**
 * Desensitization rule schema
 */
export const DesensitizationRuleSchema = z.object({
  name: z.string(),
  pattern: z.string(), // Regex pattern
  enabled: z.boolean(),
});

export type DesensitizationRule = z.infer<typeof DesensitizationRuleSchema>;

/**
 * LLM configuration schema
 */
export const LLMConfigSchema = z.object({
  mode: z.enum(['local', 'remote']),
  localEndpoint: z.string().url().default('http://localhost:11434'),
  remoteEndpoint: z.string().url().optional(),
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

/**
 * Storage configuration schema
 */
export const StorageConfigSchema = z.object({
  retentionDays: z.union([z.number(), z.literal(-1)]), // -1 = 永久
  feedbackRetentionDays: z.union([z.number(), z.literal(-1)]),
});

export type StorageConfig = z.infer<typeof StorageConfigSchema>;

/**
 * Update configuration schema
 */
export const UpdateConfigSchema = z.object({
  autoCheck: z.boolean(),
});

export type UpdateConfig = z.infer<typeof UpdateConfigSchema>;

/**
 * Complete configuration schema
 */
export const ConfigSchema = z.object({
  llm: LLMConfigSchema,
  storage: StorageConfigSchema,
  update: UpdateConfigSchema,
  desensitization: z.object({
    rules: z.array(DesensitizationRuleSchema),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

// =============================================================================
// IPC Request/Response Schemas
// =============================================================================

/**
 * Email input for LLM processing
 */
export const EmailInputSchema = z.object({
  filePath: z.string(),
  format: z.enum(['eml', 'msg', 'pst', 'ost', 'mbox', 'html']),
  content: z.string().optional(),
});

export type EmailInput = z.infer<typeof EmailInputSchema>;

/**
 * LLM generate request schema
 */
export const LLMGenerateRequestSchema = z.object({
  emails: z.array(EmailInputSchema),
  mode: z.enum(['local', 'remote']),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type LLMGenerateRequest = z.infer<typeof LLMGenerateRequestSchema>;

/**
 * Processed email response schema
 */
export const ProcessedEmailSchema = z.object({
  email_hash: z.string(),
  search_string: z.string(),
  file_path: z.string(),
  extract_status: z.enum(['success', 'no_content', 'error']),
  error_log: z.string().optional(),
});

export type ProcessedEmail = z.infer<typeof ProcessedEmailSchema>;

/**
 * LLM generate response schema
 */
export const LLMGenerateResponseSchema = z.object({
  success: z.boolean(),
  items: z.array(ItemSchema),
  processed_emails: z.array(ProcessedEmailSchema),
  skipped_emails: z.number(),
  reprocessed_emails: z.number(),
});

export type LLMGenerateResponse = z.infer<typeof LLMGenerateResponseSchema>;

/**
 * Database query filter schema
 */
export const QueryFilterSchema = z.object({
  source_status: z.enum(['verified', 'unverified']).optional(),
  item_type: z.enum(['completed', 'pending']).optional(),
  min_confidence: z.number().min(0).max(1).optional(),
});

export type QueryFilter = z.infer<typeof QueryFilterSchema>;

/**
 * Database query request schema
 */
export const DBQueryRequestSchema = z.object({
  query: z.enum(['get_reports', 'get_items', 'get_report_detail']),
  params: z.object({
    reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().positive().optional(),
    offset: z.number().nonnegative().optional(),
    filterBy: QueryFilterSchema.optional(),
  }),
});

export type DBQueryRequest = z.infer<typeof DBQueryRequestSchema>;

/**
 * Daily report summary schema
 */
export const DailyReportSummarySchema = z.object({
  report_date: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
  generation_mode: z.enum(['local', 'remote']),
  completed_count: z.number(),
  pending_count: z.number(),
  summary: z.string(),
});

export type DailyReportSummary = z.infer<typeof DailyReportSummarySchema>;

/**
 * Item source reference schema
 */
export const ItemSourceRefSchema = z.object({
  email_hash: z.string(),
  search_string: z.string(),
  file_path: z.string(),
  evidence_text: z.string(),
  confidence: z.number(),
});

export type ItemSourceRef = z.infer<typeof ItemSourceRefSchema>;

/**
 * Todo item with sources schema
 */
export const TodoItemWithSourcesSchema = z.object({
  item_id: z.string(),
  report_date: z.string(),
  content: z.string(),
  item_type: z.enum(['completed', 'pending']),
  source_status: z.enum(['verified', 'unverified']),
  confidence_score: z.number().min(0).max(1),
  tags: z.array(z.string()),
  feedback_type: z.enum(['content_error', 'priority_error', 'not_actionable', 'source_error']).optional(),
  created_at: z.number(),
  sources: z.array(ItemSourceRefSchema),
});

export type TodoItemWithSources = z.infer<typeof TodoItemWithSourcesSchema>;

/**
 * Database export request schema
 */
export const DBExportRequestSchema = z.object({
  format: z.enum(['markdown', 'pdf']),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeAll: z.boolean().optional(),
});

export type DBExportRequest = z.infer<typeof DBExportRequestSchema>;

/**
 * Database export response schema
 */
export const DBExportResponseSchema = z.object({
  success: z.boolean(),
  filePath: z.string(),
  format: z.enum(['markdown', 'pdf']),
  itemCount: z.number(),
});

export type DBExportResponse = z.infer<typeof DBExportResponseSchema>;

/**
 * Config get request schema
 */
export const ConfigGetRequestSchema = z.object({
  keys: z.array(z.string()).optional(),
});

export type ConfigGetRequest = z.infer<typeof ConfigGetRequestSchema>;

/**
 * Config get response schema
 */
export const ConfigGetResponseSchema = z.object({
  config: z.record(z.any()),
});

export type ConfigGetResponse = z.infer<typeof ConfigGetResponseSchema>;

/**
 * Config set request schema
 */
export const ConfigSetRequestSchema = z.object({
  updates: z.record(z.any()),
});

export type ConfigSetRequest = z.infer<typeof ConfigSetRequestSchema>;

/**
 * Config set response schema
 */
export const ConfigSetResponseSchema = z.object({
  success: z.boolean(),
  updated: z.array(z.string()),
});

export type ConfigSetResponse = z.infer<typeof ConfigSetResponseSchema>;

/**
 * Update check request schema
 */
export const UpdateCheckRequestSchema = z.object({
  mode: z.enum(['auto', 'manual']),
});

export type UpdateCheckRequest = z.infer<typeof UpdateCheckRequestSchema>;

/**
 * Update check response schema
 */
export const UpdateCheckResponseSchema = z.object({
  hasUpdate: z.boolean(),
  version: z.string().optional(),
  releaseNotes: z.string().optional(),
  downloadUrl: z.string().optional(),
});

export type UpdateCheckResponse = z.infer<typeof UpdateCheckResponseSchema>;

/**
 * Email metadata fetch request schema
 */
export const EmailFetchMetaRequestSchema = z.object({
  filePath: z.string(),
  format: z.enum(['eml', 'msg', 'pst', 'ost', 'mbox', 'html']),
});

export type EmailFetchMetaRequest = z.infer<typeof EmailFetchMetaRequestSchema>;

/**
 * Email metadata fetch response schema
 */
export const EmailFetchMetaResponseSchema = z.object({
  success: z.boolean(),
  metadata: z.object({
    from: z.string().email().optional(),
    subject: z.string().optional(),
    date: z.string().optional(),
    attachmentCount: z.number().optional(),
    size: z.number().optional(),
    format: z.string().optional(),
  }).optional(),
  error: z.string().optional(),
});

export type EmailFetchMetaResponse = z.infer<typeof EmailFetchMetaResponseSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validate data against schema
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safely validate data against schema (returns null if invalid)
 */
export function safeValidateData<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

export default {
  ItemSchema,
  LLMOutputSchema,
  EmailMetadataSchema,
  ConfigSchema,
  LLMGenerateRequestSchema,
  LLMGenerateResponseSchema,
  DBQueryRequestSchema,
  DBExportRequestSchema,
  ConfigGetRequestSchema,
  ConfigSetRequestSchema,
  UpdateCheckRequestSchema,
  EmailFetchMetaRequestSchema,
  validateData,
  safeValidateData,
};
