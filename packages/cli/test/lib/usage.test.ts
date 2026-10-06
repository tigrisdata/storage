import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as YAML from 'yaml';

vi.mock('@auth/iam.js', () => ({
  getOAuthIAMConfig: vi.fn(async () => ({
    sessionToken: 'tok',
    organizationId: 'org-a',
  })),
}));
vi.mock('@tigrisdata/iam', () => ({
  getUsage: vi.fn(),
}));

import { getUsage, type UsageResponse } from '@tigrisdata/iam';
import usage from '../../src/lib/usage.js';
import type { Specs } from '../../src/types.js';
import { setSpecs } from '../../src/utils/specs.js';

setSpecs(
  YAML.parse(readFileSync(join(process.cwd(), 'src/specs.yaml'), 'utf8'), {
    schema: 'core',
  }) as Specs
);

class ExitSignal extends Error {}

function charge(
  id: string,
  name: string,
  unit: string,
  quantity: number,
  total: number,
  chargedQuantity = quantity
): UsageResponse['charges'][number] {
  return {
    id,
    name,
    unit,
    quantity,
    chargedQuantity,
    total,
    tiers: [],
  };
}

const invoice: UsageResponse = {
  customerId: 'org-a',
  planId: 'default_plan',
  planName: 'Default plan with free tier',
  status: 'DRAFT',
  startingOn: '2026-10-01T00:00:00Z',
  endingBefore: '2026-10-06T00:00:00Z',
  charges: [
    charge(
      'requests_class_A_v1',
      'PUT, COPY, POST, LIST Requests',
      'Number of Requests',
      16318,
      0.03
    ),
    charge(
      'requests_class_B_v1',
      'GET, SELECT, and all other Requests',
      'Number of Requests',
      4826,
      0
    ),
    charge(
      'storage_size_bytes_v1',
      'Storage used - Standard',
      'GiB-Month',
      0,
      0
    ),
    charge('bandwidth_out_bytes_v1', 'Data transfer Out', 'GiB', 0, 0),
  ],
  subtotal: 0.03,
  total: 0.03,
  createdAt: '2026-10-06T05:33:03Z',
  lastModified: '2026-10-06T05:33:03Z',
};

// Nothing metered: only the all-zero lines remain.
const unused: UsageResponse = {
  ...invoice,
  charges: invoice.charges.slice(2),
  subtotal: 0,
  total: 0,
};

