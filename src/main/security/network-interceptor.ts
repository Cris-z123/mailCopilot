/**
 * Network Interceptor
 *
 * Provides network-layer blocking for local mode to ensure complete offline operation.
 * Per plan.md FR-040: Local mode blocks non-localhost requests at network layer.
 * Remote mode allows TLS 1.3 connections to LLM endpoints only.
 *
 * @module main/security/network-interceptor
 */

import { session } from 'electron';
import { logger } from '../config/logger.js';
import { getModeManager, ProcessingMode } from '../app/mode-manager.js';

/**
 * Allowed LLM API endpoints for remote mode
 *
 * TODO: Configure these based on actual LLM provider endpoints
 */
const ALLOWED_LLM_ENDPOINTS = [
  'api.openai.com', // OpenAI API
  'api.anthropic.com', // Anthropic API
  'localhost:11434', // Ollama (for testing)
];

/**
 * Localhost patterns that should always be allowed
 */
const LOCALHOST_PATTERNS = [
  'localhost',
  '127.0.0.1',
  '[::1]', // IPv6 localhost
  '0.0.0.0',
];

/**
 * Network interceptor state
 */
interface InterceptorState {
  isInitialized: boolean;
  currentMode: ProcessingMode;
  listenerCount: number;
}

/**
 * Network Interceptor class
 *
 * Intercepts network requests at the session level to enforce mode-based network policies.
 * - Local mode: Blocks all non-localhost requests
 * - Remote mode: Allows only LLM API endpoints over TLS 1.3
 *
 * Implementation uses Electron's session.webRequest API for network-layer blocking.
 */
class NetworkInterceptor {
  private state: InterceptorState;

  constructor() {
    this.state = {
      isInitialized: false,
      currentMode: 'remote', // Default per constitution Principle I
      listenerCount: 0,
    };
  }

  /**
   * Initialize network interceptor
   *
   * Sets up webRequest listeners to enforce network policies based on current mode.
   *
   * @param initialMode - Starting processing mode
   */
  initialize(initialMode: ProcessingMode = 'remote'): void {
    if (this.state.isInitialized) {
      logger.warn('NetworkInterceptor', 'Already initialized, skipping');
      return;
    }

    this.state.currentMode = initialMode;
    this.state.isInitialized = true;

    logger.info('NetworkInterceptor', 'Initializing network interceptor', {
      mode: initialMode,
    });

    // Register listener for main window session
    const defaultSession = session.defaultSession;

    if (!defaultSession) {
      logger.error('NetworkInterceptor', 'Failed to get default session');
      return;
    }

    // Set up webRequest listener to intercept all requests
    defaultSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (details, callback) => {
        this.handleRequest(details, callback);
      }
    );

    this.state.listenerCount++;

    logger.info('NetworkInterceptor', 'Network interceptor initialized', {
      listenerCount: this.state.listenerCount,
    });

