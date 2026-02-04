/**
 * Rule Definitions
 *
 * Defines rule execution logic for email action item extraction.
 * Per plan.md R0-2 and Decision 2: Rule engine provides domain-specific confidence
 * through keyword detection, sender whitelist, deadline detection, and priority detection.
 *
 * @module main/rules/rules
 */

import type { ParsedEmail } from '../email/parsers/EmailParser.js';

/**
 * Rule execution result
 *
 * Returned by rule execution functions to provide confidence scores and evidence.
 */
export interface RuleResult {
  /** Rule identifier */
  ruleName: string;

  /** Confidence score contribution (0-100) */
  score: number;

  /** Evidence/rationale for score */
  evidence: string;

  /** Whether rule was triggered */
  triggered: boolean;
}

/**
 * Rule execution context
 *
 * Provides email data and metadata for rule evaluation.
 */
export interface RuleContext {
  /** Parsed email with metadata and body */
  email: ParsedEmail;

  /** Email body content (lowercased for case-insensitive matching) */
  bodyLowercase: string;

  /** Email subject (lowercased) */
  subjectLowercase: string;

  /** Sender email address (lowercased) */
  fromLowercase: string;
}

/**
 * Deadline keyword detection rule
 *
 * Per plan.md: Detects deadline-related keywords to increase confidence.
 * Keywords: deadline, due date, 截止, 到期, etc.
 *
 * FR-058: Resource limits ensure this rule executes within 5s timeout.
 */
export function detectDeadlineKeywords(context: RuleContext): RuleResult {
  const keywords = [
    'deadline',
    'due date',
    'due by',
    '截止',
    '到期',
    '截止日期',
    '到期日',
    '期限',
    'timeline',
    'schedule',
    'milestone',
  ];

  const body = context.bodyLowercase;
  const subject = context.subjectLowercase;

  // Check both body and subject for deadline keywords
  const detectedKeywords = keywords.filter((kw) => body.includes(kw) || subject.includes(kw));

  if (detectedKeywords.length > 0) {
    return {
      ruleName: 'deadline_keywords',
      score: 25, // Base score for deadline detection
      evidence: `Detected deadline keywords: ${detectedKeywords.join(', ')}`,
      triggered: true,
    };
  }

  return {
    ruleName: 'deadline_keywords',
    score: 0,
    evidence: 'No deadline keywords detected',
    triggered: false,
  };
}

/**
 * Priority keyword detection rule
 *
 * Per plan.md: Detects priority-related keywords to increase confidence.
 * Keywords: urgent, asap, important, 紧急, 重要, high priority, etc.
 */
export function detectPriorityKeywords(context: RuleContext): RuleResult {
  const keywords = [
    'urgent',
    'asap',
    'as soon as possible',
    'important',
    'priority',
    'high priority',
    '紧急',
    '重要',
    '高优先级',
    '急需',
    'immediately',
    'right away',
    'critica',
  ];

  const body = context.bodyLowercase;
  const subject = context.subjectLowercase;

  const detectedKeywords = keywords.filter((kw) => body.includes(kw) || subject.includes(kw));

  if (detectedKeywords.length > 0) {
    return {
      ruleName: 'priority_keywords',
      score: 20, // Base score for priority detection
      evidence: `Detected priority keywords: ${detectedKeywords.join(', ')}`,
      triggered: true,
    };
  }

  return {
    ruleName: 'priority_keywords',
    score: 0,
    evidence: 'No priority keywords detected',
    triggered: false,
  };
}

/**
 * Sender whitelist detection rule
 *
 * Per plan.md: Known senders (whitelist) increase confidence.
 * This rule checks if the sender is in a configurable whitelist.
 *
 * TODO: Load whitelist from configuration/database (currently hardcoded for demo).
 */
export function detectWhitelistedSender(context: RuleContext): RuleResult {
  // TODO: Load from configuration
  const whitelistedSenders = [
    'boss@company.com',
    'manager@company.com',
    'hr@company.com',
    'ceo@company.com',
  ];

  const sender = context.fromLowercase;

  if (whitelistedSenders.some((whitelisted) => sender.includes(whitelisted))) {
    return {
      ruleName: 'whitelisted_sender',
      score: 30, // High confidence for known senders
      evidence: 'Sender is in whitelist',
      triggered: true,
    };
  }

  return {
    ruleName: 'whitelisted_sender',
    score: 0,
    evidence: 'Sender not in whitelist',
    triggered: false,
  };
}

/**
 * Action verb detection rule
 *
 * Per plan.md: Detects action-oriented language indicating task commitments.
 * Keywords: please, need to, must, require, 请, 需要, etc.
 */
