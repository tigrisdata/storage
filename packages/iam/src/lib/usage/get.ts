import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import type { TigrisIAMConfig, TigrisIAMResponse } from '../types';

export type GetUsageOptions = {
  /** Billing month as `YYYY-MM`. Defaults to the current month (UTC). */
  month?: string;
  config?: TigrisIAMConfig;
};

export type UsageChargeTier = {
  name: string;
  startingAfter: number;
  quantity: number;
  price: number;
  subtotal: number;
};

export type UsageCharge = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  /** The quantity billed: `max(quantity, minimumQuantity)`. */
  chargedQuantity: number;
  total: number;
  minimumQuantity?: number;
  tiers: UsageChargeTier[];
};

export type UsageCreditGrant = {
  name: string;
  amount: number;
};

export type UsageResponse = {
  customerId: string;
  payerId?: string;
  planId: string;
  planName: string;
  /** `DRAFT` while the month is open; settled invoices carry the billing state. */
  status: string;
  startingOn: string;
  /** Exclusive end of the period covered, i.e. when the usage was last refreshed. */
  endingBefore: string;
  charges: UsageCharge[];
  /** Sum of the charges, before any minimum commitment or credits. */
  subtotal: number;
  /** `max(subtotal, minimumCommit) - credits`. */
  total: number;
  /** Floor for the amount charged, in dollars. */
  minimumCommit?: number;
  creditGrants?: UsageCreditGrant[];
  checkoutUrl?: string;
  receiptUrl?: string;
  memo?: string;
  createdAt: string;
  lastModified: string;
  submittedAt?: string;
  scheduledAt?: string;
  paidAt?: string;
};

type UsageApiResponse = {
  customer_id: string;
  payer_id?: string;
  plan_id: string;
  plan_name: string;
  status: string;
  starting_on: string;
  ending_before: string;
  charges?: Array<{
    id: string;
    name: string;
    unit: string;
    quantity: number;
    charged_quantity: number;
    total: number;
    minimum_quantity?: number;
    tiers?: Array<{
      name: string;
      starting_after: number;
      quantity: number;
      price: number;
      subtotal: number;
    }>;
  }> | null;
  subtotal: number;
  total: number;
  minimum_commit?: number;
  credit_grants?: Array<{ name: string; amount: number }> | null;
  checkout_url?: string;
  receipt_url?: string;
  memo?: string;
  created_at: string;
  last_modified: string;
  submitted_at?: string;
  scheduled_at?: string;
  paid_at?: string;
};

const MONTH_FORMAT = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The gateway sends Go's zero time for a state the invoice has not reached. */
function timestamp(value: string | undefined): string | undefined {
  return value && !value.startsWith('0001-01-01') ? value : undefined;
}

/**
 * Fetch the organization's usage and charges for a billing month — the data
 * behind the console's Usage page. Requires a session token.
 */
export async function getUsage(
  options?: GetUsageOptions
): Promise<TigrisIAMResponse<UsageResponse, Error>> {
  const month = options?.month ?? new Date().toISOString().slice(0, 7);
  if (!MONTH_FORMAT.test(month)) {
    return {
      error: new Error(`Month must be in YYYY-MM format, got "${month}"`),
    };
  }

  const { data: client, error } = createIAMClient(options?.config, true);

  if (error) {
    return { error };
  }

  try {
    const response = await client.request<unknown, UsageApiResponse>({
      method: 'GET',
      path: IAM_ENDPOINTS.usage,
      query: { month },
    });

    if (response.error) {
      return { error: response.error };
    }

    const invoice = response.data;

    return {
      data: {
        customerId: invoice.customer_id,
        payerId: invoice.payer_id,
        planId: invoice.plan_id,
        planName: invoice.plan_name,
        status: invoice.status,
        startingOn: invoice.starting_on,
        endingBefore: invoice.ending_before,
        charges: (invoice.charges ?? []).map((charge) => ({
          id: charge.id,
          name: charge.name,
          unit: charge.unit,
          quantity: charge.quantity,
          chargedQuantity: charge.charged_quantity,
          total: charge.total,
          minimumQuantity: charge.minimum_quantity,
          tiers: (charge.tiers ?? []).map((tier) => ({
            name: tier.name,
            startingAfter: tier.starting_after,
            quantity: tier.quantity,
            price: tier.price,
            subtotal: tier.subtotal,
          })),
        })),
        subtotal: invoice.subtotal,
        total: invoice.total,
        minimumCommit: invoice.minimum_commit,
        creditGrants: invoice.credit_grants ?? undefined,
        checkoutUrl: invoice.checkout_url,
        receiptUrl: invoice.receipt_url,
        memo: invoice.memo,
        createdAt: invoice.created_at,
        lastModified: invoice.last_modified,
        submittedAt: timestamp(invoice.submitted_at),
        scheduledAt: timestamp(invoice.scheduled_at),
        paidAt: timestamp(invoice.paid_at),
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
