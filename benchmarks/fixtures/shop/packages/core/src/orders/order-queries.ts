import type { Order } from "../domain/types";

/** Orders of each customer, keeping the original order. */
export function groupOrdersByCustomer(orders: readonly Order[]): Map<string, Order[]> {
  return orders.reduce((groups, order) => {
    const list = groups.get(order.customerId) ?? [];
    list.push(order);
    groups.set(order.customerId, list);
    return groups;
  }, new Map<string, Order[]>());
}
