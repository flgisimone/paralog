import type { Order, User } from "@shop/core";

export function activeCustomerCount(people: User[]): number {
  let count = 0;
  for (const person of people) {
    if (person.role !== "customer") continue;
    if (person.status === "active") count++;
  }
  return count;
}

export function ordersPerCustomer(orders: Order[]): Record<string, Order[]> {
  const result: Record<string, Order[]> = {};
  for (const order of orders) {
    if (!(order.customerId in result)) result[order.customerId] = [];
    result[order.customerId]!.push(order);
  }
  return result;
}
