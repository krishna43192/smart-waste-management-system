/**
 * Format Utilities
 * 
 * Provides consistent formatting functions for analytics data.
 * Follows the DRY principle by centralizing formatting logic.
 */

/**
 * Formats a weight value in kilograms
 * 
 * @param {Number} value - Weight value to format
 * @returns {String} Formatted string with 'kg' suffix
 */
export function formatKg(value) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
}

/**
 * Formats a date to localized string
 * 
 * @param {Date|String} date - Date to format
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {String} Formatted date string
 */
export function formatDate(date, options = {}) {
  return new Date(date).toLocaleDateString(undefined, options);
}

/**
 * Formats a date range to display string
 * 
 * @param {Date|String} from - Start date
 * @param {Date|String} to - End date
 * @returns {String} Formatted date range
 */
export function formatDateRange(from, to) {
  const fromStr = formatDate(from);
  const toStr = formatDate(to);
  return `${fromStr} → ${toStr}`;
}

/**
 * Formats an array to display string
 * 
 * @param {Array} items - Array of items
 * @param {String} defaultText - Text to show if array is empty
 * @returns {String} Formatted string
 */
export function formatArray(items, defaultText = 'All') {
  return items?.length ? items.join(', ') : defaultText;
}

/**
 * Calculates percentage width for progress bars
 * 
 * @param {Number} value - Current value
 * @param {Number} maxValue - Maximum value
 * @returns {Number} Percentage (0-100)
 */
export function calculatePercentage(value, maxValue) {
  if (maxValue === 0) return 0;
  return Math.round((value / maxValue) * 100);
}
