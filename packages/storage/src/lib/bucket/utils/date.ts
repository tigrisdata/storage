/**
 * Validates that days is a positive integer.
 * Returns an error message string if invalid, undefined if valid.
 */
export function validateDays(days: number): string | undefined {
  if (!Number.isInteger(days) || days <= 0) {
    return 'days must be a positive integer';
  }
}

/**
 * Validates a date string and formats it to ISO-8601 (YYYY-MM-DD) in UTC.
 * Returns the formatted date string, or an error.
 */
export function validateAndFormatDate(date: string): { value: string } | { error: string } {
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) {
    return { error: 'date must be a valid date' };
  }

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return { value: `${year}-${month}-${day}` };
}
