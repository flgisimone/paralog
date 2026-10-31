import type { LoyaltyTier, Order } from "../domain/types";

const MULTIPLIERS: Record<LoyaltyTier, number> = { bronze: 1, silver: 1.5, gold: 2 };

export class LoyaltyService {
  /** One point per whole euro spent, multiplied by the tier; nothing for cancelled or refunded orders. */
  pointsFor(order: Order, tier: LoyaltyTier): number {
    if (order.status === "cancelled" || order.status === "refunded") return 0;
    const euros = Math.floor(order.lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0) / 100);
    return Math.floor(euros * MULTIPLIERS[tier]);
  }
}
