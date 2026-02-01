/**
 * Electron SafeStorage Type Extension
 *
 * Extends Electron's SafeStorage API to support multi-parameter getPassword/setPassword
 * for compatibility with keychain-style storage (service, account, password).
 */

import 'electron';

declare module 'electron' {
  interface SafeStorage {
    /**
     * Get password from keychain storage
     * @param service - Service name (e.g., 'mailcopilot')
     * @param account - Account name (e.g., 'encryption_key')
     * @returns Password buffer or undefined if not found
     */
    getPassword(service: string, account: string): Buffer | undefined;

    /**
     * Set password in keychain storage
     * @param service - Service name (e.g., 'mailcopilot')
     * @param account - Account name (e.g., 'encryption_key')
     * @param password - Password to store
     */
    setPassword(service: string, account: string, password: string): void;
  }
}

export {};
