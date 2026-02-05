/**
 * Onboarding Handler
 *
 * Handles first-run disclosure acknowledgment per Constitution Principle I:
 * - Default remote mode on first launch
 * - Explicit disclosure of data transmission scope
 * - Store user acknowledgment
 * - Only show on first launch
 *
 * References:
 * - Spec FR-031: System MUST default to remote mode on first launch
 * - Constitution Principle I: Privacy-First Architecture
 * - Task T018b: Implement disclosure acknowledgment handler
 */

import { ipcMain } from 'electron';
import type { Database } from 'better-sqlite3';
import { IPC_CHANNELS } from '../channels.js';

interface OnboardingStatus {
  hasAcknowledgedDisclosure: boolean;
  disclosureVersion: string;
  acknowledgedAt?: number;
}

const CURRENT_DISCLOSURE_VERSION = '1.0.0';
const DISCLOSURE_KEY = 'onboarding_disclosure';

/**
 * Get onboarding status from database
 */
async function getOnboardingStatus(db: Database): Promise<OnboardingStatus> {
  try {
    const row = db
      .prepare(
        `
        SELECT value FROM app_metadata
        WHERE key = ?
      `
      )
      .get(DISCLOSURE_KEY) as { value: string } | undefined;

    if (!row) {
      return {
        hasAcknowledgedDisclosure: false,
        disclosureVersion: CURRENT_DISCLOSURE_VERSION,
      };
    }

    const data = JSON.parse(row.value) as OnboardingStatus;
    return data;
  } catch (error) {
    console.error('Failed to get onboarding status:', error);
    return {
      hasAcknowledgedDisclosure: false,
      disclosureVersion: CURRENT_DISCLOSURE_VERSION,
    };
  }
}

/**
 * Save onboarding acknowledgment to database
 */
async function saveAcknowledgment(db: Database): Promise<void> {
  try {
    const data: OnboardingStatus = {
      hasAcknowledgedDisclosure: true,
      disclosureVersion: CURRENT_DISCLOSURE_VERSION,
      acknowledgedAt: Date.now(),
    };

    db
      .prepare(
        `
        INSERT OR REPLACE INTO app_metadata (key, value)
        VALUES (?, ?)
      `
      )
      .run(DISCLOSURE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save onboarding acknowledgment:', error);
    throw error;
  }
}

/**
 * Register onboarding IPC handlers
 */
export function registerOnboardingHandlers(db: Database): void {
  /**
   * Get onboarding status
   * Returns whether the user has acknowledged the first-run disclosure
   */
  ipcMain.handle(IPC_CHANNELS.ONBOARDING_GET_STATUS, async () => {
    const status = await getOnboardingStatus(db);
    return status;
  });

  /**
   * Acknowledge first-run disclosure
   * Stores the user's acknowledgment that they understand the data transmission scope
   */
  ipcMain.handle(IPC_CHANNELS.ONBOARDING_ACKNOWLEDGE, async () => {
    await saveAcknowledgment(db);
    return { success: true };
  });
}

/**
 * Disclosure text for remote mode (per Constitution Principle I)
 */
export const REMOTE_MODE_DISCLOSURE = {
  title: 'Data Transmission Notice',
  content: [
    'Using remote mode will send email content to third-party LLM service via TLS 1.3 encryption.',
    'All processing occurs remotely.',
    'No data is stored on external servers.',
  ],
  buttonText: 'I Understand',
  settingsLink: 'You can change modes in Settings at any time.',
};

/**
 * Disclosure text for local mode option
 */
export const LOCAL_MODE_INFO = {
  title: 'Local Mode Available',
  content: [
    'For complete privacy, you can switch to local mode.',
    'Local mode processes all data on your device using Ollama.',
    'No data is transmitted to external services.',
  ],
};
