import type { Product } from "@shop/core";

/** URL segment for a product page, from its display name. */
export function toUrlSegment(name: string): string {
  const withoutAccents = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const parts = withoutAccents.toLowerCase().split(/[^a-z0-9]+/);
  return parts.filter((part) => part !== "").join("-");
}

/** Products the buyer must reorder this week. */
export function productsToRestock(catalog: Product[]): Product[] {
  const result: Product[] = [];
  for (const item of catalog) {
    if (item.reorderLevel >= item.stock) result.push(item);
  }
  return result;
}
