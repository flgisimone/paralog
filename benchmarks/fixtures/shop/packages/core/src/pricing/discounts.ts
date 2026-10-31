import type { Coupon, User } from "../domain/types";

/** A coupon applies inside its validity window, while uses remain and above its minimum subtotal. */
export function isCouponValid(coupon: Coupon, now: Date, subtotalCents: number): boolean {
  if (now < coupon.validFrom) return false;
  if (now > coupon.validUntil) return false;
  if (coupon.uses >= coupon.maxUses) return false;
  return subtotalCents >= coupon.minSubtotalCents;
}

/** Gold customers get 10% off orders of €100 or more. */
export function volumeDiscount(subtotalCents: number, customer: User): number {
  if (customer.tier !== "gold" || customer.status !== "active") return 0;
  if (subtotalCents < 10000) return 0;
  return Math.round(subtotalCents * 0.1);
}
