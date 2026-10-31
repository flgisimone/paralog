import type { Order, Product } from "@shop/core";

const RATES = [
  { upToGrams: 1000, cents: 490 },
  { upToGrams: 5000, cents: 890 },
  { upToGrams: Number.POSITIVE_INFINITY, cents: 1490 },
];

/** Shipping cost shown to agents when they edit an order. */
export function estimateShippingCost(order: Order, catalog: Map<string, Product>): number {
  let grams = 0;
  let subtotal = 0;
  for (const line of order.lines) {
    grams += (catalog.get(line.productId)?.weightGrams ?? 0) * line.quantity;
    subtotal += line.quantity * line.unitPriceCents;
  }
  const isItaly = order.shippingAddress.country.toUpperCase() === "IT";
  if (isItaly && subtotal >= 50_00) return 0;
  const base = RATES.find((rate) => grams <= rate.upToGrams)!.cents;
  return isItaly ? base : base + 1000;
}
