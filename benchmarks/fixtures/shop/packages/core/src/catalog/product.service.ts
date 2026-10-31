import type { ProductRepository } from "../domain/ports";
import type { Product } from "../domain/types";

export class ProductNotFoundError extends Error {
  constructor(id: string) {
    super(`Product ${id} not found`);
  }
}

export class ProductService {
  constructor(private readonly products: ProductRepository) {}

  async getProductById(id: string): Promise<Product> {
    const product = await this.products.findById(id);
    if (product === undefined) throw new ProductNotFoundError(id);
    return product;
  }
}
