/**
 * Type declarations for electron-updater when the package is not yet installed.
 * Install electron-updater for runtime: pnpm add electron-updater
 *
 * @see https://www.electron.build/auto-update
 */

declare module 'electron-updater' {
  export interface UpdateInfo {
    version: string;
    releaseDate?: string;
    releaseNotes?: string | string[];
  }

  export interface UpdateDownloadedEvent {
    version: string;
  }

  interface AutoUpdater {
    setFeedURL(options: { provider: string; owner: string; repo: string }): void;
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    checkForUpdates(): Promise<{ updateInfo: UpdateInfo } | null>;
    downloadUpdate(): Promise<string[]>;
    on(event: 'update-available', callback: (info: UpdateInfo) => void): void;
    on(event: 'update-not-available', callback: (info: UpdateInfo) => void): void;
    on(event: 'update-downloaded', callback: (info: UpdateDownloadedEvent) => void): void;
    on(event: 'error', callback: (error: Error) => void): void;
  }

  export const autoUpdater: AutoUpdater;

  const updater: { autoUpdater: AutoUpdater };
  export default updater;
}
