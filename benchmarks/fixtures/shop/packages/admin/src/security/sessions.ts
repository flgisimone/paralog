import type { Session } from "@shop/core";

const MINUTE = 60_000;

/** Step 1 of the admin session sweep: idle for more than half an hour. */
export function isIdleTimeout(session: Session, now: Date): boolean {
  return (now.getTime() - session.lastSeenAt.getTime()) / MINUTE > 30;
}

/** Step 2 of the admin session sweep: older than a day or revoked. */
export function isPastMaxAge(session: Session, now: Date): boolean {
  return session.revoked || now.getTime() - session.createdAt.getTime() > 24 * 60 * MINUTE;
}
