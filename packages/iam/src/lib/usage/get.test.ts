import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../http-client')>()),
  createIAMClient: vi.fn(),
}));

import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import { getUsage } from './get';

const request = vi.fn();
const session = { sessionToken: 'tok', organizationId: 'org-selected' };

// Trimmed from a real DRAFT invoice.
const invoice = {
  customer_id: 'org-selected',
  payer_id: 'flyio_payer',
  plan_id: 'default_plan',
  plan_name: 'Default plan with free tier',
  status: 'DRAFT',
  starting_on: '2026-10-01T00:00:00Z',
  ending_before: '2026-10-06T00:00:00Z',
  charges: [
    {
      id: 'requests_class_A_v1',
      name: 'PUT, COPY, POST, LIST Requests',
      unit: 'Number of Requests',
      quantity: 16318,
      charged_quantity: 16318,
      total: 0.03,
      tiers: [
        {
          name: 'Tier 1 (1 - 10,000)',
          starting_after: 0,
          quantity: 10000,
          price: 0,
          subtotal: 0,
        },
        {
          name: 'Tier 2 (> 10,000)',
          starting_after: 10000,
          quantity: 6318,
          price: 0.000005,
          subtotal: 0.03,
        },
      ],
    },
  ],
  subtotal: 0.03,
  total: 0.03,
  created_at: '2026-10-06T05:33:03.721350399Z',
  last_modified: '2026-10-06T05:33:03.75558167Z',
  submitted_at: '0001-01-01T00:00:00Z',
  scheduled_at: '0001-01-01T00:00:00Z',
  paid_at: '0001-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  request.mockResolvedValue({ data: invoice });
  vi.mocked(createIAMClient).mockReturnValue({
    data: { request },
  } as unknown as ReturnType<typeof createIAMClient>);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getUsage', () => {
  it('fetches the month from the management endpoint and maps the invoice', async () => {
    const result = await getUsage({ month: '2026-09', config: session });

    expect(createIAMClient).toHaveBeenCalledWith(session, true);
    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: IAM_ENDPOINTS.usage,
      query: { month: '2026-09' },
    });
    expect(result.data).toMatchObject({
      customerId: 'org-selected',
      payerId: 'flyio_payer',
      planId: 'default_plan',
      planName: 'Default plan with free tier',
      status: 'DRAFT',
      startingOn: '2026-10-01T00:00:00Z',
      endingBefore: '2026-10-06T00:00:00Z',
      subtotal: 0.03,
      total: 0.03,
      createdAt: '2026-10-06T05:33:03.721350399Z',
      lastModified: '2026-10-06T05:33:03.75558167Z',
    });
    expect(result.data?.charges).toEqual([
      {
        id: 'requests_class_A_v1',
        name: 'PUT, COPY, POST, LIST Requests',
        unit: 'Number of Requests',
        quantity: 16318,
        chargedQuantity: 16318,
        total: 0.03,
        minimumQuantity: undefined,
        tiers: [
          {
            name: 'Tier 1 (1 - 10,000)',
            startingAfter: 0,
            quantity: 10000,
            price: 0,
            subtotal: 0,
          },
          {
            name: 'Tier 2 (> 10,000)',
            startingAfter: 10000,
            quantity: 6318,
            price: 0.000005,
            subtotal: 0.03,
          },
        ],
      },
    ]);
  });

  it('defaults to the current month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));

    await getUsage({ config: session });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ query: { month: '2026-10' } })
    );
  });

  it('leaves states the invoice has not reached undefined instead of the zero time', async () => {
    const draft = await getUsage({ month: '2026-10', config: session });
    expect(draft.data?.submittedAt).toBeUndefined();
    expect(draft.data?.scheduledAt).toBeUndefined();
    expect(draft.data?.paidAt).toBeUndefined();

    request.mockResolvedValueOnce({
      data: { ...invoice, status: 'PAID', paid_at: '2026-11-02T00:00:00Z' },
    });
    const paid = await getUsage({ month: '2026-10', config: session });
    expect(paid.data?.paidAt).toBe('2026-11-02T00:00:00Z');
  });

  it('tolerates missing charges and tiers', async () => {
    request.mockResolvedValueOnce({ data: { ...invoice, charges: null } });
    const none = await getUsage({ month: '2026-10', config: session });
    expect(none.data?.charges).toEqual([]);

    request.mockResolvedValueOnce({
      data: {
        ...invoice,
        charges: [{ ...invoice.charges[0], tiers: undefined }],
      },
    });
    const flat = await getUsage({ month: '2026-10', config: session });
    expect(flat.data?.charges[0].tiers).toEqual([]);
  });

  it('rejects a month that is not YYYY-MM before any request', async () => {
    for (const month of ['2026-13', '2026-1', '10-2026', 'october']) {
      const result = await getUsage({ month, config: session });
      expect(result.error?.message).toBe(
        `Month must be in YYYY-MM format, got "${month}"`
      );
    }
    expect(createIAMClient).not.toHaveBeenCalled();
  });

  it("returns the client's error when it cannot be created", async () => {
    vi.mocked(createIAMClient).mockReturnValueOnce({
      error: new Error('Organization ID is required'),
    });
    const result = await getUsage({ month: '2026-10', config: session });
    expect(result.error?.message).toBe('Organization ID is required');
    expect(request).not.toHaveBeenCalled();
  });

  it("returns the gateway's error", async () => {
    request.mockResolvedValueOnce({ error: new Error('Forbidden') });
    const result = await getUsage({ month: '2026-10', config: session });
    expect(result.error?.message).toBe('Forbidden');
  });

  it('returns a transport failure as { error } instead of throwing', async () => {
    request.mockRejectedValueOnce(new TypeError('fetch failed'));
    const result = await getUsage({ month: '2026-10', config: session });
    expect(result.error?.message).toBe('fetch failed');
  });
});
