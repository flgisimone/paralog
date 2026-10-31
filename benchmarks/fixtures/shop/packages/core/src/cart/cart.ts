import type { Cart } from "../domain/types";

/** Amount of the cart before discounts, taxes and shipping. */
export function cartTotal(cart: Cart): number {
  return cart.lines.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0);
}

export function addToCart(cart: Cart, productId: string, unitPriceCents: number, quantity = 1): Cart {
  const existing = cart.lines.find((line) => line.productId === productId);
  const lines = existing
    ? cart.lines.map((line) => (line.productId === productId ? { ...line, quantity: line.quantity + quantity } : line))
    : [...cart.lines, { productId, quantity, unitPriceCents }];
  return { ...cart, lines };
}
