import type {
    ConnectionResult,
    OnboardingStatus,
    RunDetail,
    RunSummary,
    SettingsView,
    ValidationResult,
} from '@shared/types/app';

const fallbackSettings: SettingsView = {
    outlookDirectory: '',
    aiBaseUrl: '',
    aiModel: '',
    databasePath: '',
    databaseSizeBytes: 0,
};

const apiUnavailableMessage =
    'Electron API is unavailable. This may be due to running in a non-Electron environment.';

function getApi() {
    return window.electronAPI;
}

export const appApi = {
    async getOnboardingStatus(): Promise<OnboardingStatus> {
        const api = getApi();
        if (!api) {
            return {
                completed: false,
                currentStep: 1,
                readablePstCount: 0,
                outlookDirectory: null,
            };
        }

        return api.onboarding.getStatus();
    },

    async detectOutlookDirectory(): Promise<string | null> {
        const api = getApi();
        if (!api) return null;

        const result = await api.onboarding.detectOutlookDir();
        return result.detectedPath;
    },

    async validateOutlookDirectory(directoryPath: string): Promise<ValidationResult> {
        const api = getApi();
        if (!api) {
            return {
                valid: false,
                readablePstCount: 0,
                unreadablePstCount: 0,
                files: [],
                message: apiUnavailableMessage,
            };
        }

        return api.onboarding.validateOutlookDir({ directoryPath });
    },

    async testConnection(
        baseUrl: string,
        apiKey: string,
        model: string,
    ): Promise<ConnectionResult> {
        const api = getApi();
        if (!api) {
            return {
                success: false,
                responseTimeMs: null,
                message: apiUnavailableMessage,
            };
        }

        return api.onboarding.testLLMConnection({
            baseUrl,
            apiKey,
            model,
        });
    },

    async completeSetup(request: {
        directoryPath: string;
        baseUrl: string;
        apiKey: string;
        model: string;
    }): Promise<{ success: boolean; error?: string }> {
        const api = getApi();
        if (!api) return { success: false, error: apiUnavailableMessage };
        return api.onboarding.complete(request);
    },

    async startRun(): Promise<{ success: boolean; runId: string | null; message: string }> {
        const api = getApi();
        if (!api) {
            return { success: false, runId: null, message: apiUnavailableMessage };
        }

        return api.runs.start();
    },

    async getLatestRun(): Promise<RunDetail | null> {
        const api = getApi();
        if (!api) return null;
        return api.runs.getLatest();
    },

    async getRunById(runId: string): Promise<RunDetail | null> {
        const api = getApi();
        if (!api) return null;
        return api.runs.getById({ runId });
    },

    async listRecentRuns(): Promise<RunSummary[]> {
        const api = getApi();
        if (!api) return [];
        return api.runs.listRecent({ limit: 20 });
    },

    async getSettingsSummary(): Promise<SettingsView> {
        const api = getApi();
        if (!api) return fallbackSettings;
        return api.settings.getDataSummary();
    },

    async updateSettings(updates: Partial<SettingsView> & { apiKey?: string }): Promise<boolean> {
        const api = getApi();
        if (!api) return false;

        const result = await api.settings.update(updates);
        return result.success;
    },

    async clearRuns(): Promise<{ success: boolean; deletedRunCount: number }> {
        const api = getApi();
        if (!api) return { success: false, deletedRunCount: 0 };
        return api.settings.clearRuns();
    },

    async rebuildIndex(): Promise<{ success: boolean; message: string }> {
        const api = getApi();
        if (!api) return { success: false, message: apiUnavailableMessage };
        return api.settings.rebuildIndex();
    },
};

export default appApi;
