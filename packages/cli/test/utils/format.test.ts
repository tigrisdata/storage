import { describe, it, expect } from 'vitest';
import {
  formatSize,
  formatJson,
  formatXml,
  formatXmlObject,
  formatTable,
  formatOutput,
  type TableColumn,
} from '../../src/utils/format.js';

describe('formatSize', () => {
  it.each([
    [0, '0 B'],
    [500, '500 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1048576, '1.0 MB'],
    [1073741824, '1.0 GB'],
    [1099511627776, '1.0 TB'],
  ])('formatSize(%d) → %s', (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });
});

describe('formatJson', () => {
  it('formats object with 2-space indent', () => {
    const result = formatJson({ name: 'test', count: 42 });
    expect(result).toBe(JSON.stringify({ name: 'test', count: 42 }, null, 2));
  });

  it('formats array', () => {
    const result = formatJson([1, 2, 3]);
    expect(result).toBe(JSON.stringify([1, 2, 3], null, 2));
  });
});

describe('formatXml', () => {
  it('wraps items in root and item tags', () => {
    const items = [{ name: 'test', size: 100 }];
    const result = formatXml(items, 'Buckets', 'Bucket');
    expect(result).toContain('<Buckets>');
    expect(result).toContain('</Buckets>');
    expect(result).toContain('<Bucket>');
    expect(result).toContain('</Bucket>');
    expect(result).toContain('<name>test</name>');
    expect(result).toContain('<size>100</size>');
  });

  it('escapes special XML characters', () => {
    const items = [{ text: '& < > " \'' }];
    const result = formatXml(items, 'Root', 'Item');
    expect(result).toContain('&amp;');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).toContain('&quot;');
    expect(result).toContain('&apos;');
  });
});

describe('formatXmlObject', () => {
  it('formats object fields as XML elements', () => {
    const result = formatXmlObject({ key: 'value' }, '  ');
    expect(result).toBe('  <key>value</key>');
  });
});

describe('formatTable', () => {
  const columns: TableColumn[] = [
    { key: 'name', header: 'Name' },
    { key: 'size', header: 'Size' },
  ];

  it('contains box-drawing characters', () => {
    const items = [{ name: 'test', size: '1 KB' }];
    const result = formatTable(items, columns);
    expect(result).toContain('┌');
    expect(result).toContain('─');
    expect(result).toContain('┬');
    expect(result).toContain('┐');
    expect(result).toContain('│');
    expect(result).toContain('├');
    expect(result).toContain('┼');
    expect(result).toContain('┤');
    expect(result).toContain('└');
    expect(result).toContain('┴');
    expect(result).toContain('┘');
  });

  it('includes header row with column names', () => {
    const items = [{ name: 'test', size: '1 KB' }];
    const result = formatTable(items, columns);
    expect(result).toContain('Name');
    expect(result).toContain('Size');
  });

  it('includes data values', () => {
    const items = [{ name: 'my-bucket', size: '42 MB' }];
    const result = formatTable(items, columns);
    expect(result).toContain('my-bucket');
    expect(result).toContain('42 MB');
  });

  it('right-aligns when specified', () => {
    const cols: TableColumn[] = [
      { key: 'name', header: 'Name' },
      { key: 'count', header: 'Count', align: 'right' },
    ];
    const items = [{ name: 'a', count: '5' }];
    const result = formatTable(items, cols);
    // The right-aligned cell should have leading spaces before the value
    const lines = result.split('\n');
    const dataLine = lines.find(
      (l) => l.includes('│') && l.includes('5') && !l.includes('Count')
    );
    expect(dataLine).toBeDefined();
    // In right-align, "5" is padStart'd, so the cell content ends with "5 │"
    // meaning there are spaces before "5" and the value is right-justified
    const cells = dataLine!.split('│');
    const countCell = cells[2]; // space + value + space
    // Right-aligned: value should be at the end of the cell (after trimming the border space)
    const trimmed = countCell.slice(1, -1); // remove border padding spaces
    expect(trimmed).toBe('5'.padStart(trimmed.length));
  });

  it('renders header even with empty items', () => {
    const result = formatTable([], columns);
    expect(result).toContain('Name');
    expect(result).toContain('Size');
    expect(result).toContain('┌');
    expect(result).toContain('┘');
  });
});

describe('formatOutput', () => {
  const columns: TableColumn[] = [
    { key: 'name', header: 'Name' },
  ];
  const items = [{ name: 'test' }];

  it("'json' → JSON output", () => {
    const result = formatOutput(items, 'json', 'Root', 'Item', columns);
    expect(JSON.parse(result)).toEqual(items);
  });

  it("'xml' → XML output", () => {
    const result = formatOutput(items, 'xml', 'Root', 'Item', columns);
    expect(result).toContain('<Root>');
    expect(result).toContain('<Item>');
  });

  it("'table' → table output", () => {
    const result = formatOutput(items, 'table', 'Root', 'Item', columns);
    expect(result).toContain('┌');
    expect(result).toContain('Name');
  });

  it('default format → table output', () => {
    const result = formatOutput(items, 'anything', 'Root', 'Item', columns);
    expect(result).toContain('┌');
  });
});
