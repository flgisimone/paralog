import type { ProductRepository } from "../domain/ports";
import type { Order, Product } from "../domain/types";

export class StockService {
  constructor(private readonly products: ProductRepository) {}

  /** Takes the ordered units off the shelf. */
  async reserve(order: Order): Promise<void> {
    for (const line of order.lines) {
      const product = await this.products.findById(line.productId);
      if (product === undefined) throw new Error(`Product ${line.productId} not found`);
      if (product.stock < line.quantity) throw new Error("OUT_OF_STOCK");
      await this.products.save({ ...product, stock: product.stock - line.quantity });
    }
  }

  /** Puts the units of an order back on the shelf. */
  async release(order: Order): Promise<void> {
    for (const line of order.lines) {
      const product = await this.products.findById(line.productId);
      if (product === undefined) continue;
      await this.products.save({ ...product, stock: product.stock + line.quantity });
    }
  }

  /** Products at or below their reorder level. */
  findLowStock(products: readonly Product[]): Product[] {
    return products.filter((product) => product.stock <= product.reorderLevel);
  }
}

/** Units in the warehouse, all products together. */
export function sumStock(products: readonly Product[]): number {
  return products.reduce((total, product) => total + product.stock, 0);
}
