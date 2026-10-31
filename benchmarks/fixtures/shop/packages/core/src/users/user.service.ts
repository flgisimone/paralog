import type { Clock, Mailer, SessionStore, UserRepository } from "../domain/ports";
import type { User } from "../domain/types";

export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User ${id} not found`);
  }
}

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionStore,
    private readonly mailer: Mailer,
    private readonly clock: Clock,
  ) {}

  async getUserById(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (user === undefined) throw new UserNotFoundError(id);
    return user;
  }

  /** Re-enables a deactivated account and welcomes the user back. */
  async activate(userId: string): Promise<User> {
    const user = await this.getUserById(userId);
    if (user.status === "active") return user;
    const updated: User = { ...user, status: "active", deactivatedAt: undefined };
    await this.users.save(updated);
    await this.mailer.send(user.email, "Welcome back", "Your account is active again.");
    return updated;
  }

  /** Closes an account: no more logins, sessions revoked, user informed. */
  async deactivate(userId: string): Promise<User> {
    const user = await this.getUserById(userId);
    if (user.status === "inactive") return user;
    const updated: User = { ...user, status: "inactive", deactivatedAt: this.clock.now() };
    await this.users.save(updated);
    for (const session of await this.sessions.findByUser(userId)) {
      await this.sessions.revoke(session.id);
    }
    await this.mailer.send(user.email, "Your account has been closed", "We are sorry to see you go.");
    return updated;
  }

  /** GDPR erasure: personal data replaced, addresses removed, account closed. */
  async anonymize(userId: string): Promise<void> {
    const user = await this.getUserById(userId);
    const anonymous: User = {
      ...user,
      email: `deleted-${user.id}@invalid.example`,
      name: "Deleted user",
      username: `deleted_${user.id}`,
      phone: undefined,
      addresses: [],
      status: "inactive",
      deactivatedAt: user.deactivatedAt ?? this.clock.now(),
    };
    await this.users.save(anonymous);
  }
}
