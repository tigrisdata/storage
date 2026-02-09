/**
 * Formats bytes to human readable size
 */
export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Formats data as JSON
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Escapes special characters for safe XML output
 */
function escapeXml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats an object as XML
 */
export function formatXmlObject(
  obj: Record<string, unknown>,
  indent: string = '    '
): string {
  return Object.entries(obj)
    .map(([key, value]) => `${indent}<${key}>${escapeXml(value)}</${key}>`)
    .join('\n');
}

/**
 * Formats an array of objects as XML with a root element
 */
export function formatXml<T extends Record<string, unknown>>(
  items: T[],
  rootElement: string,
  itemElement: string
): string {
  const lines = [`<${rootElement}>`];

  items.forEach((item) => {
    lines.push(`  <${itemElement}>`);
    lines.push(formatXmlObject(item, '    '));
    lines.push(`  </${itemElement}>`);
  });

  lines.push(`</${rootElement}>`);
  return lines.join('\n');
}

/**
 * Interface for table column configuration
 */
export interface TableColumn {
  key: string;
  header: string;
  width?: number;
  align?: 'left' | 'right';
}

/**
 * Format a date value to a readable string
 */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return formatDate(value);
  }
  if (typeof value === 'string') {
    // Try to parse as date if it looks like an ISO date
    const date = new Date(value);
    if (!isNaN(date.getTime()) && value.includes('T')) {
      return formatDate(date);
    }
  }
  return String(value);
}

/**
 * Format a date according to user's locale
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Calculate column widths based on content
 */
function calculateColumnWidths<T extends Record<string, unknown>>(
  items: T[],
  columns: TableColumn[]
): number[] {
  return columns.map((col) => {
    // If width is explicitly set, use it
    if (col.width) {
      return col.width;
    }

    // Calculate width from header and all values
    const headerWidth = col.header.length;
    const maxValueWidth = items.reduce((max, item) => {
      const value = formatCellValue(item[col.key]);
      return Math.max(max, value.length);
    }, 0);

    return Math.max(headerWidth, maxValueWidth);
  });
}

/**
 * Formats data as an ASCII table
 */
export function formatTable<T extends Record<string, unknown>>(
  items: T[],
  columns: TableColumn[]
): string {
  const lines: string[] = [];

  // Calculate widths based on content
  const widths = calculateColumnWidths(items, columns);

  // Build header separator
  const topBorder = '┌' + widths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐';
  const middleBorder =
    '├' + widths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤';
  const bottomBorder =
    '└' + widths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘';

  // Top border
  lines.push('\n' + topBorder);

  // Header row
  const headerRow =
    '│ ' +
    columns.map((col, i) => col.header.padEnd(widths[i])).join(' │ ') +
    ' │';
  lines.push(headerRow);

  // Middle border
  lines.push(middleBorder);

  // Data rows
  items.forEach((item) => {
    const cells = columns.map((col, i) => {
      const value = formatCellValue(item[col.key]);
      return col.align === 'right'
        ? value.padStart(widths[i])
        : value.padEnd(widths[i]);
    });
    lines.push('│ ' + cells.join(' │ ') + ' │');
  });

  // Bottom border
  lines.push(bottomBorder + '\n');

  return lines.join('\n');
}

/**
 * Format output based on format option
 */
export function formatOutput<T extends Record<string, unknown>>(
  items: T[],
  format: string,
  rootElement: string,
  itemElement: string,
  columns: TableColumn[]
): string {
  switch (format) {
    case 'json':
      return formatJson(items);
    case 'xml':
      return formatXml(items, rootElement, itemElement);
    default:
      return formatTable(items, columns);
  }
}
