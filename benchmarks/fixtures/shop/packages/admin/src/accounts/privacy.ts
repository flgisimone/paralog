import type { User, UserRepository } from "@shop/core";

/** Step 1 of a data-erasure request: overwrite every personal field. */
export function scrubPersonalData(customer: User, erasedAt: Date): User {
  return {
    ...customer,
    name: "Deleted user",
    email: `deleted-${customer.id}@invalid.example`,
    username: `deleted_${customer.id}`,
    phone: undefined,
    status: "inactive",
    deactivatedAt: customer.deactivatedAt ?? erasedAt,
  };
}

/** Step 2 of a data-erasure request: drop the stored addresses and persist. */
export async function deleteUserAddresses(customer: User, repository: UserRepository): Promise<void> {
  customer.addresses.length = 0;
  await repository.save(customer);
}
