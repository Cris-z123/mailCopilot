/**
 * Date Utilities - Standardized date handling using date-fns v4.x
 *
 * Per plan.md R0-9:
 * - Use date-fns uniformly for time zones and formatting
 * - Mixing native Date for complex calculations is prohibited
 * - All date operations must use these utilities for consistency
 *
 * @module shared/utils/dateUtils
 */

import { format, parseISO, isValid, formatISO } from 'date-fns';

/**
 * Format date as YYYY-MM-DD (ISO date-only format)
 *
 * Used for search string generation per plan.md R0-9:
 * `from:sender subject:"snippet" date:YYYY-MM-DD`
 *
 * @param dateInput - Date string (ISO 8601), Date object, or number
 * @returns Date in YYYY-MM-DD format, or current date if invalid
 *
 * @example
 * ```typescript
 * formatYYYYMMDD('2026-01-27T10:30:00Z') // '2026-01-27'
 * formatYYYYMMDD(new Date(2026, 0, 27)) // '2026-01-27'
 * ```
 */
export function formatYYYYMMDD(dateInput: string | Date | number): string {
  try {
    let date: Date;

    // Parse input based on type
    if (typeof dateInput === 'string') {
      date = parseISO(dateInput);
    } else if (dateInput instanceof Date) {
      date = dateInput;
    } else if (typeof dateInput === 'number') {
      date = new Date(dateInput);
    } else {
      // Fallback to current date for invalid input
      return format(new Date(), 'yyyy-MM-dd');
    }

    // Validate date
    if (!isValid(date)) {
      return format(new Date(), 'yyyy-MM-dd');
    }

    return format(date, 'yyyy-MM-dd');
  } catch (error) {
    // On any error, return current date
    return format(new Date(), 'yyyy-MM-dd');
  }
}

/**
 * Format date as ISO 8601 string
 *
 * Used for email date headers and database storage.
 * Consistent with mailparser's date.toISOString() output.
 *
 * @param dateInput - Date string, Date object, or number
 * @returns ISO 8601 date string, or current date ISO string if invalid
 *
 * @example
 * ```typescript
 * formatISO8601('2026-01-27T10:30:00Z') // '2026-01-27T10:30:00.000Z'
 * formatISO8601(new Date(2026, 0, 27)) // '2026-01-27T00:00:00.000Z'
 * ```
 */
export function formatISO8601(dateInput: string | Date | number): string {
  try {
    let date: Date;

    // Parse input based on type
    if (typeof dateInput === 'string') {
      date = parseISO(dateInput);
    } else if (dateInput instanceof Date) {
      date = dateInput;
    } else if (typeof dateInput === 'number') {
      date = new Date(dateInput);
    } else {
      // Fallback to current date for invalid input
      return formatISO(new Date());
    }

    // Validate date
    if (!isValid(date)) {
      return formatISO(new Date());
    }

    return formatISO(date);
  } catch (error) {
    // On any error, return current date
    return formatISO(new Date());
  }
}

/**
 * Parse email date header to ISO 8601 string
 *
 * Email dates can be in various RFC 5322 formats.
 * Uses date-fns parse with flexible format handling.
 *
 * @param dateHeader - Date string from email Date header
 * @returns ISO 8601 date string, or current date ISO string if parsing fails
 *
 * @example
 * ```typescript
 * parseEmailDate('Tue, 27 Jan 2026 10:30:00 +0800') // '2026-01-27T02:30:00.000Z'
 * parseEmailDate('2026-01-27T10:30:00Z') // '2026-01-27T10:30:00.000Z'
 * ```
 */
export function parseEmailDate(dateHeader: string): string {
  try {
    if (!dateHeader || typeof dateHeader !== 'string') {
      return formatISO(new Date());
    }

    // Try parsing as ISO first (fastest path)
    let date = parseISO(dateHeader);

    // If ISO parsing fails, try RFC 5322 format
    if (!isValid(date)) {
      // date-fns can parse many RFC 5322 formats automatically
      // If it fails, we'll catch it below
      date = new Date(dateHeader);
    }

    // Validate the parsed date
    if (!isValid(date) || isNaN(date.getTime())) {
      return formatISO(new Date());
    }

    return formatISO(date);
  } catch (error) {
    // On any error, return current date
    return formatISO(new Date());
  }
}