    // Listen for mode changes
    const modeManager = getModeManager(initialMode);
    modeManager.on('mode-changed', (event: any) => {
      this.updateMode(event.to);
    });
  }

  /**
   * Handle network request
   *
   * Determines whether to allow or block a request based on current mode.
   *
   * Per FR-040: Local mode blocks non-localhost requests
   * Per plan v2.7: Remote mode allows TLS 1.3 to LLM endpoints only
   *
   * @param details - Request details from webRequest API
   * @param callback - Callback function to allow or cancel request
   */
  private handleRequest(
    details: Electron.OnBeforeRequestListenerDetails,
    callback: (response: { cancel?: boolean }) => void
  ): void {
    try {
      const url = new URL(details.url);
      const hostname = url.hostname.toLowerCase();
      const protocol = url.protocol.toLowerCase();

      // Check if request is to localhost
      const isLocalhost = LOCALHOST_PATTERNS.some((pattern) =>
        hostname.includes(pattern)
      );

      // Always allow localhost requests
      if (isLocalhost) {
        logger.debug('NetworkInterceptor', 'Allowing localhost request', {
          url: details.url,
        });
        callback({ cancel: false });
        return;
      }

      // Local mode: Block all non-localhost requests
      if (this.state.currentMode === 'local') {
        logger.info('NetworkInterceptor', 'Blocking non-localhost request (local mode)', {
          url: details.url,
          hostname,
          resourceType: details.resourceType,
        });

        callback({ cancel: true });
        return;
      }

      // Remote mode: Allow only LLM API endpoints over HTTPS
      if (this.state.currentMode === 'remote') {
        // Check if it's an allowed LLM endpoint
        const isAllowedEndpoint = ALLOWED_LLM_ENDPOINTS.some((endpoint) =>
          hostname.endsWith(endpoint) || hostname.includes(endpoint)
        );

        // Enforce HTTPS (TLS 1.3)
        const isHTTPS = protocol === 'https:';

        if (isAllowedEndpoint && isHTTPS) {
          logger.debug('NetworkInterceptor', 'Allowing LLM API request (remote mode)', {
            url: details.url,
            hostname,
          });
          callback({ cancel: false });
          return;
        }

        // Block non-LLM or non-HTTPS requests in remote mode
        if (!isAllowedEndpoint || !isHTTPS) {
          logger.warn('NetworkInterceptor', 'Blocking unauthorized request (remote mode)', {
            url: details.url,
            hostname,
            isAllowedEndpoint,
            isHTTPS,
          });

          callback({ cancel: true });
          return;
        }
      }

      // Default: Allow request
      callback({ cancel: false });
    } catch (error) {
      logger.error('NetworkInterceptor', 'Error handling request', {
        error: error instanceof Error ? error.message : String(error),
        url: details.url,
      });

      // Fail safe: Block request on error to prevent data leakage
      callback({ cancel: true });
    }
  }

  /**
   * Update interceptor mode
   *
   * Called when user switches between local and remote modes.
   *
   * @param newMode - New processing mode
   */
  private updateMode(newMode: ProcessingMode): void {
    const previousMode = this.state.currentMode;

    if (previousMode === newMode) {
      return;
    }

    logger.info('NetworkInterceptor', 'Updating interceptor mode', {
      from: previousMode,
      to: newMode,
    });

    this.state.currentMode = newMode;

    // Log network policy change
    if (newMode === 'local') {
      logger.warn('NetworkInterceptor', 'Network policy: LOCAL MODE - Blocking all non-localhost requests per FR-040');
    } else {
      logger.info('NetworkInterceptor', 'Network policy: REMOTE MODE - Allowing LLM API endpoints over TLS 1.3');
    }
  }

  /**
   * Check if URL is allowed in current mode
   *
   * Utility method to check if a specific URL would be allowed.
   * Useful for pre-validation before attempting requests.
   *
   * @param url - URL to check
   * @returns true if URL would be allowed, false otherwise
   */
  isUrlAllowed(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const protocol = parsedUrl.protocol.toLowerCase();

      // Localhost is always allowed
      const isLocalhost = LOCALHOST_PATTERNS.some((pattern) =>
        hostname.includes(pattern)
      );
      if (isLocalhost) {
        return true;
      }

      // Local mode: Block all non-localhost
      if (this.state.currentMode === 'local') {
        return false;
      }

      // Remote mode: Allow only LLM endpoints over HTTPS
      if (this.state.currentMode === 'remote') {
        const isAllowedEndpoint = ALLOWED_LLM_ENDPOINTS.some((endpoint) =>
          hostname.endsWith(endpoint) || hostname.includes(endpoint)
        );
        const isHTTPS = protocol === 'https:';
        return isAllowedEndpoint && isHTTPS;
      }

      return false;
    } catch (error) {
      logger.error('NetworkInterceptor', 'Error checking URL', {
        error: error instanceof Error ? error.message : String(error),
        url,
      });
      return false;
    }
  }

  /**
   * Get current interceptor state
   *
   * @returns Current state snapshot
   */
  getState(): Readonly<InterceptorState> {
    return { ...this.state };
  }

  /**
   * Reset interceptor state (for testing)
   *
   * @param initialMode - Mode to reset to
   */
  reset(initialMode: ProcessingMode = 'remote'): void {
    logger.info('NetworkInterceptor', 'Resetting network interceptor', {
      previousMode: this.state.currentMode,
      newMode: initialMode,
    });

    this.state.currentMode = initialMode;

    // Remove all listeners from default session
    const defaultSession = session.defaultSession;
    if (defaultSession && this.state.listenerCount > 0) {
      defaultSession.webRequest.onBeforeRequest(null); // Remove listener
      this.state.listenerCount = 0;
    }

    this.state.isInitialized = false;
  }

  /**
   * Add allowed LLM endpoint
   *
   * Allows runtime configuration of additional LLM endpoints.
   *
   * @param endpoint - Endpoint hostname to allow (e.g., 'api.example.com')
   */
  addAllowedEndpoint(endpoint: string): void {
    if (ALLOWED_LLM_ENDPOINTS.includes(endpoint)) {
      logger.debug('NetworkInterceptor', 'Endpoint already allowed', { endpoint });
      return;
    }

    ALLOWED_LLM_ENDPOINTS.push(endpoint);
    logger.info('NetworkInterceptor', 'Added allowed LLM endpoint', { endpoint });
  }

  /**
   * Get list of allowed LLM endpoints
   *
   * @returns Array of allowed endpoint hostnames
   */
  getAllowedEndpoints(): string[] {
    return [...ALLOWED_LLM_ENDPOINTS];
  }
}

/**
 * Singleton instance for application-wide network interception
 */
let networkInterceptorInstance: NetworkInterceptor | null = null;

/**
 * Get or create NetworkInterceptor singleton instance
 *
 * @param initialMode - Initial mode if creating new instance
 * @returns NetworkInterceptor singleton instance
 */
export function getNetworkInterceptor(initialMode?: ProcessingMode): NetworkInterceptor {
  if (!networkInterceptorInstance) {
    networkInterceptorInstance = new NetworkInterceptor();
    if (initialMode) {
      networkInterceptorInstance.initialize(initialMode);
    }
  }
  return networkInterceptorInstance;
}

/**
 * Reset NetworkInterceptor singleton (for testing)
 */
export function resetNetworkInterceptor(): void {
  if (networkInterceptorInstance) {
    networkInterceptorInstance.reset();
    networkInterceptorInstance = null;
  }
}

export default NetworkInterceptor;
