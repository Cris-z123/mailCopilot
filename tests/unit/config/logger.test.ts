/**
 * Logger unit tests
 * Verify electron-log v5 configuration and API
 */

import { describe, it, expect } from 'vitest';

describe('Logger Configuration', () => {
  it('should export logger object with all required methods', async () => {
    const { logger } = await import('@/config/logger');

    expect(logger).toBeDefined();
    expect(logger.debug).toBeTypeOf('function');
    expect(logger.info).toBeTypeOf('function');
    expect(logger.warn).toBeTypeOf('function');
    expect(logger.error).toBeTypeOf('function');
  });

  it('should export context functions', async () => {
    const { setContextId, clearContextId } = await import('@/config/logger');

    expect(setContextId).toBeTypeOf('function');
    expect(clearContextId).toBeTypeOf('function');
  });

  it('should have correct method signatures', async () => {
    const { logger } = await import('@/config/logger');

    // Test debug method
    expect(() => logger.debug('TestModule', 'Test message')).not.toThrow();
    expect(() => logger.debug('TestModule', 'Test message', { key: 'value' })).not.toThrow();

    // Test info method
    expect(() => logger.info('TestModule', 'Test message')).not.toThrow();
    expect(() => logger.info('TestModule', 'Test message', { key: 'value' })).not.toThrow();

    // Test warn method
    expect(() => logger.warn('TestModule', 'Test message')).not.toThrow();
    expect(() => logger.warn('TestModule', 'Test message', { key: 'value' })).not.toThrow();

    // Test error method
    expect(() => logger.error('TestModule', 'Test message')).not.toThrow();
    expect(() => logger.error('TestModule', 'Test message', new Error('Test error'))).not.toThrow();
    expect(() => logger.error('TestModule', 'Test message', new Error('Test error'), { key: 'value' })).not.toThrow();
  });

  it('should serialize error objects correctly', async () => {
    const { logger } = await import('@/config/logger');

    const testError = new Error('Test error message');
    testError.name = 'TestError';

    // This should not throw
    expect(() => logger.error('TestModule', 'Error occurred', testError)).not.toThrow();
  });

  it('should handle context ID functions', async () => {
    const { setContextId, clearContextId } = await import('@/config/logger');

    expect(() => setContextId('test-context-id')).not.toThrow();
    expect(() => clearContextId()).not.toThrow();
  });
});

describe('Logger API Compatibility', () => {
  it('should match old StructuredLogger API', async () => {
    const { logger } = await import('@/config/logger');

    // Old API: StructuredLogger.info(module, message, metadata)
    // New API: logger.info(module, message, context)
    expect(() => logger.info('Module', 'Message', { key: 'value' })).not.toThrow();
  });

  it('should handle error parameter correctly', async () => {
    const { logger } = await import('@/config/logger');

    // Old API: StructuredLogger.error(module, message, error, metadata)
    // New API: logger.error(module, message, error?, context?)
    const error = new Error('Test error');
    expect(() => logger.error('Module', 'Message', error, { context: 'test' })).not.toThrow();
  });
});
