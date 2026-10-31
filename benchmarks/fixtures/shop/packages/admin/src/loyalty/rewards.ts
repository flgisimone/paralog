import type { LoyaltyTier, Order } from "@shop/core";

/** Points shown in the customer card of the back office. */
export function computeRewardPoints(order: Order, tier: LoyaltyTier): number {
  if (["cancelled", "refunded"].includes(order.status)) return 0;
  let cents = 0;
  for (const line of order.lines) cents += line.unitPriceCents * line.quantity;
  const factor = tier === "gold" ? 2 : tier === "silver" ? 1.5 : 1;
  return Math.floor(Math.floor(cents / 100) * factor);
}