export function detectActionVerbs(context: RuleContext): RuleResult {
  const actionVerbs = [
    'please',
    'need to',
    'must',
    'require',
    'should',
    'have to',
    'expect',
    'request',
    'ask',
    '请',
    '需要',
    '必须',
    '要求',
    '期望',
    '请求',
    'assign',
    'task',
    'follow up',
    'review',
    'complete',
    'finish',
    'submit',
    'deliver',
  ];

  const body = context.bodyLowercase;
  const subject = context.subjectLowercase;

  // Count unique action verbs found
  const detectedVerbs = actionVerbs.filter((verb) => body.includes(verb) || subject.includes(verb));

  if (detectedVerbs.length > 0) {
    // Score scales with number of action verbs (max 5 verbs for full score)
    const verbScore = Math.min(detectedVerbs.length * 5, 15);

    return {
      ruleName: 'action_verbs',
      score: verbScore,
      evidence: `Detected ${detectedVerbs.length} action verbs: ${detectedVerbs.slice(0, 3).join(', ')}${detectedVerbs.length > 3 ? '...' : ''}`,
      triggered: true,
    };
  }

  return {
    ruleName: 'action_verbs',
    score: 0,
    evidence: 'No action verbs detected',
    triggered: false,
  };
}

/**
 * Commitment language detection rule
 *
 * Per plan.md: Detects explicit commitment statements.
 * Keywords: i will, i'll, we will, we'll, agree to, confirm, etc.
 */
export function detectCommitmentLanguage(context: RuleContext): RuleResult {
  const commitmentPhrases = [
    'i will',
    "i'll",
    'we will',
    "we'll",
    'agree to',
    'confirmed',
    'confirm',
    'committed',
    'commit to',
    'promise',
    'guarantee',
    '我会',
    '我们将',
    '确认',
    '承诺',
    '保证',
    'accept',
    'accepted',
  ];

  const body = context.bodyLowercase;

  const detectedPhrases = commitmentPhrases.filter((phrase) => body.includes(phrase));

  if (detectedPhrases.length > 0) {
    return {
      ruleName: 'commitment_language',
      score: 10, // Base score for commitment language
      evidence: `Detected commitment phrases: ${detectedPhrases.join(', ')}`,
      triggered: true,
    };
  }

  return {
    ruleName: 'commitment_language',
    score: 0,
    evidence: 'No commitment language detected',
    triggered: false,
  };
}

/**
 * Execute all rules on an email
 *
 * Per plan.md Decision 2: Rule engine provides domain-specific confidence
 * through keyword density, sender whitelist, deadline detection, and priority detection.
 *
 * @param email - Parsed email with metadata and body
 * @returns Array of rule execution results
 *
 * Example:
 * ```typescript
 * const results = executeAllRules(parsedEmail);
 * const totalScore = results.reduce((sum, r) => sum + r.score, 0);
 * console.log(`Rule engine confidence: ${totalScore}/100`);
 * ```
 */
export function executeAllRules(email: ParsedEmail): RuleResult[] {
  // Prepare context (lowercase for case-insensitive matching)
  const context: RuleContext = {
    email,
    bodyLowercase: email.body?.toLowerCase() ?? '',
    subjectLowercase: email.subject.toLowerCase(),
    fromLowercase: email.from.toLowerCase(),
  };

  // Execute all rules in sequence
  const results: RuleResult[] = [
    detectDeadlineKeywords(context),
    detectPriorityKeywords(context),
    detectWhitelistedSender(context),
    detectActionVerbs(context),
    detectCommitmentLanguage(context),
  ];

  return results;
}

/**
 * Calculate aggregated rule engine score
 *
 * Per plan.md Decision 2: Rule engine score is 0-100, used in dual-engine
 * confidence calculation (rules 50% + LLM 50%).
 *
 * @param results - Array of rule execution results
 * @returns Aggregated score (0-100)
 */
export function calculateRuleScore(results: RuleResult[]): number {
  const totalScore = results.reduce((sum, result) => sum + result.score, 0);

  // Cap at 100
  return Math.min(totalScore, 100);
}

/**
 * Build rule execution details for confidence calculation
 *
 * Per ConfidenceCalculator.RuleEngineResult interface requirements.
 *
 * @param results - Array of rule execution results
 * @returns Rule engine details object
 */
export function buildRuleDetails(results: RuleResult[]): {
  hasDeadlineKeyword: boolean;
  hasPriorityKeyword: boolean;
  isWhitelistedSender: boolean;
  actionVerbCount: number;
} {
  return {
    hasDeadlineKeyword: results.some((r) => r.ruleName === 'deadline_keywords' && r.triggered),
    hasPriorityKeyword: results.some((r) => r.ruleName === 'priority_keywords' && r.triggered),
    isWhitelistedSender: results.some((r) => r.ruleName === 'whitelisted_sender' && r.triggered),
    actionVerbCount: results.find((r) => r.ruleName === 'action_verbs')?.triggered
      ? results.find((r) => r.ruleName === 'action_verbs')!.evidence.match(/\d+/)?.[0]
        ? parseInt(results.find((r) => r.ruleName === 'action_verbs')!.evidence.match(/\d+/)![0], 10)
        : 0
      : 0,
  };
}

export default {
  executeAllRules,
  calculateRuleScore,
  buildRuleDetails,
};
