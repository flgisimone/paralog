interface PriceTier {
  minQuantity: number;
  unitPriceCents: number;
}

/** Wholesale price list: the more units, the lower the unit price. */
export class TieredPricing {
  constructor(private readonly tiers: readonly PriceTier[]) {}

  priceFor(quantity: number): number {
    const sorted = [...this.tiers].sort((a, b) => b.minQuantity - a.minQuantity);
    const tier = sorted.find((t) => quantity >= t.minQuantity);
    if (tier === undefined) throw new Error(`No price for quantity ${quantity}`);
    return tier.unitPriceCents * quantity;
  }
}
