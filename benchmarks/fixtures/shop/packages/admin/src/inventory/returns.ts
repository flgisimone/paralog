import type { Order, ProductRepository } from "@shop/core";

/** Items of a returned or cancelled order go back into the warehouse count. */
export async function returnItemsToInventory(order: Order, productRepository: ProductRepository): Promise<number> {
  let restocked = 0;
  for (const { productId, quantity } of order.lines) {
    const product = await productRepository.findById(productId);
    if (!product) continue;
    product.stock += quantity;
    await productRepository.save(product);
    restocked += quantity;
  }
  return restocked;
}
