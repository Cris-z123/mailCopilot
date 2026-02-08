/**
 * Mode Switching Unit Tests
 *
 * Tests ModeManager hot mode switching functionality per plan.md FR-033, FR-034, FR-035.
 * Per plan v2.7: Hot mode switching without restart, wait for batch completion.
 *
 * @test unit/config/mode-switching.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModeManager, resetModeManager, getModeManager, type ProcessingMode } from '../../../src/main/app/mode-manager';

describe('ModeManager', () => {
  let modeManager: ModeManager;

  beforeEach(() => {
    // Reset singleton and create fresh instance for each test
    resetModeManager();
    modeManager = new ModeManager('remote'); // Default to remote per constitution Principle I
  });

  afterEach(() => {
    // Cleanup: remove all listeners and reset singleton
    modeManager.removeAllListeners();
    resetModeManager();
  });

  describe('Initial State', () => {
    it('should initialize with default mode (remote)', () => {
      expect(modeManager.getCurrentMode()).toBe('remote');
      expect(modeManager.isBatchProcessing()).toBe(false);
      expect(modeManager.hasPendingSwitch()).toBe(false);
      expect(modeManager.getPendingSwitch()).toBe(null);
    });

    it('should initialize with custom mode', () => {
      const localModeManager = new ModeManager('local');
      expect(localModeManager.getCurrentMode()).toBe('local');
      localModeManager.removeAllListeners();
    });

    it('should return correct initial state via getState()', () => {
      const state = modeManager.getState();

      expect(state.currentMode).toBe('remote');
      expect(state.pendingMode).toBe(null);
      expect(state.isProcessing).toBe(false);
      expect(state.switchRequestedAt).toBe(null);
    });
  });

  describe('Immediate Mode Switch (No Batch Processing)', () => {
    it('should switch mode immediately when not processing', () => {
      const events: Array<{ eventName: string; data: unknown }> = [];

      // Listen to mode-changed event
      modeManager.on('mode-changed', (data) => {
        events.push({ eventName: 'mode-changed', data });
      });

      const switchedImmediately = modeManager.switchMode('local');

      expect(switchedImmediately).toBe(true);
      expect(modeManager.getCurrentMode()).toBe('local');
      expect(modeManager.hasPendingSwitch()).toBe(false);
      expect(modeManager.getPendingSwitch()).toBe(null);
      expect(events.length).toBe(1);

      const eventData = events[0].data as { from: ProcessingMode; to: ProcessingMode; requestedAt: number };
      expect(eventData.from).toBe('remote');
      expect(eventData.to).toBe('local');
      expect(typeof eventData.requestedAt).toBe('number');
    });

    it('should emit mode-changed event on immediate switch', () => {
      let eventEmitted = false;
      let eventData: { from: ProcessingMode; to: ProcessingMode } | null = null;

      modeManager.on('mode-changed', (data) => {
        eventEmitted = true;
        eventData = data as { from: ProcessingMode; to: ProcessingMode };
      });

      modeManager.switchMode('local');

      expect(eventEmitted).toBe(true);
      expect(eventData).toEqual({
        from: 'remote',
        to: 'local',
        requestedAt: expect.any(Number),
      });
    });

    it('should handle switch to same mode gracefully', () => {
      const events: Array<string> = [];

      modeManager.on('mode-changed', () => {
        events.push('mode-changed');
      });

      const switchedImmediately = modeManager.switchMode('remote');

      expect(switchedImmediately).toBe(true);
      expect(modeManager.getCurrentMode()).toBe('remote');
      expect(events.length).toBe(0); // No event emitted for same mode
    });

    it('should support bidirectional switching (local <-> remote)', () => {
      // Remote -> Local
      modeManager.switchMode('local');
      expect(modeManager.getCurrentMode()).toBe('local');

      // Local -> Remote
      const switchedImmediately = modeManager.switchMode('remote');
      expect(switchedImmediately).toBe(true);
      expect(modeManager.getCurrentMode()).toBe('remote');
    });
  });

  describe('Queued Mode Switch During Batch Processing (FR-033)', () => {
    it('should queue mode switch when batch is processing', () => {
      let eventEmitted = false;
      let eventData: { from: ProcessingMode; to: ProcessingMode } | null = null;

      modeManager.on('mode-switch-queued', (data) => {
        eventEmitted = true;
        eventData = data as { from: ProcessingMode; to: ProcessingMode };
      });

      // Mark batch as processing
      modeManager.markBatchStart();
      expect(modeManager.isBatchProcessing()).toBe(true);

      // Request mode switch
      const switchedImmediately = modeManager.switchMode('local');

      expect(switchedImmediately).toBe(false);
      expect(modeManager.getCurrentMode()).toBe('remote'); // Still in old mode
      expect(modeManager.hasPendingSwitch()).toBe(true);
      expect(modeManager.getPendingSwitch()).toBe('local');
      expect(eventEmitted).toBe(true);

      const queuedEvent = eventData!;
      expect(queuedEvent.from).toBe('remote');
      expect(queuedEvent.to).toBe('local');
    });

    it('should emit mode-switch-queued event during batch processing', () => {
      const events: Array<{ eventName: string; data: unknown }> = [];

      modeManager.on('mode-switch-queued', (data) => {
        events.push({ eventName: 'mode-switch-queued', data });
      });

      modeManager.markBatchStart();
      modeManager.switchMode('local');

      expect(events.length).toBe(1);

      const eventData = events[0].data as { from: ProcessingMode; to: ProcessingMode };
      expect(eventData.from).toBe('remote');
      expect(eventData.to).toBe('local');
      expect(typeof events[0].data.requestedAt).toBe('number');
    });

    it('should execute queued switch after batch completion (FR-033)', () => {
      const events: Array<string> = [];

      modeManager.on('mode-changed', () => {
        events.push('mode-changed');
      });

      // Start batch, queue switch
      modeManager.markBatchStart();
      modeManager.switchMode('local');

      expect(modeManager.getCurrentMode()).toBe('remote');
      expect(modeManager.hasPendingSwitch()).toBe(true);

      // Complete batch
      modeManager.markBatchComplete();

      // Verify switch executed
      expect(modeManager.getCurrentMode()).toBe('local');
      expect(modeManager.hasPendingSwitch()).toBe(false);
      expect(modeManager.getPendingSwitch()).toBe(null);
      expect(events.length).toBe(1); // mode-changed emitted
    });

    it('should emit both batch-complete and mode-changed events after completion', () => {
      const events: Array<string> = [];

      modeManager.on('batch-complete', () => {
        events.push('batch-complete');
      });

      modeManager.on('mode-changed', () => {
        events.push('mode-changed');
      });

      modeManager.markBatchStart();
      modeManager.switchMode('local');
      modeManager.markBatchComplete();

      expect(events).toEqual(['batch-complete', 'mode-changed']);
    });
  });

  describe('Cancel Pending Mode Switch', () => {
    it('should cancel pending mode switch', () => {
      let cancelEventEmitted = false;

      modeManager.on('mode-switch-cancelled', () => {
        cancelEventEmitted = true;
      });

      // Queue a switch
      modeManager.markBatchStart();
      modeManager.switchMode('local');
      expect(modeManager.hasPendingSwitch()).toBe(true);

      // Cancel the switch
      modeManager.cancelPendingSwitch();

      expect(modeManager.hasPendingSwitch()).toBe(false);
      expect(modeManager.getPendingSwitch()).toBe(null);
      expect(modeManager.getCurrentMode()).toBe('remote'); // Still in original mode
      expect(cancelEventEmitted).toBe(true);
    });

    it('should emit mode-switch-cancelled event', () => {
      let eventData: { currentMode: ProcessingMode; timestamp: number } | null = null;

      modeManager.on('mode-switch-cancelled', (data) => {
        eventData = data as { currentMode: ProcessingMode; timestamp: number };
      });

      modeManager.markBatchStart();
      modeManager.switchMode('local');
      modeManager.cancelPendingSwitch();

      expect(eventData).not.toBeNull();
      expect(eventData!.currentMode).toBe('remote');
      expect(typeof eventData!.timestamp).toBe('number');
    });

    it('should handle cancel when no pending switch gracefully', () => {
      expect(() => {
        modeManager.cancelPendingSwitch();
      }).not.toThrow();

      expect(modeManager.hasPendingSwitch()).toBe(false);
    });
  });

  describe('Multiple Rapid Mode Switches (Last One Wins)', () => {
    it('should override pending switch with new request', () => {
      modeManager.markBatchStart();

      // First switch request
      modeManager.switchMode('local');
      expect(modeManager.getPendingSwitch()).toBe('local');

      // Second switch request (overrides first)
      modeManager.switchMode('remote');
      expect(modeManager.getPendingSwitch()).toBe('remote');

      // Complete batch - should switch to the last requested mode (remote)
      modeManager.markBatchComplete();

      expect(modeManager.getCurrentMode()).toBe('remote');
    });

    it('should handle multiple switches without batch processing', () => {
      modeManager.switchMode('local');
      expect(modeManager.getCurrentMode()).toBe('local');

      modeManager.switchMode('remote');
      expect(modeManager.getCurrentMode()).toBe('remote');

      modeManager.switchMode('local');
      expect(modeManager.getCurrentMode()).toBe('local');
    });
  });

  describe('Batch Processing State Management', () => {
    it('should track batch processing start and completion', () => {
      const events: Array<string> = [];

      modeManager.on('batch-start', () => {
        events.push('batch-start');
      });

      modeManager.on('batch-complete', () => {
        events.push('batch-complete');
      });

      expect(modeManager.isBatchProcessing()).toBe(false);

      modeManager.markBatchStart();
      expect(modeManager.isBatchProcessing()).toBe(true);
      expect(events).toEqual(['batch-start']);

      modeManager.markBatchComplete();
      expect(modeManager.isBatchProcessing()).toBe(false);
      expect(events).toEqual(['batch-start', 'batch-complete']);
    });

    it('should emit batch-start event with correct data', () => {
      let eventData: { isProcessing: boolean; mode: ProcessingMode; timestamp: number } | null = null;

      modeManager.on('batch-start', (data) => {
        eventData = data as { isProcessing: boolean; mode: ProcessingMode; timestamp: number };
      });

      modeManager.markBatchStart();

      expect(eventData).not.toBeNull();
      expect(eventData!.isProcessing).toBe(true);
      expect(eventData!.mode).toBe('remote');
      expect(typeof eventData!.timestamp).toBe('number');
    });

    it('should emit batch-complete event with correct data', () => {
      let eventData: { isProcessing: boolean; mode: ProcessingMode; timestamp: number } | null = null;

      modeManager.on('batch-complete', (data) => {
        eventData = data as { isProcessing: boolean; mode: ProcessingMode; timestamp: number };
      });

      modeManager.markBatchStart();
      modeManager.markBatchComplete();

      expect(eventData).not.toBeNull();
      expect(eventData!.isProcessing).toBe(false);
      expect(eventData!.mode).toBe('remote');
      expect(typeof eventData!.timestamp).toBe('number');
    });

    it('should handle multiple markBatchStart calls gracefully', () => {
      modeManager.markBatchStart();
      expect(modeManager.isBatchProcessing()).toBe(true);

      // Second call should be logged but not change state
      modeManager.markBatchStart();
      expect(modeManager.isBatchProcessing()).toBe(true);
    });

    it('should handle multiple markBatchComplete calls gracefully', () => {
      modeManager.markBatchStart();
      modeManager.markBatchComplete();
      expect(modeManager.isBatchProcessing()).toBe(false);

      // Second call should be logged but not change state
      modeManager.markBatchComplete();
      expect(modeManager.isBatchProcessing()).toBe(false);
    });
  });

  describe('State Management (Reset)', () => {
    it('should reset state and remove all listeners', () => {
      let eventEmitted = false;

      modeManager.on('mode-changed', () => {
        eventEmitted = true;
      });

      modeManager.switchMode('local');
      expect(modeManager.getCurrentMode()).toBe('local');
      expect(eventEmitted).toBe(true);

      // Reset to remote
      modeManager.reset('remote');

      expect(modeManager.getCurrentMode()).toBe('remote');
      expect(modeManager.hasPendingSwitch()).toBe(false);
      expect(modeManager.isBatchProcessing()).toBe(false);

      // Event should not be emitted after reset (listeners removed)
      eventEmitted = false;
      modeManager.switchMode('local');
      expect(eventEmitted).toBe(false);
    });

    it('should allow new listeners after reset', () => {
      modeManager.reset('local');

      let eventEmitted = false;
      modeManager.on('mode-changed', () => {
        eventEmitted = true;
      });

      modeManager.switchMode('remote');

      expect(eventEmitted).toBe(true);
      expect(modeManager.getCurrentMode()).toBe('remote');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete workflow: batch -> switch request -> complete batch -> switch', () => {
      const events: Array<string> = [];

      modeManager.on('batch-start', () => events.push('batch-start'));
      modeManager.on('mode-switch-queued', () => events.push('mode-switch-queued'));
      modeManager.on('batch-complete', () => events.push('batch-complete'));
      modeManager.on('mode-changed', () => events.push('mode-changed'));

      // Start batch
      modeManager.markBatchStart();

      // Request switch while processing
      modeManager.switchMode('local');

      expect(modeManager.getCurrentMode()).toBe('remote');
      expect(modeManager.hasPendingSwitch()).toBe(true);

      // Complete batch
      modeManager.markBatchComplete();

      // Verify final state
      expect(modeManager.getCurrentMode()).toBe('local');
      expect(modeManager.hasPendingSwitch()).toBe(false);
      expect(events).toEqual([
        'batch-start',
        'mode-switch-queued',
        'batch-complete',
        'mode-changed',
      ]);
    });

    it('should handle workflow with cancellation: batch -> switch -> cancel -> complete batch', () => {
      const events: Array<string> = [];

      modeManager.on('mode-switch-queued', () => events.push('mode-switch-queued'));
      modeManager.on('mode-switch-cancelled', () => events.push('mode-switch-cancelled'));
      modeManager.on('batch-complete', () => events.push('batch-complete'));

      // Start batch
      modeManager.markBatchStart();

      // Request switch
      modeManager.switchMode('local');
      expect(modeManager.hasPendingSwitch()).toBe(true);

      // Cancel switch
      modeManager.cancelPendingSwitch();
      expect(modeManager.hasPendingSwitch()).toBe(false);

      // Complete batch
      modeManager.markBatchComplete();

      // Verify no mode change occurred
      expect(modeManager.getCurrentMode()).toBe('remote');
      expect(events).toEqual([
        'mode-switch-queued',
        'mode-switch-cancelled',
        'batch-complete',
      ]);
    });

    it('should handle multiple batches with queued switch', () => {
      // First batch
      modeManager.markBatchStart();
      modeManager.switchMode('local');
      modeManager.markBatchComplete();

      expect(modeManager.getCurrentMode()).toBe('local');

      // Second batch (no pending switch)
      modeManager.markBatchStart();
      modeManager.markBatchComplete();

      expect(modeManager.getCurrentMode()).toBe('local');
    });
  });

  describe('Singleton Instance', () => {
    it('should return same instance from getModeManager()', () => {
      const instance1 = getModeManager();
      const instance2 = getModeManager();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton with resetModeManager()', () => {
      const instance1 = getModeManager();
      instance1.switchMode('local');

      resetModeManager();

      const instance2 = getModeManager();
      expect(instance2).not.toBe(instance1);
      expect(instance2.getCurrentMode()).toBe('remote'); // Default mode
    });
  });

  describe('FR-033 Compliance: Wait for Batch Completion', () => {
    it('should NOT switch mode while batch is processing', () => {
      modeManager.markBatchStart();
      modeManager.switchMode('local');

      // Per FR-033: Mode should NOT change while batch is processing
      expect(modeManager.getCurrentMode()).toBe('remote');
      expect(modeManager.hasPendingSwitch()).toBe(true);
    });

    it('should switch mode ONLY after batch completion', () => {
      modeManager.markBatchStart();
      modeManager.switchMode('local');

      // Before batch complete: still in old mode
      expect(modeManager.getCurrentMode()).toBe('remote');

      // After batch complete: switch executed
      modeManager.markBatchComplete();
      expect(modeManager.getCurrentMode()).toBe('local');
    });
  });

  describe('FR-034 Compliance: Queue New Tasks During Switch', () => {
    it('should allow multiple mode switch requests during batch processing', () => {
      modeManager.markBatchStart();

      // First request
      modeManager.switchMode('local');
      expect(modeManager.getPendingSwitch()).toBe('local');

      // Second request (overrides first)
      modeManager.switchMode('remote');
      expect(modeManager.getPendingSwitch()).toBe('remote');

      // Third request (overrides second)
      modeManager.switchMode('local');
      expect(modeManager.getPendingSwitch()).toBe('local');
    });
  });

  describe('FR-035 Compliance: Notify User of Pending Switch', () => {
    it('should emit mode-switch-queued event when switch is queued', () => {
      let eventEmitted = false;
      let eventData: { from: ProcessingMode; to: ProcessingMode; requestedAt: number } | null = null;

      modeManager.on('mode-switch-queued', (data) => {
        eventEmitted = true;
        eventData = data as { from: ProcessingMode; to: ProcessingMode; requestedAt: number };
      });

      modeManager.markBatchStart();
      modeManager.switchMode('local');

      expect(eventEmitted).toBe(true);
      expect(eventData).toEqual({
        from: 'remote',
        to: 'local',
        requestedAt: expect.any(Number),
      });
    });

    it('should include timestamp in queued event for user notification', () => {
      let eventTimestamp: number | null = null;

      modeManager.on('mode-switch-queued', (data) => {
        eventTimestamp = (data as { requestedAt: number }).requestedAt;
      });

      modeManager.markBatchStart();
      modeManager.switchMode('local');

      expect(eventTimestamp).not.toBeNull();
      expect(typeof eventTimestamp).toBe('number');
      expect(eventTimestamp).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle switch when already queued for same mode', () => {
      modeManager.markBatchStart();

      modeManager.switchMode('local');
      expect(modeManager.getPendingSwitch()).toBe('local');

      // Request switch to same pending mode
      const switchedImmediately = modeManager.switchMode('local');

      // Should still be queued, not immediate
      expect(switchedImmediately).toBe(false);
      expect(modeManager.getCurrentMode()).toBe('remote');
    });

    it('should handle getState() returns immutable copy', () => {
      const state1 = modeManager.getState();
      const state2 = modeManager.getState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Different object references
    });

    it('should handle rapid start/complete cycles', () => {
      for (let i = 0; i < 10; i++) {
        modeManager.markBatchStart();
        expect(modeManager.isBatchProcessing()).toBe(true);

        modeManager.markBatchComplete();
        expect(modeManager.isBatchProcessing()).toBe(false);
      }
    });
  });
});
