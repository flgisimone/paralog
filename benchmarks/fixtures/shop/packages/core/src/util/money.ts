/** Price shown to customers: 1234 cents in EUR → "€12.34". */
export function formatPrice(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(cents / 100);
}

/** Rounds a fractional amount of cents (after percentages) to whole cents. */
export function roundToCents(amountCents: number): number {
  return Math.round(amountCents);
}

/** Cash rounding for Swiss shops: totals end in 0 or 5 cents. */
export function roundToNearest5Cents(amountCents: number): number {
  return Math.round(amountCents / 5) * 5;
}
