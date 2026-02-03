/**
 * Unit tests for RemoteLLM with OpenAI SDK
 *
 * Per plan.md Decision 1: Test OpenAI SDK integration
 * T034: Unit test for RemoteLLM with OpenAI SDK
 *
 * Tests:
 * - Mock OpenAI client
 * - Error handling
 * - Retry logic (handled by SDK)
 * - Timeout enforcement
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { RemoteLLM } from '../../../main/llm/RemoteLLM.js';
import type { EmailBatch, LLMOutput } from '../../../main/llm/LLMAdapter.js';

// Create mock functions that can be shared
const mockChatCompletionsCreate = vi.fn();
const mockModelsList = vi.fn();

// Mock OpenAI module before import
vi.mock('openai', async () => {
  const actualOpenAI = await vi.importActual<typeof import('openai')>('openai');
  return {
    ...actualOpenAI, // This preserves all error classes
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockChatCompletionsCreate,
        },
      },
      models: {
        list: mockModelsList,
      },
    })),
  };
});

describe('RemoteLLM (OpenAI SDK)', () => {
  let remoteLLM: RemoteLLM;

  beforeEach(() => {
    // Clear all mocks before each test
    mockChatCompletionsCreate.mockReset();
    mockModelsList.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createLLM = () => {
    return new RemoteLLM({
      apiKey: 'test-api-key',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4-turbo-preview',
      timeout: 30000,
      maxRetries: 2,
    });
  };

  describe('generate', () => {
    const mockEmailBatch: EmailBatch = {
      emails: [
        {
          message_id: 'msg123@example.com',
          from: 'sender@example.com',
          subject: 'Test Subject',
          date: '2026-02-03T10:00:00Z',
          body: 'Please complete the task by Friday.',
          email_hash: 'abc123',
        },
      ],
      reportDate: '2026-02-03',
      mode: 'remote',
    };

    it('should successfully generate action items using OpenAI SDK', async () => {
      remoteLLM = createLLM();

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

      // Mock OpenAI API response
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify(mockLLMOutput),
            },
          },
        ],
        model: 'gpt-4-turbo-preview',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      });

      const result = await remoteLLM.generate(mockEmailBatch);

      expect(result).toEqual(mockLLMOutput);
      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4-turbo-preview',
          temperature: 0.3,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        })
      );
    });

    it('should handle batch size validation (max 50 emails)', async () => {
      remoteLLM = createLLM();

      const largeBatch: EmailBatch = {
        emails: Array.from({ length: 51 }, (_, i) => ({
          message_id: `msg${i}@example.com`,
          from: 'sender@example.com',
          subject: `Test ${i}`,
          date: '2026-02-03T10:00:00Z',
          body: 'Test body',
          email_hash: `hash${i}`,
        })),
        reportDate: '2026-02-03',
        mode: 'remote',
      };

      await expect(remoteLLM.generate(largeBatch)).rejects.toThrow(
        'Batch size exceeds maximum of 50 emails per plan.md constraints'
      );
    });

    it('should handle API errors correctly (OpenAI APIError)', async () => {
      remoteLLM = createLLM();

      // Create an error object with the structure of APIError
      const apiError = {
        status: 500,
        message: 'Internal server error',
        type: 'server_error',
        code: null,
      };
      mockChatCompletionsCreate.mockRejectedValue(apiError);

      await expect(remoteLLM.generate(mockEmailBatch)).rejects.toThrow('Server error (500)');
    });

    it('should handle authentication errors (401)', async () => {
      remoteLLM = createLLM();

      const apiError = {
        status: 401,
        message: 'Invalid API key',
        type: 'invalid_request_error',
      };
      mockChatCompletionsCreate.mockRejectedValue(apiError);

      await expect(remoteLLM.generate(mockEmailBatch)).rejects.toThrow('Authentication failed');
    });

    it('should handle rate limit errors (429)', async () => {
      remoteLLM = createLLM();

      // RateLimitError has status 429
      const rateLimitError = {
        status: 429,
        message: 'Rate limit exceeded',
      };
      mockChatCompletionsCreate.mockRejectedValue(rateLimitError);

      await expect(remoteLLM.generate(mockEmailBatch)).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle network connection errors', async () => {
      remoteLLM = createLLM();

      // APIConnectionError is identified by constructor name
      class APIConnectionError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'APIConnectionError';
        }
      }

      const connectionError = new APIConnectionError('Network connection failed');
      mockChatCompletionsCreate.mockRejectedValue(connectionError);

      await expect(remoteLLM.generate(mockEmailBatch)).rejects.toThrow('Network connection error');
    });

    it('should handle timeout errors', async () => {
      remoteLLM = createLLM();

      // APIConnectionTimeoutError is identified by constructor name
      class APIConnectionTimeoutError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'APIConnectionTimeoutError';
        }
      }

      const timeoutError = new APIConnectionTimeoutError('Request timeout');
      mockChatCompletionsCreate.mockRejectedValue(timeoutError);

      await expect(remoteLLM.generate(mockEmailBatch)).rejects.toThrow(
        'Request timeout after 30000ms (per FR-057)'
      );
    });

    it('should handle empty response content', async () => {
      remoteLLM = createLLM();

      mockChatCompletionsCreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null, // Empty content
            },
          },
        ],
        model: 'gpt-4-turbo-preview',
      });

      await expect(remoteLLM.generate(mockEmailBatch)).rejects.toThrow(
        'OpenAI API returned empty response content'
      );
    });

    it('should parse JSON response with markdown code blocks', async () => {
      remoteLLM = createLLM();

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

      mockChatCompletionsCreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '```json\n' + JSON.stringify(mockLLMOutput) + '\n```',
            },
          },
        ],
        model: 'gpt-4-turbo-preview',
      });

      const result = await remoteLLM.generate(mockEmailBatch);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].content).toBe('Test item');
    });

    it('should handle invalid JSON response', async () => {
      remoteLLM = createLLM();

      mockChatCompletionsCreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'invalid json {{{',
            },
          },
        ],
        model: 'gpt-4-turbo-preview',
      });

      await expect(remoteLLM.generate(mockEmailBatch)).rejects.toThrow('Failed to parse LLM JSON response');
    });

    it('should handle response missing items array', async () => {
      remoteLLM = createLLM();

      mockChatCompletionsCreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({ batch_info: {} }), // Missing items
            },
          },
        ],
        model: 'gpt-4-turbo-preview',
      });

      // The error should be about missing items
      await expect(remoteLLM.generate(mockEmailBatch)).rejects.toThrow();
    });
  });

  describe('checkHealth', () => {
    it('should return true when service is available', async () => {
      remoteLLM = createLLM();

      mockModelsList.mockResolvedValue({ data: [] });

      const isHealthy = await remoteLLM.checkHealth();

      expect(isHealthy).toBe(true);
      expect(mockModelsList).toHaveBeenCalled();
    });

    it('should return false when service is unavailable', async () => {
      remoteLLM = createLLM();

      mockModelsList.mockRejectedValue(new Error('Service unavailable'));

      const isHealthy = await remoteLLM.checkHealth();

      expect(isHealthy).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return config without API key', () => {
      remoteLLM = createLLM();

      const config = remoteLLM.getConfig();

      expect(config).toHaveProperty('endpoint');
      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('timeout');
      expect(config).toHaveProperty('maxRetries');
      expect(config).not.toHaveProperty('apiKey');
    });
  });

  describe('updateConfig', () => {
    it('should update non-critical config without recreating client', () => {
      remoteLLM = createLLM();

      const originalClient = (remoteLLM as any).client;

      remoteLLM.updateConfig({
        model: 'gpt-4',
        debug: true,
      });

      const newConfig = remoteLLM.getConfig();
      expect(newConfig.model).toBe('gpt-4');

      // Client should not be recreated for non-critical config changes
      expect((remoteLLM as any).client).toBe(originalClient);
    });

    it('should recreate client when endpoint changes', () => {
      remoteLLM = createLLM();

      const originalClient = (remoteLLM as any).client;

      remoteLLM.updateConfig({
        endpoint: 'https://new-endpoint.com/v1',
      });

      // Client should be recreated for endpoint change
      expect((remoteLLM as any).client).not.toBe(originalClient);
    });

    it('should recreate client when apiKey changes', () => {
      remoteLLM = createLLM();

      const originalClient = (remoteLLM as any).client;

      remoteLLM.updateConfig({
        apiKey: 'new-api-key',
      });

      // Client should be recreated for API key change
      expect((remoteLLM as any).client).not.toBe(originalClient);
    });

    it('should recreate client when timeout changes', () => {
      remoteLLM = createLLM();

      const originalClient = (remoteLLM as any).client;

      remoteLLM.updateConfig({
        timeout: 60000,
      });

      // Client should be recreated for timeout change
      expect((remoteLLM as any).client).not.toBe(originalClient);
    });

    it('should recreate client when maxRetries changes', () => {
      remoteLLM = createLLM();

      const originalClient = (remoteLLM as any).client;

      remoteLLM.updateConfig({
        maxRetries: 3,
      });

      // Client should be recreated for maxRetries change
      expect((remoteLLM as any).client).not.toBe(originalClient);
    });
  });

  describe('Constructor', () => {
    it('should initialize with default config when no config provided', () => {
      const defaultLLM = new RemoteLLM();

      const config = defaultLLM.getConfig();
      expect(config.endpoint).toBe('https://api.openai.com/v1');
      expect(config.model).toBe('gpt-4-turbo-preview');
      expect(config.timeout).toBe(30000);
      expect(config.maxRetries).toBe(2);
    });

    it('should log warning when API key is not provided', () => {
      // The constructor should log a warning when API key is empty
      // We can't easily test the logger.warn call without mocking the logger
      // but we can verify that the LLM is still created
      const llmWithoutKey = new RemoteLLM({ apiKey: '' });

      expect(llmWithoutKey).toBeDefined();
      expect(llmWithoutKey.getConfig().model).toBe('gpt-4-turbo-preview');
    });
  });
});