/**
 * Validate if a date string is valid ISO 8601 format
 *
 * @param dateStr - Date string to validate
 * @returns true if valid ISO 8601 date string
 *
 * @example
 * ```typescript
 * isValidISODate('2026-01-27T10:30:00Z') // true
 * isValidISODate('invalid-date') // false
 * ```
 */
export function isValidISODate(dateStr: string): boolean {
  try {
    if (!dateStr || typeof dateStr !== 'string') {
      return false;
    }

    const date = parseISO(dateStr);
    return isValid(date);
  } catch {
    return false;
  }
}

/**
 * Extract date-only portion (YYYY-MM-DD) from ISO 8601 string
 *
 * This is a utility for extracting just the date part without
 * creating a new Date object. Useful for search string generation.
 *
 * @param isoDate - ISO 8601 date string
 * @returns Date in YYYY-MM-DD format, or empty string if invalid
 *
 * @example
 * ```typescript
 * extractDateOnly('2026-01-27T10:30:00Z') // '2026-01-27'
 * extractDateOnly('invalid') // ''
 * ```
 */
export function extractDateOnly(isoDate: string): string {
  // Fast regex extraction (more efficient than parsing)
  // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm:ss.sss+HH:mm
  const match = isoDate?.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }

  // Fallback to parsing if regex fails
  return formatYYYYMMDD(isoDate);
}

/**
 * Get current date in ISO 8601 format
 *
 * Utility function for consistency across codebase.
 *
 * @returns Current date as ISO 8601 string
 *
 * @example
 * ```typescript
 * getCurrentDateISO() // '2026-01-27T10:30:00.000Z'
 * ```
 */
export function getCurrentDateISO(): string {
  return formatISO(new Date());
}

/**
 * Get current date in YYYY-MM-DD format
 *
 * Utility function for consistency across codebase.
 *
 * @returns Current date in YYYY-MM-DD format
 *
 * @example
 * ```typescript
 * getCurrentDateYYYYMMDD() // '2026-01-27'
 * ```
 */
export function getCurrentDateYYYYMMDD(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Format date for display in user interface
 *
 * Uses locale-aware formatting for Chinese/English support.
 *
 * @param dateInput - Date string, Date object, or number
 * @param locale - Locale string (default: 'zh-CN')
 * @returns Formatted date string for display
 *
 * @example
 * ```typescript
 * formatDateForDisplay('2026-01-27T10:30:00Z', 'zh-CN') // '2026年1月27日'
 * formatDateForDisplay('2026-01-27T10:30:00Z', 'en-US') // 'January 27, 2026'
 * ```
 */
export function formatDateForDisplay(
  dateInput: string | Date | number,
  locale: string = 'zh-CN'
): string {
  try {
    let date: Date;

    if (typeof dateInput === 'string') {
      date = parseISO(dateInput);
    } else if (dateInput instanceof Date) {
      date = dateInput;
    } else if (typeof dateInput === 'number') {
      date = new Date(dateInput);
    } else {
      return '';
    }

    if (!isValid(date)) {
      return '';
    }

    // Use Intl.DateTimeFormat for locale-aware formatting
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return '';
  }
}

/**
 * Calculate age of a date in days
 *
 * Useful for retention period calculations.
 *
 * @param dateInput - Date string, Date object, or number
 * @returns Age in days (0 if invalid date)
 *
 * @example
 * ```typescript
 * getAgeInDays('2026-01-20T10:30:00Z', '2026-01-27T10:30:00Z') // 7
 * ```
 */
export function getAgeInDays(
  dateInput: string | Date | number,
  currentDate: Date = new Date()
): number {
  try {
    let date: Date;

    if (typeof dateInput === 'string') {
      date = parseISO(dateInput);
    } else if (dateInput instanceof Date) {
      date = dateInput;
    } else if (typeof dateInput === 'number') {
      date = new Date(dateInput);
    } else {
      return 0;
    }

    if (!isValid(date)) {
      return 0;
    }

    // Calculate difference in milliseconds
    const diffMs = currentDate.getTime() - date.getTime();
    // Convert to days (1000ms * 60s * 60m * 24h)
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

export default {
  formatYYYYMMDD,
  formatISO8601,
  parseEmailDate,
  isValidISODate,
  extractDateOnly,
  getCurrentDateISO,
  getCurrentDateYYYYMMDD,
  formatDateForDisplay,
  getAgeInDays,
};
