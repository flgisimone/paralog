import type { SessionStore } from "../domain/ports";
import type { Session } from "../domain/types";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class SessionManager {
  constructor(private readonly store: SessionStore) {}

  /** A session ends after 30 idle minutes or 24 hours in total, whichever comes first. */
  isExpired(session: Session, now: Date): boolean {
    if (session.revoked) return true;
    if (now.getTime() - session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS) return true;
    return now.getTime() - session.createdAt.getTime() > MAX_AGE_MS;
  }

  async revokeAll(userId: string): Promise<void> {
    for (const session of await this.store.findByUser(userId)) await this.store.revoke(session.id);
  }
}
