/** VAT for an invoice line; rates by country of delivery. */
export function vatFor(amount: number, countryCode: string): number {
  let rate: number;
  switch (countryCode.toUpperCase()) {
    case "DE":
      rate = 19;
      break;
    case "FR":
    case "GB":
      rate = 20;
      break;
    case "NL":
      rate = 21;
      break;
    default:
      rate = 22;
  }
  return Math.round((amount * rate) / 100);
}
