const FREE_SHIPPING_THRESHOLD_CENTS = 5000;

/** Shipping price from parcel weight and destination; free in Italy above €50. */
export class ShippingCalculator {
  quote(weightGrams: number, subtotalCents: number, country: string): number {
    const domestic = country.toUpperCase() === "IT";
    if (domestic && subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS) return 0;
    let price: number;
    if (weightGrams <= 1000) price = 490;
    else if (weightGrams <= 5000) price = 890;
    else price = 1490;
    return domestic ? price : price + 1000;
  }
}
