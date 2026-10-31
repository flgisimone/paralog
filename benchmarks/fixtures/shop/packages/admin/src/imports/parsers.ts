import type { OrderLine, Product } from "@shop/core";

/** order_id;product_id;quantity;unit_price_cents */
export function parseOrderCsvRow(row: string): { orderId: string; line: OrderLine } {
  const [orderId, productId, quantity, unitPrice] = row.split(";").map((cell) => cell.trim());
  if (!orderId || !productId || !quantity || !unitPrice) throw new Error(`Invalid order row: ${row}`);
  return { orderId, line: { productId, quantity: Number(quantity), unitPriceCents: Number(unitPrice) } };
}

/** sku;name;price_cents;weight_grams */
export function parseProductCsvRow(row: string): Pick<Product, "sku" | "name" | "priceCents" | "weightGrams"> {
  const [sku, name, price, weight] = row.split(";").map((cell) => cell.trim());
  if (!sku || !name || !price || !weight) throw new Error(`Invalid product row: ${row}`);
  return { sku, name, priceCents: Number(price), weightGrams: Number(weight) };
}
