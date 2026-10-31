import type { Invoice, Order, User } from "../domain/types";
import { calculateTax } from "../pricing/tax";
import { addDays } from "../util/dates";

const PAYMENT_TERMS_DAYS = 30;

/** Turns a paid order into an invoice with a yearly sequential number. */
export class InvoiceBuilder {
  build(order: Order, customer: User, sequence: number, issuedAt: Date): Invoice {
    const lines = order.lines.map((line) => ({
      description: `${line.quantity} x ${line.productId}`,
      amountCents: line.quantity * line.unitPriceCents,
    }));
    const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
    const taxCents = calculateTax(subtotalCents, order.shippingAddress.country);
    return {
      id: `${order.id}-invoice`,
      number: `INV-${issuedAt.getUTCFullYear()}-${String(sequence).padStart(6, "0")}`,
      orderId: order.id,
      customerId: customer.id,
      lines,
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      issuedAt,
      dueAt: addDays(issuedAt, PAYMENT_TERMS_DAYS),
      lateFeeCents: 0,
    };
  }
}
