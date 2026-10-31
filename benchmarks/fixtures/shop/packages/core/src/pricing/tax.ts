const VAT_RATES: Record<string, number> = { IT: 0.22, DE: 0.19, FR: 0.2, NL: 0.21, GB: 0.2 };

/** VAT owed on a net amount, by destination country (Italian rate when unknown). */
export function calculateTax(netCents: number, country: string): number {
  const rate = VAT_RATES[country.toUpperCase()] ?? 0.22;
  return Math.round(netCents * rate);
}
