import { getOAuthIAMConfig } from '@auth/iam.js';
import {
  getUsage,
  type UsageCharge,
  type UsageResponse,
} from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import {
  formatJson,
  formatTable,
  formatXml,
  formatXmlObject,
  type TableColumn,
} from '@utils/format.js';
import {
  msg,
  printEmpty,
  printHint,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('usage');

// The console's own formatters, so the two views agree.
const quantityFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});
const amountFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** Short unit labels: "826 Requests", "43.7 GiB-Month". */
const UNIT_LABELS: Record<string, string> = {
  'Number of Requests': 'Requests',
  'Number of events published': 'Events',
};

type Row = { type: string; used: string; billed: string; amount: string };

const columns: TableColumn[] = [
  { key: 'type', header: 'Type' },
  { key: 'used', header: 'Used', align: 'right' },
  { key: 'billed', header: 'Billed', align: 'right' },
  { key: 'amount', header: 'Amount', align: 'right' },
];

function quantity(value: number, charge: UsageCharge): string {
  return `${quantityFormat.format(value)} ${UNIT_LABELS[charge.unit] ?? charge.unit}`;
}

function monthLabel(usage: UsageResponse): string {
  return new Date(usage.startingOn).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The invoice amounts in the console's order. The commitment is a floor,
 * total = max(subtotal, minimumCommit) - credits, which the note printed
 * under the table spells out.
 */
function footerRows(usage: UsageResponse): Row[] {
  const rows: Row[] = [];
  if (usage.minimumCommit) {
    rows.push({
      type: 'Minimum Commitment',
      used: '',
      billed: '',
      amount: amountFormat.format(usage.minimumCommit),
    });
  }
  rows.push({
    type: 'Subtotal',
    used: '',
    billed: '',
    amount: amountFormat.format(usage.subtotal),
  });
  for (const grant of usage.creditGrants ?? []) {
    rows.push({
      type: grant.name,
      used: '',
      billed: '',
      amount: `-${amountFormat.format(grant.amount)}`,
    });
  }
  rows.push({
    type: 'Total',
    used: '',
    billed: '',
    amount: amountFormat.format(usage.total),
  });
  return rows;
}

/** Charges as raw values, then the invoice-level amounts. */
function usageXml(charges: UsageCharge[], usage: UsageResponse): string {
  const nested = (block: string) => `  ${block.replace(/\n/g, '\n  ')}`;
  const lines = ['<usage>'];
  lines.push(
    nested(
      formatXml(
        charges.map((charge) => ({
          id: charge.id,
          type: charge.name,
          unit: charge.unit,
          used: charge.quantity,
          billed: charge.chargedQuantity,
          amount: charge.total,
        })),
        'charges',
        'charge'
      )
    )
  );
  const totals: Record<string, unknown> = { subtotal: usage.subtotal };
  if (usage.minimumCommit) totals.minimumCommit = usage.minimumCommit;
  lines.push(formatXmlObject(totals, '  '));
  if (usage.creditGrants?.length) {
    lines.push(nested(formatXml(usage.creditGrants, 'credits', 'credit')));
  }
  lines.push(formatXmlObject({ total: usage.total }, '  '));
  lines.push('</usage>');
  return lines.join('\n');
}

export default async function usage(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const month = getOption<string>(options, ['month']);
  const all = getOption<boolean>(options, ['all']) ?? false;

  const config = await getOAuthIAMConfig(context);

  const { data, error } = await getUsage({ month, config });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(formatJson(data));
    return;
  }

  const charges = all
    ? data.charges
    : data.charges.filter((charge) => charge.quantity > 0 || charge.total > 0);

  const url = data.checkoutUrl ?? data.receiptUrl;
  // A commitment or credit can leave an amount owed with nothing metered.
  const settles =
    data.total !== 0 ||
    Boolean(data.minimumCommit) ||
    (data.creditGrants?.length ?? 0) > 0 ||
    Boolean(url);

  if (charges.length === 0 && !settles) {
    printEmpty(context, { month: monthLabel(data) });
    return;
  }

  if (format === 'xml') {
    console.log(usageXml(charges, data));
  } else {
    const rows: Row[] = charges.map((charge) => ({
      type: charge.name,
      used: quantity(charge.quantity, charge),
      billed: quantity(charge.chargedQuantity, charge),
      amount: amountFormat.format(charge.total),
    }));
    // ending_before is the exclusive end of the period: the last refresh.
    console.log(
      `${monthLabel(data)} · ${data.planName} · as of ${data.endingBefore.slice(0, 10)}`
    );
    console.log(formatTable(rows, columns, footerRows(data)));
    if (data.minimumCommit) {
      console.log(
        `Minimum commitment: your plan bills at least ${amountFormat.format(data.minimumCommit)} a month, before credits.`
      );
    }
  }

  if (url) {
    printHint(context, {
      action: data.checkoutUrl ? 'Make a payment' : 'View the receipt',
      url,
    });
  }

  printSuccess(context);
}
