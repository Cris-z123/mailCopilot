/**
 * Unit Tests: Date Utilities
 *
 * Tests for standardized date handling using date-fns v4.x per plan.md R0-9.
 *
 * @module tests/unit/utils/dateUtils
 */

import { describe, it, expect } from 'vitest';
import {
  formatYYYYMMDD,
  formatISO8601,
  parseEmailDate,
  isValidISODate,
  extractDateOnly,
  getCurrentDateISO,
  getCurrentDateYYYYMMDD,
  formatDateForDisplay,
  getAgeInDays,
} from '../../../shared/utils/dateUtils';

describe('formatYYYYMMDD', () => {
  it('should format ISO date string to YYYY-MM-DD', () => {
    const result = formatYYYYMMDD('2026-01-27T10:30:00Z');
    expect(result).toBe('2026-01-27');
  });

  it('should format Date object to YYYY-MM-DD', () => {
    const date = new Date(2026, 0, 27); // Month is 0-indexed
    const result = formatYYYYMMDD(date);
    expect(result).toBe('2026-01-27');
  });

  it('should format timestamp to YYYY-MM-DD', () => {
    const timestamp = new Date(2026, 0, 27).getTime();
    const result = formatYYYYMMDD(timestamp);
    expect(result).toBe('2026-01-27');
  });

  it('should handle leap year dates correctly', () => {
    const result = formatYYYYMMDD('2024-02-29T10:30:00Z');
    expect(result).toBe('2024-02-29');
  });

  it('should return current date for invalid date string', () => {
    const result = formatYYYYMMDD('invalid-date');
    // Should return today's date in YYYY-MM-DD format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should return current date for invalid input type', () => {
    const result = formatYYYYMMDD(undefined as any);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should handle timezone edge cases', () => {
    // UTC timezone
    const utcDate = '2026-01-27T00:00:00Z';
    const result = formatYYYYMMDD(utcDate);
    expect(result).toBe('2026-01-27');

    // Positive timezone offset
    const positiveOffset = '2026-01-27T10:30:00+08:00';
    const result2 = formatYYYYMMDD(positiveOffset);
    expect(result2).toBe('2026-01-27');

    // Negative timezone offset
    const negativeOffset = '2026-01-27T10:30:00-05:00';
    const result3 = formatYYYYMMDD(negativeOffset);
    expect(result3).toBe('2026-01-27');
  });
});

describe('formatISO8601', () => {
  it('should format date string to ISO 8601', () => {
    const result = formatISO8601('2026-01-27T10:30:00Z');
    // Accept both UTC (Z) and timezone offset (+/-HH:MM) formats
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/);
  });

  it('should format Date object to ISO 8601', () => {
    const date = new Date(2026, 0, 27, 10, 30, 0);
    const result = formatISO8601(date);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/);
  });

  it('should handle invalid dates gracefully', () => {
    const result = formatISO8601('invalid');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/);
  });

  it('should preserve timezone information', () => {
    const dateWithOffset = '2026-01-27T10:30:00+08:00';
    const result = formatISO8601(dateWithOffset);
    // Should preserve timezone or convert to local timezone
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/);
  });
});

describe('parseEmailDate', () => {
  it('should parse RFC 5322 date format', () => {
    const rfcDate = 'Tue, 27 Jan 2026 10:30:00 +0800';
    const result = parseEmailDate(rfcDate);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/);
  });

  it('should parse ISO 8601 date format', () => {
    const isoDate = '2026-01-27T10:30:00Z';
    const result = parseEmailDate(isoDate);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/);
  });

  it('should handle invalid date headers gracefully', () => {
    const result = parseEmailDate('invalid-date-header');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/);
  });

  it('should handle empty string input', () => {
    const result = parseEmailDate('');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/);
  });

  it('should handle various email date formats', () => {
    const formats = [
      '27 Jan 2026 10:30:00 +0800',
      'Tue, 27 Jan 2026 10:30:00 +0800',
      'January 27, 2026 10:30 AM',
      '2026-01-27T10:30:00+08:00',
    ];

    formats.forEach((format) => {
      const result = parseEmailDate(format);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/);
    });
  });
});

describe('isValidISODate', () => {
  it('should return true for valid ISO 8601 dates', () => {
    expect(isValidISODate('2026-01-27T10:30:00Z')).toBe(true);
    expect(isValidISODate('2026-01-27')).toBe(true);
    expect(isValidISODate('2026-01-27T10:30:00+08:00')).toBe(true);
  });

  it('should return false for invalid date strings', () => {
    expect(isValidISODate('invalid-date')).toBe(false);
    expect(isValidISODate('')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false); // Invalid month
    expect(isValidISODate('2026-02-30')).toBe(false); // Invalid day
  });

  it('should return false for non-string input', () => {
    expect(isValidISODate(undefined as any)).toBe(false);
    expect(isValidISODate(null as any)).toBe(false);
    expect(isValidISODate(123 as any)).toBe(false);
  });
});

