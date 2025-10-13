/**
 * Formats data as JSON
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Formats an object as XML
 */
export function formatXmlObject(
  obj: Record<string, unknown>,
  indent: string = '    '
): string {
  return Object.entries(obj)
    .map(([key, value]) => `${indent}<${key}>${value}</${key}>`)
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
  width: number;
  align?: 'left' | 'right';
}

/**
 * Formats data as an ASCII table
 */
export function formatTable<T extends Record<string, unknown>>(
  items: T[],
  columns: TableColumn[]
): string {
  const lines: string[] = [];

  // Build header separator
  const topBorder =
    '┌' + columns.map((col) => '─'.repeat(col.width + 2)).join('┬') + '┐';
  const middleBorder =
    '├' + columns.map((col) => '─'.repeat(col.width + 2)).join('┼') + '┤';
  const bottomBorder =
    '└' + columns.map((col) => '─'.repeat(col.width + 2)).join('┴') + '┘';

  // Top border
  lines.push('\n' + topBorder);

  // Header row
  const headerRow =
    '│ ' +
    columns.map((col) => col.header.padEnd(col.width)).join(' │ ') +
    ' │';
  lines.push(headerRow);

  // Middle border
  lines.push(middleBorder);

  // Data rows
  items.forEach((item) => {
    const cells = columns.map((col) => {
      const value = String(item[col.key] ?? '');
      return col.align === 'right'
        ? value.padStart(col.width)
        : value.padEnd(col.width);
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
