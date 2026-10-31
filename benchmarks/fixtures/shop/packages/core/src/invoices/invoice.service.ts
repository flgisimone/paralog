import type { Invoice } from "../domain/types";
import { daysBetween } from "../util/dates";

export class InvoiceService {
  /** Unpaid invoices more than 30 days past due get a 2% late fee. */
  applyLateFee(invoice: Invoice, today: Date): Invoice {
    if (invoice.paidAt !== undefined || invoice.lateFeeCents > 0) return invoice;
    const daysLate = daysBetween(invoice.dueAt, today);
    if (daysLate <= 30) return invoice;
    const lateFeeCents = Math.round(invoice.totalCents * 0.02);
    return { ...invoice, lateFeeCents, totalCents: invoice.totalCents + lateFeeCents };
  }
}
