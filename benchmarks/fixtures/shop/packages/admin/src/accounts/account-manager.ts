import type { Clock, Mailer, SessionStore, User, UserRepository } from "@shop/core";

/** Back-office actions on customer accounts. */
export class AccountManager {
  constructor(
    private readonly repository: UserRepository,
    private readonly sessionStore: SessionStore,
    private readonly mail: Mailer,
    private readonly clock: Clock,
  ) {}

  async closeAccount(customerId: string, closedBy: string): Promise<void> {
    const customer = await this.repository.findById(customerId);
    if (!customer) throw new Error(`Customer ${customerId} does not exist`);
    if (customer.status !== "inactive") {
      const sessions = await this.sessionStore.findByUser(customer.id);
      await Promise.all(sessions.map((s) => this.sessionStore.revoke(s.id)));
      const closed: User = Object.assign({}, customer, { status: "inactive" as const, deactivatedAt: this.clock.now() });
      await this.repository.save(closed);
      await this.mail.send(
        customer.email,
        "Your account has been closed",
        `Account closed by our support team (${closedBy}).`,
      );
    }
  }
}
