import type { Invoice, InvoiceLine, Order, User } from "@shop/core";
import { vatFor } from "./tax";
import { diffInDays } from "../support/tickets";

/** Manual invoicing from the back office. */
export function createInvoiceFromOrder(order: Order, customer: User, progressive: number, date: Date): Invoice {
  const lines: InvoiceLine[] = [];
  let net = 0;
  for (const item of order.lines) {
    const amountCents = item.unitPriceCents * item.quantity;
    lines.push({ description: `${item.quantity} x ${item.productId}`, amountCents });
    net += amountCents;
  }
  const vat = vatFor(net, order.shippingAddress.country);
  const due = new Date(date.getTime());
  due.setUTCDate(due.getUTCDate() + 30);
  return {
    id: `${order.id}-invoice`,
    number: "INV-" + date.getUTCFullYear() + "-" + progressive.toString().padStart(6, "0"),
    orderId: order.id,
    customerId: customer.id,
    lines,
    subtotalCents: net,
    taxCents: vat,
    totalCents: net + vat,
    issuedAt: date,
    dueAt: due,
    lateFeeCents: 0,
  };
}

/** Step 1 of the dunning run: is the invoice late enough to be charged? */
export function isOverdue(invoice: Invoice, today: Date): boolean {
  return !invoice.paidAt && invoice.lateFeeCents === 0 && diffInDays(invoice.dueAt, today) > 30;
}

/** Step 2 of the dunning run: the fee added to an overdue invoice. */
export function lateFeeFor(totalCents: number): number {
  return Math.round((totalCents * 2) / 100);
}
