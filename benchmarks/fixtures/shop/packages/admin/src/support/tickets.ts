export interface Ticket {
  id: string;
  openedAt: Date;
  closedAt?: Date;
  cardNumber?: string;
}

const DAY = 86_400_000;

/** Age of a ticket in days, counting calendar days. */
export function diffInDays(start: Date, end: Date): number {
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.round((endDay - startDay) / DAY);
}

/** Card numbers pasted in tickets are hidden before they are stored. */
export function hideCardDigits(pan: string): string {
  const numbers = pan.replace(/\D/g, "");
  return "**** **** **** " + numbers.slice(-4);
}
