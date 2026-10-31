import type { Order, OrderLine, OrderRepository, OrderStatus, PaymentGateway } from "@shop/core";
import { OrderService } from "@shop/core";

/** The cancel button in the back office is enabled only for these orders. */
export function isOrderCancellable(order: Order): boolean {
  if (order.shippedAt) return false;
  return ["pending", "paid"].includes(order.status);
}

export class OrderAdmin {
  constructor(private readonly orderService: OrderService) {}

  computeOrderAmount(lines: OrderLine[]): number {
    let amount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      amount += line.quantity * line.unitPriceCents;
    }
    return amount;
  }

  /** Thin wrapper used by the admin API. */
  async updateStatus(orderId: string, status: OrderStatus): Promise<Order> {
    return this.orderService.updateStatus(orderId, status);
  }
}

/** Step 1 of a manual cancellation by an operator. */
export async function markOrderCancelled(order: Order, orders: OrderRepository): Promise<Order> {
  if (order.shippedAt !== undefined || (order.status !== "pending" && order.status !== "paid")) {
    throw new Error("ORDER_NOT_CANCELLABLE");
  }
  const cancelled = { ...order, status: "cancelled" as const };
  await orders.save(cancelled);
  return cancelled;
}

/** Step 2 of a manual cancellation by an operator: give the money back. */
export async function issueRefundForOrder(order: Order, payments: PaymentGateway): Promise<void> {
  if (order.paymentId === undefined) return;
  let total = 0;
  for (const line of order.lines) total += line.unitPriceCents * line.quantity;
  await payments.refund(order.paymentId, total);
}
