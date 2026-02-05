/**
 * IPC Channel Definitions
 *
 * All IPC channels used in the application.
 * Channels are whitelisted per Constitution Principle V.
 *
 * Naming convention: domain:action (e.g., llm:generate, db:query:history)
 */

export const IPC_CHANNELS = {
  // LLM processing
  LLM_GENERATE: 'llm:generate',

  // Database queries
  DB_QUERY_HISTORY: 'db:query:history',

  // Database export
  DB_EXPORT: 'db:export',

  // Configuration management
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',

  // Update checking
  APP_CHECK_UPDATE: 'app:check-update',

  // Email metadata fetching
  EMAIL_FETCH_META: 'email:fetch-meta',

  // Feedback submission
  FEEDBACK_SUBMIT: 'feedback:submit',
  FEEDBACK_STATS: 'feedback:stats',
  FEEDBACK_DESTROY: 'feedback:destroy',

  // Onboarding / First-run disclosure
  ONBOARDING_GET_STATUS: 'onboarding:get-status',
  ONBOARDING_ACKNOWLEDGE: 'onboarding:acknowledge',
} as const;

export type IPCChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

/**
 * Validate that a channel name is in the whitelist
 */
export function isValidChannel(channel: string): channel is IPCChannel {
  return Object.values(IPC_CHANNELS).includes(channel as IPCChannel);
}

/**
 * Get all channel names
 */
export function getAllChannels(): IPCChannel[] {
  return Object.values(IPC_CHANNELS);
}

export default IPC_CHANNELS;
