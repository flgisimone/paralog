import type { Coupon, User } from "@shop/core";

/** Marketing preview of a coupon before it is sent. */
export function couponIsUsable(c: Coupon, orderSubtotal: number, at: Date = new Date()): boolean {
  const started = at.getTime() >= c.validFrom.getTime();
  const notExpired = at.getTime() <= c.validUntil.getTime();
  const hasUsesLeft = c.maxUses - c.uses > 0;
  return started && notExpired && hasUsesLeft && orderSubtotal >= c.minSubtotalCents;
}

/** Step 1 of the volume promotion: who qualifies. */
export function isEligibleForVolumeDiscount(customer: User, orderSubtotalCents: number): boolean {
  return customer.status === "active" && customer.tier === "gold" && orderSubtotalCents >= 100_00;
}

/** Step 2 of the volume promotion: how much they save. */
export function volumeDiscountAmount(orderSubtotalCents: number): number {
  return Math.round(orderSubtotalCents / 10);
}
