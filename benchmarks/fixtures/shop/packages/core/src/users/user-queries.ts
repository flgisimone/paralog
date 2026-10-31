import type { User } from "../domain/types";

/** Customers who can log in today. */
export function countActiveUsers(users: readonly User[]): number {
  return users.filter((user) => user.status === "active" && user.role === "customer").length;
}

export function isAdmin(user: User): boolean {
  return user.role === "admin" && user.status !== "suspended";
}

export function isActive(user: User): boolean {
  return user.status === "active" && user.deactivatedAt === undefined;
}
