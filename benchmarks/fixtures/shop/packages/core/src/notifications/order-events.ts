import type { Order, User } from "../domain/types";
import type { Notifier } from "./notifiers";

export async function onOrderPaid(order: Order, customer: User, notifier: Notifier): Promise<void> {
  await notifier.send(customer, `Payment received for order ${order.id}`, "We are preparing your parcel.");
}

export async function onOrderShipped(order: Order, customer: User, notifier: Notifier): Promise<void> {
  await notifier.send(customer, `Order ${order.id} is on its way`, "Track it from your account page.");
}
