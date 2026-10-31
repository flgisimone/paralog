import type { PaymentGateway } from "../domain/ports";

export interface PaymentMethod {
  charge(amountCents: number): Promise<string>;
}

export class CardPayment implements PaymentMethod {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly cardToken: string,
  ) {}

  async charge(amountCents: number): Promise<string> {
    if (amountCents <= 0) throw new Error("Amount must be positive");
    return this.gateway.charge(`card:${this.cardToken}`, amountCents);
  }
}

export class PaypalPayment implements PaymentMethod {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly payerId: string,
  ) {}

  async charge(amountCents: number): Promise<string> {
    if (amountCents <= 0) throw new Error("Amount must be positive");
    return this.gateway.charge(`paypal:${this.payerId}`, amountCents);
  }
}
