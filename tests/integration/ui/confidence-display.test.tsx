/**
 * Integration tests for confidence display in UI
 *
 * Tests T050: Confidence display integration
 * Per plan.md FR-011, FR-012:
 * - Visual indicators for confidence levels (badge colors, backgrounds)
 * - Summary banner with counts: "✅ 高置信度：X条, ⚠️ 需复核：Y条, ❓ 来源待确认：Z条"
 * - Light yellow background for <0.6 items
 * - Expanded source info for low confidence items
 *
 * @module tests/integration/ui/confidence-display.test
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ReportView from '@renderer/components/ReportView';
import { ConfidenceSummaryBanner, ConfidenceBadge } from '@renderer/components/reports';
import { ConfidenceThresholds } from '@shared/utils/ConfidenceThresholds';
import type { Item, ItemSourceRef } from '@shared/schemas/validation';

// Mock the reportStore
vi.mock('@renderer/stores/reportStore', () => ({
  useReportStore: vi.fn((selector) => {
    // Return default empty state for tests
    const state = {
      items: [],
      loading: false,
      error: null,
      loadReport: vi.fn(),
      clearError: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
  selectItems: vi.fn((state) => state.items),
  selectLoading: vi.fn((state) => state.loading),
  selectError: vi.fn((state) => state.error),
}));

describe('Confidence Display Integration Tests', () => {
  // Mock data setup
  const mockEmails: ItemSourceRef[] = [
    {
      email_hash: 'abc123',
      message_id: '<msg1@example.com>',
      sender_original: 'alice@example.com',
      subject_desensitized: 'Project Update',
      date: '2026-02-06T10:00:00Z',
      file_path: '/emails/001.eml',
      search_string: 'from:alice@example.com subject:"Project Update"',
      evidence_text: 'Clear deadline and action verb',
    },
    {
      email_hash: 'def456',
      message_id: '<msg2@example.com>',
      sender_original: 'bob@example.com',
      subject_desensitized: 'Task Assignment',
      date: '2026-02-06T11:00:00Z',
      file_path: '/emails/002.eml',
      search_string: 'from:bob@example.com subject:"Task Assignment"',
      evidence_text: 'Some action keywords but ambiguous context',
    },
    {
      email_hash: 'ghi789',
      message_id: '<msg3@example.com>',
      sender_original: 'charlie@example.com',
      subject_desensitized: 'Follow up',
      date: '2026-02-06T12:00:00Z',
      file_path: '/emails/003.eml',
      search_string: 'from:charlie@example.com subject:"Follow up"',
      evidence_text: 'Missing Message-ID, unclear context',
    },
  ];

  const mockItems: Array<{
    id: string;
    item_id: string;
    report_date: string;
    content: string;
    item_type: 'completed' | 'pending';
    source_status: 'verified' | 'unverified';
    confidence: number; // Changed from confidence_score to confidence for ConfidenceThresholds
    confidence_score: number; // Keep for DisplayItem compatibility
    tags: string[];
    sources: ItemSourceRef[];
    created_at: number;
  }> = [
    {
      id: '1',
      item_id: '1',
      report_date: '2026-02-06',
      content: 'Complete project report by Friday',
      item_type: 'pending',
      source_status: 'verified',
      confidence: 0.9, // For ConfidenceThresholds
      confidence_score: 0.9, // For DisplayItem
      tags: ['deadline'],
      sources: [mockEmails[0]],
      created_at: Date.now(),
    },
    {
      id: '2',
      item_id: '2',
      report_date: '2026-02-06',
      content: 'Review documentation',
      item_type: 'pending',
      source_status: 'verified',
      confidence: 0.7, // For ConfidenceThresholds
      confidence_score: 0.7, // For DisplayItem
      tags: [],
      sources: [mockEmails[1]],
      created_at: Date.now(),
    },
    {
      id: '3',
      item_id: '3',
      report_date: '2026-02-06',
      content: 'Maybe follow up on meeting',
      item_type: 'pending',
      source_status: 'unverified',
      confidence: 0.5, // For ConfidenceThresholds
      confidence_score: 0.5, // For DisplayItem
      tags: [],
      sources: [mockEmails[2]],
      created_at: Date.now(),
    },
  ];

  describe('ConfidenceSummaryBanner', () => {
    it('should display correct counts for all confidence levels', () => {
      const summary = ConfidenceThresholds.getSummary(mockItems);

      render(
        <ConfidenceSummaryBanner
          highCount={summary.highCount}
          mediumCount={summary.mediumCount}
          lowCount={summary.lowCount}
        />
      );

      // Check for high confidence badge
      expect(screen.getByText(/✅.*高置信度.*1条/)).toBeInTheDocument();

      // Check for medium confidence badge
      expect(screen.getByText(/⚠️.*需复核.*1条/)).toBeInTheDocument();

      // Check for low confidence badge
      expect(screen.getByText(/❓.*来源待确认.*1条/)).toBeInTheDocument();
    });

    it('should display all zeros when no items', () => {
      render(
        <ConfidenceSummaryBanner
          highCount={0}
          mediumCount={0}
          lowCount={0}
        />
      );

      expect(screen.getByText(/✅.*高置信度.*0条/)).toBeInTheDocument();
      expect(screen.getByText(/⚠️.*需复核.*0条/)).toBeInTheDocument();
      expect(screen.getByText(/❓.*来源待确认.*0条/)).toBeInTheDocument();
    });

    it('should handle large counts correctly', () => {
      render(
        <ConfidenceSummaryBanner
          highCount={100}
          mediumCount={50}
          lowCount={25}
        />
      );

      expect(screen.getByText(/✅.*高置信度.*100条/)).toBeInTheDocument();
      expect(screen.getByText(/⚠️.*需复核.*50条/)).toBeInTheDocument();
      expect(screen.getByText(/❓.*来源待确认.*25条/)).toBeInTheDocument();
    });

    it('should have proper color styling for each category', () => {
      const { container } = render(
        <ConfidenceSummaryBanner
          highCount={5}
          mediumCount={3}
          lowCount={2}
        />
      );

      // Check for green styling on high confidence
      const highBadge = screen.getByText(/✅.*高置信度/);
      expect(highBadge.className).toContain('text-green-600');

      // Check for yellow/gray styling on medium confidence
      const mediumBadge = screen.getByText(/⚠️.*需复核/);
      expect(mediumBadge.className).toContain('text-gray-600');

      // Check for red/prominent styling on low confidence
      const lowBadge = screen.getByText(/❓.*来源待确认/);
      expect(lowBadge.className).toContain('text-red-600');
    });
  });

  describe('ConfidenceBadge', () => {
    it('should display no badge for high confidence (≥0.8)', () => {
      const { container } = render(
        <ConfidenceBadge confidence={0.9} />
      );

      // High confidence should not show a badge
      expect(container.querySelector('[data-testid="confidence-badge"]')).toBeNull();
    });

    it('should display gray "[建议复核]" badge for medium confidence (0.6-0.79)', () => {
      render(<ConfidenceBadge confidence={0.7} />);

      const badge = screen.getByText('[建议复核]');
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain('bg-gray-100');
      expect(badge.className).toContain('text-gray-700');
    });

    it('should display prominent "[来源待确认]" badge for low confidence (<0.6)', () => {
      render(<ConfidenceBadge confidence={0.5} />);

      const badge = screen.getByText('[来源待确认]');
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain('bg-red-100');
      expect(badge.className).toContain('text-red-700');
      expect(badge.className).toContain('border-2');
      expect(badge.className).toContain('border-red-300');
    });

    it('should handle edge case confidence 0.6 as medium', () => {
      render(<ConfidenceBadge confidence={0.6} />);

      const badge = screen.getByText('[建议复核]');
      expect(badge).toBeInTheDocument();
    });

    it('should handle edge case confidence 0.8 as high (no badge)', () => {
      const { container } = render(
        <ConfidenceBadge confidence={0.8} />
      );

      expect(container.querySelector('[data-testid="confidence-badge"]')).toBeNull();
    });
  });

  describe('ReportView - conditional styling', () => {
    it('should apply light yellow background for low confidence items', () => {
      const { container } = render(
        <ReportView
          items={mockItems}
          emails={mockEmails}
          reportDate="2026-02-06"
        />
      );

      // Find the low confidence item card
      const lowConfidenceItem = mockItems.find((item) => item.confidence < 0.6);
      expect(lowConfidenceItem).toBeDefined();

      const itemCard = container.querySelector(`[data-item-id="${lowConfidenceItem!.id}"]`);
      expect(itemCard?.className).toContain('bg-yellow-50');
    });

    it('should NOT apply yellow background for high confidence items', () => {
      const { container } = render(
        <ReportView
          items={mockItems}
          emails={mockEmails}
          reportDate="2026-02-06"
        />
      );

      const highConfidenceItem = mockItems.find((item) => item.confidence >= 0.8);
      expect(highConfidenceItem).toBeDefined();

      const itemCard = container.querySelector(`[data-item-id="${highConfidenceItem!.id}"]`);
      expect(itemCard?.className).not.toContain('bg-yellow-50');
    });

    it('should NOT apply yellow background for medium confidence items', () => {
      const { container } = render(
        <ReportView
          items={mockItems}
          emails={mockEmails}
          reportDate="2026-02-06"
        />
      );

      const mediumConfidenceItem = mockItems.find(
        (item) => item.confidence >= 0.6 && item.confidence < 0.8
      );
      expect(mediumConfidenceItem).toBeDefined();

      const itemCard = container.querySelector(`[data-item-id="${mediumConfidenceItem!.id}"]`);
      expect(itemCard?.className).not.toContain('bg-yellow-50');
    });

    it('should display expanded source info for low confidence items', () => {
      const { container } = render(
        <ReportView
          items={mockItems}
          emails={mockEmails}
          reportDate="2026-02-06"
        />
      );

      const lowConfidenceItem = mockItems.find((item) => item.confidence < 0.6);
      expect(lowConfidenceItem).toBeDefined();

      const itemCard = container.querySelector(`[data-item-id="${lowConfidenceItem!.id}"]`);

      // Expanded source info should include all metadata fields
      expect(within(itemCard!).getByText(/From:/)).toBeInTheDocument();
      expect(within(itemCard!).getByText(/Date:/)).toBeInTheDocument();
      expect(within(itemCard!).getByText(/Subject:/)).toBeInTheDocument();
      expect(within(itemCard!).getByText(/Message-ID:/)).toBeInTheDocument();
      expect(within(itemCard!).getByText(/File Path:/)).toBeInTheDocument();
      expect(within(itemCard!).getByText(/Search:/)).toBeInTheDocument();
    });

    it('should display summary banner at top of report', () => {
      const { container } = render(
        <ReportView
          items={mockItems}
          emails={mockEmails}
          reportDate="2026-02-06"
        />
      );

      const summaryBanner = container.querySelector('[data-testid="confidence-summary-banner"]');
      expect(summaryBanner).toBeInTheDocument();

      // Should be the first child
      const reportContainer = container.querySelector('[data-testid="daily-report"]');
      expect(reportContainer?.firstChild).toEqual(summaryBanner);
    });
  });

  describe('Visual accessibility', () => {
    it('should maintain sufficient color contrast for badges', () => {
      const { container } = render(
        <ConfidenceBadge confidence={0.5} />
      );

      const badge = screen.getByText('[来源待确认]');

      // Red badge on white background should have good contrast
      expect(badge.className).toContain('bg-red-100');
      expect(badge.className).toContain('text-red-700');
    });

    it('should use semantic icons alongside text labels', () => {
      render(
        <ConfidenceSummaryBanner
          highCount={5}
          mediumCount={3}
          lowCount={2}
        />
      );

      // Check for emoji icons (✅, ⚠️, ❓)
      expect(screen.getByText(/✅/)).toBeInTheDocument();
      expect(screen.getByText(/⚠️/)).toBeInTheDocument();
      expect(screen.getByText(/❓/)).toBeInTheDocument();
    });
  });

  describe('Performance and rendering', () => {
    it('should render large item lists efficiently', () => {
      const largeItemList = Array.from({ length: 1000 }, (_, i) => ({
        id: String(i + 1),
        item_id: String(i + 1),
        report_date: '2026-02-06',
        content: `Test item ${i}`,
        item_type: 'pending' as const,
        source_status: 'verified' as const,
        confidence: i % 3 === 0 ? 0.5 : i % 3 === 1 ? 0.7 : 0.9,
        confidence_score: i % 3 === 0 ? 0.5 : i % 3 === 1 ? 0.7 : 0.9,
        tags: [],
        sources: [],
        created_at: Date.now(),
      }));

      const startTime = performance.now();

      render(
        <ReportView
          items={largeItemList}
          emails={[]}
          reportDate="2026-02-06"
        />
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render 1000 items in reasonable time (<1 second)
      expect(renderTime).toBeLessThan(1000);
    });

    it('should update efficiently when confidence scores change', () => {
      const { rerender } = render(
        <ConfidenceBadge confidence={0.7} />
      );

      const initialBadge = screen.getByText('[建议复核]');
      expect(initialBadge).toBeInTheDocument();

      // Update confidence
      rerender(<ConfidenceBadge confidence={0.5} />);

      const updatedBadge = screen.getByText('[来源待确认]');
      expect(updatedBadge).toBeInTheDocument();
      expect(initialBadge).not.toBeInTheDocument();
    });
  });

  describe('Integration with filtering', () => {
    it('should correctly filter and display only low confidence items', () => {
      const filteredItems = ConfidenceThresholds.filterByLevel(mockItems, 'low');

      const { container } = render(
        <ReportView
          items={filteredItems}
          emails={mockEmails}
          reportDate="2026-02-06"
        />
      );

      const itemCards = container.querySelectorAll('[data-item-id]');
      expect(itemCards.length).toBe(1);

      const displayedItem = filteredItems[0];
      expect(displayedItem.confidence).toBeLessThan(0.6);
    });

    it('should sort items by confidence ascending (lowest first)', () => {
      const sortedItems = ConfidenceThresholds.sortByConfidence(mockItems);

      const { container } = render(
        <ReportView
          items={sortedItems}
          emails={mockEmails}
          reportDate="2026-02-06"
        />
      );

      const itemCards = Array.from(container.querySelectorAll('[data-item-id]'));

      // First item should be lowest confidence
      const firstItemId = parseInt(itemCards[0].getAttribute('data-item-id') || '0');
      const firstItem = sortedItems.find((item) => item.id === firstItemId);

      expect(firstItem?.confidence).toBeLessThan(sortedItems[1].confidence);
    });
  });
});
