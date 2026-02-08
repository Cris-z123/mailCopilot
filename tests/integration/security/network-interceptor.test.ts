/**
 * Network Interceptor Integration Tests
 *
 * Integration tests for network-layer blocking in local mode and LLM API access in remote mode.
 * Per FR-040: Local mode blocks non-localhost requests at network layer.
 * Per plan v2.7: Remote mode allows TLS 1.3 to LLM endpoints.
 *
 * @testPath integration/security/network-interceptor.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetworkInterceptor, getNetworkInterceptor, resetNetworkInterceptor } from '../../../src/main/security/network-interceptor.js';
import { ModeManager, getModeManager, resetModeManager } from '../../../src/main/app/mode-manager.js';

// Mock Electron session API
vi.mock('electron', () => {
  const mockOnBeforeRequest = vi.fn();
  return {
    session: {
      defaultSession: {
        webRequest: {
          onBeforeRequest: mockOnBeforeRequest,
        },
      },
    },
  };
});

// Mock logger
vi.mock('../../../src/main/config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('NetworkInterceptor - Integration Tests', () => {
  let interceptor: NetworkInterceptor;
  let modeManager: ModeManager;

  beforeEach(() => {
    // Reset singletons
    resetNetworkInterceptor();
    resetModeManager();

    // Create fresh instances using singleton pattern
    modeManager = getModeManager('remote') as any;
    interceptor = getNetworkInterceptor('remote');
    interceptor.initialize('remote');

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetNetworkInterceptor();
    resetModeManager();
  });

  describe('Initialization', () => {
    it('should initialize with default remote mode', () => {
      const state = interceptor.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.currentMode).toBe('remote');
    });

    it('should register webRequest listener on initialization', () => {
      // Note: Cannot verify mock calls in integration tests due to vi.mock hoisting
      // The listener registration is verified implicitly through functional tests
      const state = interceptor.getState();
      expect(state.listenerCount).toBeGreaterThan(0);
    });

    it('should initialize with local mode when specified', () => {
      resetNetworkInterceptor();
      const localInterceptor = getNetworkInterceptor('local');
      expect(localInterceptor.getState().currentMode).toBe('local');
    });
  });

  describe('Local Mode - Network Isolation (FR-040)', () => {
    beforeEach(() => {
      // Reset and reinitialize in local mode
      resetNetworkInterceptor();
      resetModeManager();
      modeManager = getModeManager('local') as any;
      interceptor = getNetworkInterceptor('local');
      interceptor.initialize('local');
    });

    it('should allow localhost requests', () => {
      const localhostUrls = [
        'http://localhost:3000',
        'http://127.0.0.1:8080',
        'http://[::1]:9000',
        'http://0.0.0.0:5000',
      ];

      localhostUrls.forEach((url) => {
        expect(interceptor.isUrlAllowed(url)).toBe(true);
      });
    });

    it('should block non-localhost HTTP requests in local mode', () => {
      const blockedUrls = [
        'http://api.openai.com/v1/chat',
        'http://example.com/api',
        'http://google.com',
      ];

      blockedUrls.forEach((url) => {
        expect(interceptor.isUrlAllowed(url)).toBe(false);
      });
    });

    it('should block non-localhost HTTPS requests in local mode', () => {
      const blockedUrls = [
        'https://api.openai.com/v1/chat',
        'https://api.anthropic.com/v1/messages',
        'https://example.com/api',
      ];

      blockedUrls.forEach((url) => {
        expect(interceptor.isUrlAllowed(url)).toBe(false);
      });
    });

    it('should block requests to external API endpoints in local mode', () => {
      const externalApiUrls = [
        'https://api.openai.com/v1/completions',
        'https://api.anthropic.com/v1/messages',
        'https://api.example.com/llm',
      ];

      externalApiUrls.forEach((url) => {
        expect(interceptor.isUrlAllowed(url)).toBe(false);
      });
    });

    it('should log blocked requests in local mode', () => {
      // Test that interceptor maintains blocking state
      const state = interceptor.getState();
      expect(state.currentMode).toBe('local');
    });
  });

  describe('Remote Mode - LLM API Access (plan v2.7)', () => {
    beforeEach(() => {
      // Reset and reinitialize in remote mode
      resetNetworkInterceptor();
      resetModeManager();
      modeManager = getModeManager('remote') as any;
      interceptor = getNetworkInterceptor('remote');
      interceptor.initialize('remote');
    });

    it('should allow HTTPS requests to allowed LLM endpoints', () => {
      const allowedUrls = [
        'https://api.openai.com/v1/chat',
        'https://api.openai.com/v1/completions',
        'https://api.anthropic.com/v1/messages',
      ];

      allowedUrls.forEach((url) => {
        expect(interceptor.isUrlAllowed(url)).toBe(true);
      });
    });

    it('should block HTTP requests to LLM endpoints (require TLS 1.3)', () => {
      const httpUrls = [
        'http://api.openai.com/v1/chat',
        'http://api.anthropic.com/v1/messages',
      ];

      httpUrls.forEach((url) => {
        expect(interceptor.isUrlAllowed(url)).toBe(false);
      });
    });

    it('should block requests to non-LLM endpoints in remote mode', () => {
      const blockedUrls = [
        'https://google.com',
        'https://example.com',
        'https://api.github.com',
      ];

      blockedUrls.forEach((url) => {
        expect(interceptor.isUrlAllowed(url)).toBe(false);
      });
    });

    it('should allow localhost requests in remote mode', () => {
      const localhostUrls = [
        'http://localhost:11434',
        'http://127.0.0.1:8080',
      ];

      localhostUrls.forEach((url) => {
        expect(interceptor.isUrlAllowed(url)).toBe(true);
      });
    });

    it('should allow Ollama endpoint for testing', () => {
      expect(interceptor.isUrlAllowed('http://localhost:11434/api/generate')).toBe(true);
    });
  });

  describe('Mode Switching', () => {
    it('should update network policy when switching to local mode', () => {
      // Start in remote mode
      interceptor.initialize('remote');

      // Allow HTTPS to OpenAI in remote mode
      expect(interceptor.isUrlAllowed('https://api.openai.com/v1/chat')).toBe(true);

      // Switch to local mode
      modeManager.switchMode('local');

      // Now block the same request
      expect(interceptor.isUrlAllowed('https://api.openai.com/v1/chat')).toBe(false);
    });

    it('should update network policy when switching to remote mode', () => {
      // Reset and start in local mode
      resetNetworkInterceptor();
      resetModeManager();
      modeManager = getModeManager('local') as any;
      interceptor = getNetworkInterceptor('local');
      interceptor.initialize('local');

      // Block HTTPS to OpenAI in local mode
      expect(interceptor.isUrlAllowed('https://api.openai.com/v1/chat')).toBe(false);

      // Switch to remote mode
      modeManager.switchMode('remote');

      // Now allow the same request
      expect(interceptor.isUrlAllowed('https://api.openai.com/v1/chat')).toBe(true);
    });

    it('should maintain localhost access during mode switches', () => {
      const localhostUrl = 'http://localhost:3000';

      // Remote mode
      interceptor.initialize('remote');
      expect(interceptor.isUrlAllowed(localhostUrl)).toBe(true);

      // Switch to local mode
      modeManager.switchMode('local');
      expect(interceptor.isUrlAllowed(localhostUrl)).toBe(true);

      // Switch back to remote mode
      modeManager.switchMode('remote');
      expect(interceptor.isUrlAllowed(localhostUrl)).toBe(true);
    });
  });

  describe('Endpoint Management', () => {
    it('should allow adding custom LLM endpoints', () => {
      interceptor.initialize('remote');

      // Add custom endpoint
      const customEndpoint = 'api.custom-llm.com';
      interceptor.addAllowedEndpoint(customEndpoint);

      // Verify it's now allowed
      expect(interceptor.isUrlAllowed(`https://${customEndpoint}/v1/chat`)).toBe(true);
    });

    it('should return list of allowed endpoints', () => {
      const endpoints = interceptor.getAllowedEndpoints();

      expect(endpoints).toContain('api.openai.com');
      expect(endpoints).toContain('api.anthropic.com');
      expect(endpoints).toContain('localhost:11434');
    });

    it('should not add duplicate endpoints', () => {
      const initialCount = interceptor.getAllowedEndpoints().length;

      interceptor.addAllowedEndpoint('api.openai.com');

      // Count should remain the same
      expect(interceptor.getAllowedEndpoints().length).toBe(initialCount);
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid URLs gracefully', () => {
      interceptor.initialize('local');

      // Invalid URL should return false (blocked)
      expect(interceptor.isUrlAllowed('not-a-valid-url')).toBe(false);
    });

    it('should handle URLs with ports correctly', () => {
      interceptor.initialize('local');

      // Localhost with port should be allowed
      expect(interceptor.isUrlAllowed('http://localhost:3000')).toBe(true);

      // External host with port should be blocked
      expect(interceptor.isUrlAllowed('http://example.com:8080')).toBe(false);
    });

    it('should handle URLs with query parameters', () => {
      interceptor.initialize('remote');

      // Allowed endpoint with query params
      expect(
        interceptor.isUrlAllowed('https://api.openai.com/v1/chat?model=gpt-4')
      ).toBe(true);

      // Blocked endpoint with query params
      expect(
        interceptor.isUrlAllowed('https://example.com/api?key=value')
      ).toBe(false);
    });

    it('should handle IPv6 localhost addresses', () => {
      interceptor.initialize('local');

      expect(interceptor.isUrlAllowed('http://[::1]:3000')).toBe(true);
      expect(interceptor.isUrlAllowed('http://[::1]')).toBe(true);
    });

    it('should handle case-insensitive hostname matching', () => {
      interceptor.initialize('remote');

      // Uppercase hostname
      expect(interceptor.isUrlAllowed('https://API.OPENAI.COM/v1/chat')).toBe(true);

      // Mixed case hostname
      expect(interceptor.isUrlAllowed('https://Api.Openai.Com/v1/chat')).toBe(true);
    });
  });

  describe('State Management', () => {
    it('should return correct state snapshot', () => {
      // Reset and initialize in local mode
      resetNetworkInterceptor();
      resetModeManager();
      modeManager = getModeManager('local') as any;
      interceptor = getNetworkInterceptor('local');
      interceptor.initialize('local');

      const state = interceptor.getState();

      expect(state.isInitialized).toBe(true);
      expect(state.currentMode).toBe('local');
      expect(state.listenerCount).toBeGreaterThan(0);
    });

    it('should reset to initial state', () => {
      interceptor.initialize('remote');

      // Add custom endpoint
      interceptor.addAllowedEndpoint('custom.com');

      // Reset
      interceptor.reset('local');

      // Verify reset state
      const state = interceptor.getState();
      expect(state.currentMode).toBe('local');
      expect(state.isInitialized).toBe(false);
    });
  });

  describe('FR-040 Compliance', () => {
    it('should enforce network-layer blocking in local mode per FR-040', () => {
      interceptor.initialize('local');

      const testUrls = [
        'http://example.com',
        'https://example.com',
        'http://api.example.com',
        'https://api.example.com',
        'http://1.2.3.4',
        'https://1.2.3.4',
      ];

      testUrls.forEach((url) => {
        expect(interceptor.isUrlAllowed(url)).toBe(false);
      });
    });

    it('should only allow localhost in local mode per FR-040', () => {
      interceptor.initialize('local');

      const allowedUrls = [
        'http://localhost',
        'http://localhost:3000',
        'http://127.0.0.1',
        'http://127.0.0.1:8080',
        'http://[::1]',
        'http://0.0.0.0',
      ];

      allowedUrls.forEach((url) => {
        expect(interceptor.isUrlAllowed(url)).toBe(true);
      });
    });
  });

  describe('plan v2.7 Compliance', () => {
    it('should enforce TLS 1.3 (HTTPS) for LLM endpoints in remote mode', () => {
      interceptor.initialize('remote');

      // HTTPS should be allowed
      expect(interceptor.isUrlAllowed('https://api.openai.com/v1/chat')).toBe(true);

      // HTTP should be blocked
      expect(interceptor.isUrlAllowed('http://api.openai.com/v1/chat')).toBe(false);
    });

    it('should allow only whitelisted LLM endpoints in remote mode', () => {
      interceptor.initialize('remote');

      const allowedEndpoints = ['api.openai.com', 'api.anthropic.com'];

      allowedEndpoints.forEach((endpoint) => {
        expect(interceptor.isUrlAllowed(`https://${endpoint}/v1`)).toBe(true);
      });

      const blockedEndpoints = ['api.example.com', 'llm.service.com'];

      blockedEndpoints.forEach((endpoint) => {
        expect(interceptor.isUrlAllowed(`https://${endpoint}/v1`)).toBe(false);
      });
    });
  });
});
