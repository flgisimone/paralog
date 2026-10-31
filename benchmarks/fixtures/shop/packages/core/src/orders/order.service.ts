import type { Clock, Mailer, OrderRepository, PaymentGateway, UserRepository } from "../domain/ports";
import type { Order, OrderStatus } from "../domain/types";
import { StockService } from "../inventory/stock.service";

export class OrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly payments: PaymentGateway,
    private readonly stock: StockService,
    private readonly users: UserRepository,
    private readonly mailer: Mailer,
    private readonly clock: Clock,
  ) {}

  /** Orders can be cancelled until they leave the warehouse. */
  canBeCancelled(order: Order): boolean {
    return (order.status === "pending" || order.status === "paid") && order.shippedAt === undefined;
  }

  async updateStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (order === undefined) throw new Error(`Order ${orderId} not found`);
    const updated: Order = { ...order, status, shippedAt: status === "shipped" ? this.clock.now() : order.shippedAt };
    await this.orders.save(updated);
    return updated;
  }

  /** Cancels an order: refund what was paid, put the items back on the shelf, tell the customer. */
  async cancel(orderId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (order === undefined) throw new Error(`Order ${orderId} not found`);
    if (!this.canBeCancelled(order)) throw new Error("ORDER_NOT_CANCELLABLE");
    if (order.status === "paid" && order.paymentId !== undefined) {
      const amount = order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
      await this.payments.refund(order.paymentId, amount);
    }
    await this.stock.release(order);
    const cancelled: Order = { ...order, status: "cancelled" };
    await this.orders.save(cancelled);
    const customer = await this.users.findById(order.customerId);
    if (customer !== undefined) {
      await this.mailer.send(customer.email, `Order ${order.id} cancelled`, "Your order has been cancelled.");
    }
    return cancelled;
  }
}
