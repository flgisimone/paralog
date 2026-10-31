import type { Invoice, Order, Product, Session, User } from "./types";

export interface UserRepository {
  findById(id: string): Promise<User | undefined>;
  save(user: User): Promise<void>;
}

export interface OrderRepository {
  findById(id: string): Promise<Order | undefined>;
  findByCustomer(customerId: string): Promise<Order[]>;
  save(order: Order): Promise<void>;
}

export interface ProductRepository {
  findById(id: string): Promise<Product | undefined>;
  save(product: Product): Promise<void>;
}

export interface InvoiceRepository {
  nextSequence(year: number): Promise<number>;
  save(invoice: Invoice): Promise<void>;
}

export interface SessionStore {
  findByUser(userId: string): Promise<Session[]>;
  revoke(sessionId: string): Promise<void>;
}

export interface Mailer {
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface SmsGateway {
  sendText(phone: string, text: string): Promise<void>;
}

export interface PaymentGateway {
  charge(token: string, amountCents: number): Promise<string>;
  refund(paymentId: string, amountCents: number): Promise<void>;
}

export interface Clock {
  now(): Date;
}