let stdout: string[];
let stderr: string[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUsage).mockResolvedValue({ data: invoice });
  stdout = [];
  stderr = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    stdout.push(args.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    stderr.push(args.join(' '));
  });
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new ExitSignal();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usage', () => {
  it('lists the charges with usage, used and billed quantities with their unit', async () => {
    await usage({});

    const output = stdout.join('\n');
    expect(output).toContain(
      'October 2026 · Default plan with free tier · as of 2026-10-06'
    );
    expect(output).toMatch(/Type\s+│\s+Used\s+│\s+Billed\s+│\s+Amount/);
    expect(output).toMatch(
      /PUT, COPY, POST, LIST Requests\s+│\s+16,318 Requests\s+│\s+16,318 Requests\s+│\s+\$0\.03/
    );
    expect(output).toContain('4,826 Requests');
    // Subtotal and total sit below a rule.
    const lines = output.split('\n');
    const subtotal = lines.findIndex((line) => line.includes('Subtotal'));
    expect(lines[subtotal - 1]).toMatch(/^├/);
    expect(lines[subtotal + 1]).toContain('Total');
    // Nothing used, so not shown.
    expect(output).not.toContain('Storage used - Standard');
    expect(output).not.toContain('Data transfer Out');
  });

  it('shows the billed quantity when a minimum raises it above the used one', async () => {
    vi.mocked(getUsage).mockResolvedValueOnce({
      data: {
        ...invoice,
        charges: [
          charge(
            'std_archive_storage_v1',
            'Storage used - Archive',
            'GiB-Month',
            0.5,
            0.02,
            5
          ),
        ],
      },
    });

    await usage({});

    expect(stdout.join('\n')).toMatch(
      /Storage used - Archive\s+│\s+0\.5 GiB-Month\s+│\s+5 GiB-Month\s+│\s+\$0\.02/
    );
  });

  it('includes the line items without usage with --all', async () => {
    await usage({ all: true });

    const output = stdout.join('\n');
    expect(output).toContain('Storage used - Standard');
    expect(output).toContain('0 GiB-Month');
    expect(output).toContain('Data transfer Out');
  });

  it('asks for the requested month', async () => {
    await usage({ month: '2026-09' });

    expect(getUsage).toHaveBeenCalledWith({
      month: '2026-09',
      config: { sessionToken: 'tok', organizationId: 'org-a' },
    });
  });

  it('lists the commitment above the subtotal and explains it under the table', async () => {
    vi.mocked(getUsage).mockResolvedValueOnce({
      data: {
        ...invoice,
        minimumCommit: 10,
        creditGrants: [{ name: 'Startup credit', amount: 5 }],
        total: 5,
      },
    });

    await usage({});

    const output = stdout.join('\n');
    const footer = output
      .split('\n')
      .filter((line) =>
        /Subtotal|Minimum Commitment|Startup credit|Total/.test(line)
      )
      .map((line) => line.replace(/\s*│\s*/g, '|').replace(/^\||\|$/g, ''));
    expect(footer).toEqual([
      'Minimum Commitment|||$10.00',
      'Subtotal|||$0.03',
      'Startup credit|||-$5.00',
      'Total|||$5.00',
    ]);
    expect(output).toMatch(
      /┘\n\nMinimum commitment: your plan bills at least \$10\.00 a month, before credits\.$/
    );
  });

  it('keeps the commitment visible when the subtotal exceeds it', async () => {
    vi.mocked(getUsage).mockResolvedValueOnce({
      data: { ...invoice, subtotal: 12, minimumCommit: 10, total: 12 },
    });

    await usage({});

    const output = stdout.join('\n');
    expect(output).toMatch(/Minimum Commitment\s+│\s+│\s+│\s+\$10\.00/);
    expect(output).toMatch(/Subtotal\s+│\s+│\s+│\s+\$12\.00/);
    expect(output).toContain('bills at least $10.00 a month');
  });

  it('prints no commitment note without one', async () => {
    await usage({});

    expect(stdout.join('\n')).not.toContain('Minimum commitment');
  });

  it('prints the whole invoice with --json', async () => {
    await usage({ json: true });

    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0])).toEqual(invoice);
  });

  it('prints the charges and invoice amounts as xml', async () => {
    await usage({ format: 'xml' });

    const output = stdout.join('\n');
    expect(output).toMatch(/^<usage>\n {2}<charges>\n {4}<charge>/);
    expect(output).toContain('<used>16318</used>');
    expect(output).toContain('<billed>16318</billed>');
    expect(output).toContain('<unit>Number of Requests</unit>');
    expect(output).toContain('<subtotal>0.03</subtotal>');
    expect(output).toMatch(/<total>0.03<\/total>\n<\/usage>$/);
    expect(output).not.toContain('Storage used - Standard');
  });

  it('still prints the amounts owed when nothing was metered', async () => {
    vi.mocked(getUsage).mockResolvedValueOnce({
      data: { ...unused, minimumCommit: 10, total: 10 },
    });

    await usage({});

    const output = stdout.join('\n');
    expect(output).toContain('October 2026');
    expect(output).toMatch(/Minimum Commitment\s+│\s+│\s+│\s+\$10\.00/);
    expect(output).toMatch(/Total\s+│\s+│\s+│\s+\$10\.00/);
    // A footer-only table: the header rule is the only one.
    expect(
      output.split('\n').filter((line) => line.startsWith('├'))
    ).toHaveLength(1);
  });

  it('still prints the table when there is a payment link', async () => {
    vi.mocked(getUsage).mockResolvedValueOnce({
      data: { ...unused, checkoutUrl: 'https://pay.example/inv' },
    });

    await usage({});

    expect(stdout.join('\n')).toMatch(/Total\s+│\s+│\s+│\s+\$0\.00/);
  });

  it('prints no table when nothing was used and nothing is owed', async () => {
    vi.mocked(getUsage).mockResolvedValueOnce({ data: unused });

    await usage({});

    expect(stdout.join('\n')).not.toContain('│');
  });

  it('fails with the gateway error', async () => {
    vi.mocked(getUsage).mockResolvedValueOnce({
      error: new Error('Forbidden'),
    });

    await expect(usage({})).rejects.toThrow(ExitSignal);
    expect(stderr.join('\n')).toContain('Forbidden');
  });
});
