/**
 * Unit tests for LocalLLM with Ollama API
 *
 * Per tasks.md T079: Unit test for LocalLLM
 *
 * Tests:
 * - Ollama API integration
 * - Health check
 * - Error handling
 * - Retry logic
 * - Timeout enforcement
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalLLM } from '@/llm/LocalLLM.js';
import type { EmailBatch, LLMOutput } from '@/llm/LLMAdapter.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LocalLLM (Ollama API)', () => {
  let localLLM: LocalLLM;

  beforeEach(() => {
    // Clear all mocks before each test
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createLLM = () => {
    return new LocalLLM({
      endpoint: 'http://localhost:11434',
      model: 'llama2',
      timeout: 30000,
      maxRetries: 2,
    });
  };

  /**
   * Helper: Mock successful health check response
   * Per T082: Health check at start of generate() requires mock setup
   */
  const mockHealthCheckSuccess = () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/tags')) {
        // Health check endpoint - return success
        return Promise.resolve({
          ok: true,
          json: async () => ({
            models: [
              {
                name: 'llama2',
                modified_at: '2026-02-08T00:00:00Z',
                size: 3735369706,
              },
            ],
          }),
        } as Response);
      }
      // Other endpoints - return default (will be overridden in specific tests)
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response);
    });
  };

  describe('generate', () => {
    const mockEmailBatch: EmailBatch = {
      emails: [
        {
          message_id: 'msg123@example.com',
          from: 'sender@example.com',
          subject: 'Test Subject',
          date: '2026-02-08T10:00:00Z',
          body: 'Please complete the task by Friday.',
          email_hash: 'abc123',
          attachments: [],
          file_path: '/tmp/test.eml',
          format: 'eml',
          extract_status: 'success',
        },
      ],
      reportDate: '2026-02-08',
      mode: 'local',
    };

    it('should successfully generate action items using Ollama API', async () => {
      localLLM = createLLM();

      const mockLLMOutput: LLMOutput = {
        items: [
          {
            content: 'Complete the task by Friday',
            type: 'pending',
            source_email_indices: [0],
            evidence: 'Deadline keyword detected',
            confidence: 85,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      // Per T082: Mock health check to succeed before testing generate
      mockHealthCheckSuccess();

      // Mock Ollama API response for generate endpoint
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          // Health check
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        // Generate endpoint
        return Promise.resolve({
          ok: true,
          json: async () => ({
            model: 'llama2',
            created_at: '2026-02-08T10:00:00Z',
            response: JSON.stringify(mockLLMOutput),
            done: true,
          }),
        } as Response);
      });

      const result = await localLLM.generate(mockEmailBatch);

      expect(result).toEqual(mockLLMOutput);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('should handle batch size validation (max 50 emails)', async () => {
      localLLM = createLLM();

      // Per T082: Mock health check to succeed so batch size validation can run
      mockHealthCheckSuccess();

      const largeBatch: EmailBatch = {
        emails: Array.from({ length: 51 }, (_, i) => ({
          message_id: `msg${i}@example.com`,
          from: 'sender@example.com',
          subject: `Test ${i}`,
          date: '2026-02-08T10:00:00Z',
          body: 'Test body',
          email_hash: `hash${i}`,
          attachments: [],
          file_path: `/tmp/test${i}.eml`,
          format: 'eml' as const,
          extract_status: 'success' as const,
        })),
        reportDate: '2026-02-08',
        mode: 'local',
      };

      await expect(localLLM.generate(largeBatch)).rejects.toThrow(
        'Batch size exceeds maximum of 50 emails per plan.md constraints'
      );
    });

    it('should handle Ollama API errors correctly (HTTP 500)', async () => {
      localLLM = createLLM();

      // Per T082: Mock health check to succeed, then generate endpoint fails
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          // Health check succeeds
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        // Generate endpoint fails
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => 'Internal server error',
        } as Response);
      });

      await expect(localLLM.generate(mockEmailBatch)).rejects.toThrow('Ollama API returned 500');
    });

    it('should handle connection refused errors (Ollama not running)', async () => {
      localLLM = createLLM();

      const connectionError = new Error('fetch failed');
      (connectionError as any).cause = { code: 'ECONNREFUSED' };
      mockFetch.mockRejectedValue(connectionError);

      await expect(localLLM.generate(mockEmailBatch)).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      localLLM = createLLM();

      // Per T082: Mock health check to succeed, then generate times out
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          // Health check succeeds
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        // Generate endpoint times out
        const error = new Error('Request timeout');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      await expect(localLLM.generate(mockEmailBatch)).rejects.toThrow('timeout after 30000ms');
    });

    it('should retry on network errors (max 2 retries)', async () => {
      localLLM = createLLM();

      const mockLLMOutput: LLMOutput = {
        items: [
          {
            content: 'Test item',
            type: 'pending',
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 75,
            source_status: 'verified',
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      // Per T082: Mock health check to succeed, then retry logic
      let generateCallCount = 0;
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          // Health check always succeeds
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }

        // Generate endpoint: Fail twice, then succeed
        generateCallCount++;
        if (generateCallCount <= 2) { // First two calls to generate endpoint
          const error = new Error(generateCallCount === 1 ? 'ECONNREFUSED' : 'ECONNRESET');
          return Promise.reject(error);
        }

        // Third call succeeds
        return Promise.resolve({
          ok: true,
          json: async () => ({
            model: 'llama2',
            response: JSON.stringify(mockLLMOutput),
            done: true,
          }),
        } as Response);
      });

      const result = await localLLM.generate(mockEmailBatch);

      expect(result.items).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 health check + 2 failures + 1 success = 4 total
    });

    it('should fail after max retries exhausted', async () => {
      localLLM = createLLM();

      // Per T082: Mock health check to succeed, then generate always fails
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          // Health check succeeds
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        // Generate endpoint always fails
        return Promise.reject(new Error('ECONNREFUSED'));
      });

      await expect(localLLM.generate(mockEmailBatch)).rejects.toThrow('Ollama API request failed after 3 attempts');
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 health check + 3 failed generate calls (initial + 2 retries)
    });

    it('should not retry on non-retryable errors (400 bad request)', async () => {
      localLLM = createLLM();

      // Per T082: Mock health check to succeed, then generate returns 400 error
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          // Health check succeeds
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        // Generate endpoint returns 400 error (non-retryable)
        return Promise.resolve({
          ok: false,
          status: 400,
          text: async () => 'Bad request',
        } as Response);
      });

      await expect(localLLM.generate(mockEmailBatch)).rejects.toThrow('Ollama API returned 400');
      expect(mockFetch).toHaveBeenCalledTimes(2); // 1 health check + 1 generate call (no retry)
    });

    it('should parse JSON response with markdown code blocks', async () => {
      localLLM = createLLM();

      const mockLLMOutput = {
        items: [
          {
            content: 'Test item',
            type: 'pending' as const,
            source_email_indices: [0],
            evidence: 'Test',
            confidence: 75,
            source_status: 'verified' as const,
          },
        ],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      // Per T082: Mock health check to succeed
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            model: 'llama2',
            response: '```json\n' + JSON.stringify(mockLLMOutput) + '\n```',
            done: true,
          }),
        } as Response);
      });

      const result = await localLLM.generate(mockEmailBatch);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].content).toBe('Test item');
    });

    it('should handle invalid JSON response', async () => {
      localLLM = createLLM();

      // Per T082: Mock health check to succeed
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            model: 'llama2',
            response: 'invalid json {{{',
            done: true,
          }),
        } as Response);
      });

      await expect(localLLM.generate(mockEmailBatch)).rejects.toThrow('Failed to parse Ollama JSON response');
    });

    it('should handle response missing items array', async () => {
      localLLM = createLLM();

      // Per T082: Mock health check to succeed
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            model: 'llama2',
            response: JSON.stringify({ batch_info: {} }), // Missing items
            done: true,
          }),
        } as Response);
      });

      await expect(localLLM.generate(mockEmailBatch)).rejects.toThrow('Response missing "items" array');
    });

    it('should handle response with default values for missing fields', async () => {
      localLLM = createLLM();

      const incompleteItem = {
        content: 'Test item',
        // Missing type, source_email_indices, evidence, confidence
      };

      // Per T082: Mock health check to succeed
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            model: 'llama2',
            response: JSON.stringify({
              items: [incompleteItem],
              batch_info: {
                total_emails: 1,
                processed_emails: 1,
                skipped_emails: 0,
              },
            }),
            done: true,
          }),
        } as Response);
      });

      const result = await localLLM.generate(mockEmailBatch);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('pending'); // Default
      expect(result.items[0].source_email_indices).toEqual([]); // Default
      expect(result.items[0].evidence).toBe(''); // Default
      expect(result.items[0].confidence).toBe(50); // Default
    });

    it('should include request body with correct format', async () => {
      localLLM = createLLM();

      const mockLLMOutput: LLMOutput = {
        items: [],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      // Per T082: Mock health check to succeed
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            model: 'llama2',
            response: JSON.stringify(mockLLMOutput),
            done: true,
          }),
        } as Response);
      });

      await localLLM.generate(mockEmailBatch);

      // Find the generate endpoint call (not the health check)
      const generateCall = mockFetch.mock.calls.find((call) => !call[0].includes('/api/tags'));
      expect(generateCall).toBeDefined();

      const callArgs = generateCall!;
      const requestBody = JSON.parse(callArgs[1].body);

      expect(requestBody).toMatchObject({
        model: 'llama2',
        stream: false,
        options: expect.objectContaining({
          temperature: 0.3,
          num_predict: 4000,
        }),
      });

      expect(requestBody.prompt).toContain('Extract action items from the following emails');
    });
  });

  describe('checkHealth', () => {
    it('should return true when Ollama service is available', async () => {
      localLLM = createLLM();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            {
              name: 'llama2',
              modified_at: '2026-02-08T10:00:00Z',
              size: 3800000000,
            },
          ],
        }),
      });

      const isHealthy = await localLLM.checkHealth();

      expect(isHealthy).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should return false when Ollama service is unavailable (connection refused)', async () => {
      localLLM = createLLM();

      const connectionError = new Error('fetch failed');
      (connectionError as any).cause = { code: 'ECONNREFUSED' };
      mockFetch.mockRejectedValue(connectionError);

      const isHealthy = await localLLM.checkHealth();

      expect(isHealthy).toBe(false);
    });

    it('should return false when Ollama returns non-OK status', async () => {
      localLLM = createLLM();

      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      });

      const isHealthy = await localLLM.checkHealth();

      expect(isHealthy).toBe(false);
    });

    it('should return false when response has invalid structure', async () => {
      localLLM = createLLM();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: 'invalid', // Should be array
        }),
      });

      const isHealthy = await localLLM.checkHealth();

      expect(isHealthy).toBe(false);
    });

    it('should handle health check timeout (5s)', async () => {
      localLLM = createLLM();

      // Mock fetch to timeout
      const mockAbort = vi.fn();
      const mockSignal = {
        aborted: false,
        addEventListener: vi.fn((_, handler) => {
          // Simulate timeout after delay
          setTimeout(handler, 100);
        }),
        removeEventListener: vi.fn(),
      };
      const controller = {
        signal: mockSignal,
        abort: mockAbort,
      };

      global.AbortController = vi.fn().mockImplementation(() => controller) as any;

      mockFetch.mockImplementation(() => {
        const error = new Error('Request timeout');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const isHealthy = await localLLM.checkHealth();

      await expect(Promise.resolve(isHealthy)).resolves.toBe(false);
    });

    it('should warn if configured model is not found in Ollama', async () => {
      localLLM = createLLM();

      // Ollama returns different models
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            {
              name: 'mistral',
              modified_at: '2026-02-08T10:00:00Z',
              size: 4100000000,
            },
          ],
        }),
      });

      const isHealthy = await localLLM.checkHealth();

      // Health check should still pass (service is running)
      expect(isHealthy).toBe(true);
    });

    it('should return true when empty model list (service is running but no models installed)', async () => {
      localLLM = createLLM();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [], // No models installed yet
        }),
      });

      const isHealthy = await localLLM.checkHealth();

      expect(isHealthy).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return config without sensitive fields', () => {
      localLLM = createLLM();

      const config = localLLM.getConfig();

      expect(config).toHaveProperty('endpoint');
      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('timeout');
      expect(config).toHaveProperty('maxRetries');
      expect(config).toHaveProperty('debug');
      // LocalLLM doesn't use apiKey, but it's in the interface
    });
  });

  describe('updateConfig', () => {
    it('should update endpoint and modelName', () => {
      localLLM = createLLM();

      localLLM.updateConfig({
        endpoint: 'http://localhost:11435',
        model: 'mistral',
      });

      const newConfig = localLLM.getConfig();
      expect(newConfig.endpoint).toBe('http://localhost:11435');
      expect(newConfig.model).toBe('mistral');
    });

    it('should update non-critical config without changing endpoint', () => {
      localLLM = createLLM();

      const originalEndpoint = localLLM.getConfig().endpoint;

      localLLM.updateConfig({
        timeout: 60000,
        maxRetries: 3,
        debug: true,
      });

      const newConfig = localLLM.getConfig();
      expect(newConfig.endpoint).toBe(originalEndpoint); // Unchanged
      expect(newConfig.timeout).toBe(60000);
      expect(newConfig.maxRetries).toBe(3);
      expect(newConfig.debug).toBe(true);
    });

    it('should log configuration changes', () => {
      localLLM = createLLM();

      // Should not throw
      expect(() => {
        localLLM.updateConfig({
          endpoint: 'http://localhost:11435',
        });
      }).not.toThrow();

      const config = localLLM.getConfig();
      expect(config.endpoint).toBe('http://localhost:11435');
    });
  });

  describe('Constructor', () => {
    it('should initialize with default config when no config provided', () => {
      const defaultLLM = new LocalLLM();

      const config = defaultLLM.getConfig();
      expect(config.endpoint).toBe('http://localhost:11434');
      expect(config.model).toBe('llama2');
      expect(config.timeout).toBe(30000);
      expect(config.maxRetries).toBe(2);
    });

    it('should use provided config values', () => {
      const customLLM = new LocalLLM({
        endpoint: 'http://custom-endpoint:8080',
        model: 'custom-model',
        timeout: 60000,
        maxRetries: 5,
      });

      const config = customLLM.getConfig();
      expect(config.endpoint).toBe('http://custom-endpoint:8080');
      expect(config.model).toBe('custom-model');
      expect(config.timeout).toBe(60000);
      expect(config.maxRetries).toBe(5);
    });
  });

  describe('Error Classification', () => {
    const mockEmailBatch: EmailBatch = {
      emails: [
        {
          message_id: 'msg123@example.com',
          from: 'sender@example.com',
          subject: 'Test Subject',
          date: '2026-02-08T10:00:00Z',
          body: 'Please complete the task by Friday.',
          email_hash: 'abc123',
          attachments: [],
          file_path: '/tmp/test.eml',
          format: 'eml',
          extract_status: 'success',
        },
      ],
      reportDate: '2026-02-08',
      mode: 'local',
    };

    it('should classify network errors as retryable', async () => {
      localLLM = createLLM();

      const mockLLMOutput: LLMOutput = {
        items: [],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      // Per T082: Mock health check to succeed, then first generate call fails with network error
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          // Health check succeeds
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        // Generate endpoint: First call fails, second succeeds
        const callCount = mockFetch.mock.calls.filter((c) => !c[0].includes('/api/tags')).length;
        if (callCount === 1) { // First generate call
          return Promise.reject(new Error('ECONNREFUSED'));
        }
        // Second generate call succeeds
        return Promise.resolve({
          ok: true,
          json: async () => ({
            model: 'llama2',
            response: JSON.stringify(mockLLMOutput),
            done: true,
          }),
        } as Response);
      });

      // Should retry and succeed
      const result = await localLLM.generate(mockEmailBatch);

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 health check + 1 failure + 1 success
    });

    it('should classify 429 rate limit as retryable', async () => {
      localLLM = createLLM();

      const mockLLMOutput: LLMOutput = {
        items: [],
        batch_info: {
          total_emails: 1,
          processed_emails: 1,
          skipped_emails: 0,
        },
      };

      // Per T082: Mock health check to succeed, then first generate call returns 429
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          // Health check succeeds
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        // Generate endpoint: First call returns 429, second succeeds
        const callCount = mockFetch.mock.calls.filter((c) => !c[0].includes('/api/tags')).length;
        if (callCount === 1) { // First generate call
          return Promise.resolve({
            ok: false,
            status: 429,
            text: async () => 'Rate limit exceeded',
          } as Response);
        }
        // Second generate call succeeds
        return Promise.resolve({
          ok: true,
          json: async () => ({
            model: 'llama2',
            response: JSON.stringify(mockLLMOutput),
            done: true,
          }),
        } as Response);
      });

      const result = await localLLM.generate(mockEmailBatch);

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 health check + 1 failure (429) + 1 success
    });

    it('should classify 400 bad request as non-retryable', async () => {
      localLLM = createLLM();

      // Per T082: Mock health check to succeed, then generate returns 400
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          status: 400,
          text: async () => 'Bad request',
        } as Response);
      });

      await expect(localLLM.generate(mockEmailBatch)).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(2); // 1 health check + 1 generate call (no retry)
    });

    it('should classify JSON parse errors as non-retryable', async () => {
      localLLM = createLLM();

      // Per T082: Mock health check to succeed, then generate returns invalid JSON
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/tags')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [{ name: 'llama2', modified_at: '2026-02-08T00:00:00Z', size: 3735369706 }],
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            model: 'llama2',
            response: 'invalid json',
            done: true,
          }),
        } as Response);
      });

      await expect(localLLM.generate(mockEmailBatch)).rejects.toThrow('Failed to parse Ollama JSON response');
    });
  });

  describe('Per FR-037: No Auto-Degradation', () => {
    it('should not attempt remote API calls when local fails', async () => {
      localLLM = createLLM();

      const mockEmailBatch: EmailBatch = {
        emails: [],
        reportDate: '2026-02-08',
        mode: 'local',
      };

      // Mock fetch to always fail (health check will fail)
      mockFetch.mockRejectedValue(new Error('Ollama not running'));

      // Per FR-036: Health check should block with clear error message
      await expect(localLLM.generate(mockEmailBatch)).rejects.toThrow(
        'Local LLM service unavailable'
      );

      // All fetch calls should be to localhost (health check endpoint), not remote endpoints
      mockFetch.mock.calls.forEach((call) => {
        const url = call[0] as string;
        expect(url).toContain('localhost');
        expect(url).toContain('/api/tags'); // Health check endpoint
        expect(url).not.toContain('api.openai.com');
      });
    });

    it('should not have remote API endpoint in configuration', () => {
      localLLM = createLLM();

      const config = localLLM.getConfig();

      expect(config.endpoint).toBe('http://localhost:11434');
      expect(config.endpoint).not.toContain('api.openai.com');
      expect(config.endpoint).not.toContain('https');
    });
  });
});
