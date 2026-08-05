/**
 * Renderer Process Global Type Declarations
 *
 * Extends the global Window interface with Electron IPC APIs.
 */

/// <reference types="vite/client" />

import type {
    ConnectionResult,
    OnboardingStatus,
    RunDetail,
    RunSummary,
    SettingsView,
    ValidationResult,
} from '@shared/types/app';

declare global {
    interface Window {
        electronAPI?: {
            onboarding: {
                getStatus: () => Promise<OnboardingStatus>;
                detectOutlookDir: () => Promise<{
                    detectedPath: string | null;
                    reason: string;
                }>;
                validateOutlookDir: (request: {
                    directoryPath: string;
                }) => Promise<ValidationResult>;
                testLLMConnection: (config: {
                    baseUrl: string;
                    apiKey: string;
                    model: string;
                }) => Promise<ConnectionResult>;
                complete: (request: {
                    directoryPath: string;
                    baseUrl: string;
                    apiKey: string;
                    model: string;
                }) => Promise<{ success: boolean; error?: string }>;
            };
            runs: {
                start: () => Promise<{ success: boolean; runId: string | null; message: string }>;
                getLatest: () => Promise<RunDetail | null>;
                getById: (request: { runId: string }) => Promise<RunDetail | null>;
                listRecent: (request?: { limit?: number }) => Promise<RunSummary[]>;
            };
            settings: {
                getAll: () => Promise<
                    Pick<SettingsView, 'outlookDirectory' | 'aiBaseUrl' | 'aiModel'>
                >;
                update: (request: {
                    outlookDirectory?: string;
                    aiBaseUrl?: string;
                    apiKey?: string;
                    aiModel?: string;
                }) => Promise<{ success: boolean; error?: string }>;
                getDataSummary: () => Promise<SettingsView>;
                clearRuns: () => Promise<{ success: boolean; deletedRunCount: number }>;
                rebuildIndex: () => Promise<{ success: boolean; message: string }>;
            };
        };
    }
}

export {};
