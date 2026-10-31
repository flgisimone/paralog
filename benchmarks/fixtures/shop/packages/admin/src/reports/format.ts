const currencyFormatters = new Map<string, Intl.NumberFormat>();

/** Amounts in report cells. */
export function renderAmount(amountInCents: number, currencyCode: string = "EUR"): string {
  let formatter = currencyFormatters.get(currencyCode);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-IE", { style: "currency", currency: currencyCode });
    currencyFormatters.set(currencyCode, formatter);
  }
  return formatter.format(amountInCents / 100);
}