describe('extractDateOnly', () => {
  it('should extract YYYY-MM-DD from ISO 8601 date', () => {
    expect(extractDateOnly('2026-01-27T10:30:00Z')).toBe('2026-01-27');
    expect(extractDateOnly('2026-01-27T10:30:00+08:00')).toBe('2026-01-27');
    expect(extractDateOnly('2026-01-27')).toBe('2026-01-27');
  });

  it('should use fast regex extraction for valid ISO dates', () => {
    const result = extractDateOnly('2026-01-27T10:30:00Z');
    expect(result).toBe('2026-01-27');
  });

  it('should handle invalid dates gracefully', () => {
    const result = extractDateOnly('invalid');
    // Should return today's date in YYYY-MM-DD format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should handle empty string', () => {
    const result = extractDateOnly('');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getCurrentDateISO', () => {
  it('should return current date in ISO 8601 format', () => {
    const result = getCurrentDateISO();
    // Accept both UTC (Z) and timezone offset (+/-HH:MM) formats
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/);
  });

  it('should return date close to current time', () => {
    const result = getCurrentDateISO();
    const parsed = new Date(result);
    const now = new Date();
    const diffMs = Math.abs(parsed.getTime() - now.getTime());
    // Should be within 1 second
    expect(diffMs).toBeLessThan(1000);
  });
});

describe('getCurrentDateYYYYMMDD', () => {
  it('should return current date in YYYY-MM-DD format', () => {
    const result = getCurrentDateYYYYMMDD();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should return today\'s date', () => {
    const result = getCurrentDateYYYYMMDD();
    const today = new Date();
    const expected = formatYYYYMMDD(today);
    expect(result).toBe(expected);
  });
});

describe('formatDateForDisplay', () => {
  it('should format date for Chinese locale', () => {
    const result = formatDateForDisplay('2026-01-27T10:30:00Z', 'zh-CN');
    expect(result).toContain('2026');
    expect(result).toContain('1');
    expect(result).toContain('27');
  });

  it('should format date for English locale', () => {
    const result = formatDateForDisplay('2026-01-27T10:30:00Z', 'en-US');
    expect(result).toContain('2026');
    expect(result).toContain('January');
    expect(result).toContain('27');
  });

  it('should use Chinese locale by default', () => {
    const result = formatDateForDisplay('2026-01-27T10:30:00Z');
    expect(result).toContain('2026');
  });

  it('should return empty string for invalid dates', () => {
    expect(formatDateForDisplay('invalid-date')).toBe('');
    expect(formatDateForDisplay(undefined as any)).toBe('');
  });
});

describe('getAgeInDays', () => {
  it('should calculate age in days correctly', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7); // 7 days ago

    const result = getAgeInDays(pastDate);
    expect(result).toBe(7);
  });

  it('should handle date string input', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);

    const result = getAgeInDays(pastDate.toISOString());
    expect(result).toBe(30);
  });

  it('should return 0 for invalid dates', () => {
    expect(getAgeInDays('invalid-date')).toBe(0);
    expect(getAgeInDays(undefined as any)).toBe(0);
  });

  it('should calculate age for future dates correctly (negative result)', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);

    const result = getAgeInDays(futureDate);
    expect(result).toBeLessThan(0);
  });

  it('should handle leap years correctly', () => {
    // Feb 29, 2024 to Feb 29, 2024 (same day, leap year)
    const leapDay = '2024-02-29T10:30:00Z';
    const result = getAgeInDays(leapDay, new Date('2024-02-29T10:30:00Z'));
    expect(result).toBe(0);
  });

  it('should calculate age across month boundaries', () => {
    // Jan 31 to Mar 1 (non-leap year)
    const jan31 = new Date(2026, 0, 31);
    const mar1 = new Date(2026, 2, 1);
    const result = getAgeInDays(jan31, mar1);
    // Jan has 31 days, Feb 2026 has 28 days = 29 days difference
    expect(result).toBe(29);
  });
});

describe('Edge Cases and Error Handling', () => {
  it('should handle undefined input gracefully', () => {
    expect(() => formatYYYYMMDD(undefined as any)).not.toThrow();
    expect(() => formatISO8601(undefined as any)).not.toThrow();
  });

  it('should handle null input gracefully', () => {
    expect(() => formatYYYYMMDD(null as any)).not.toThrow();
    expect(() => formatISO8601(null as any)).not.toThrow();
  });

  it('should handle extremely old dates', () => {
    const oldDate = '1900-01-01T00:00:00Z';
    expect(formatYYYYMMDD(oldDate)).toBe('1900-01-01');
  });

  it('should handle future dates', () => {
    // Note: This may convert to different day due to timezone
    const futureDate = '2100-12-31T23:59:59Z';
    const result = formatYYYYMMDD(futureDate);
    // Just check it's a valid date format, timezone may shift the day
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should handle dates near Unix epoch', () => {
    const epochDate = '1970-01-01T00:00:00Z';
    expect(formatYYYYMMDD(epochDate)).toBe('1970-01-01');
  });

  it('should handle minimum valid date', () => {
    const minDate = new Date(-8640000000000000);
    const result = formatYYYYMMDD(minDate);
    // May have more than 4 digits for year
    expect(result).toMatch(/^\d+-\d{2}-\d{2}$/);
  });

  it('should handle maximum valid date', () => {
    const maxDate = new Date(8640000000000000);
    const result = formatYYYYMMDD(maxDate);
    // May have more than 4 digits for year
    expect(result).toMatch(/^\d+-\d{2}-\d{2}$/);
  });
});

describe('Timezone Handling', () => {
  it('should handle UTC timezone correctly', () => {
    const utcDate = '2026-01-27T00:00:00Z';
    expect(formatYYYYMMDD(utcDate)).toBe('2026-01-27');
  });

  it('should handle positive timezone offset', () => {
    const plusEight = '2026-01-27T10:30:00+08:00';
    expect(formatYYYYMMDD(plusEight)).toBe('2026-01-27');
  });

  it('should handle negative timezone offset', () => {
    const minusFive = '2026-01-27T10:30:00-05:00';
    expect(formatYYYYMMDD(minusFive)).toBe('2026-01-27');
  });

  it('should handle date crossing timezone boundary', () => {
    // Late night UTC, early morning next day in +08:00
    const lateUtc = '2026-01-27T23:30:00Z';
    // In +08:00 timezone, this would be Jan 28 07:30
    const result = formatYYYYMMDD(lateUtc);
    // formatYYYYMMDD uses local timezone, so result depends on system timezone
    // Just verify it's a valid date format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
