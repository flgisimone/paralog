export type UserStatus = "active" | "inactive" | "suspended";
export type UserRole = "customer" | "admin" | "support";
export type LoyaltyTier = "bronze" | "silver" | "gold";

export interface Address {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  phone?: string;
  status: UserStatus;
  role: UserRole;
  tier: LoyaltyTier;
  addresses: Address[];
  createdAt: Date;
  deactivatedAt?: Date;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  priceCents: number;
  weightGrams: number;
  stock: number;
  reorderLevel: number;
  category: string;
}

export interface OrderLine {
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export type OrderStatus = "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "refunded";

export interface Order {
  id: string;
  customerId: string;
  lines: OrderLine[];
  status: OrderStatus;
  createdAt: Date;
  shippedAt?: Date;
  paymentId?: string;
  shippingAddress: Address;
}

export interface Cart {
  customerId: string;
  lines: OrderLine[];
  couponCode?: string;
}

export interface Coupon {
  code: string;
  percentOff: number;
  validFrom: Date;
  validUntil: Date;
  maxUses: number;
  uses: number;
  minSubtotalCents: number;
}

export interface InvoiceLine {
  description: string;
  amountCents: number;
}

export interface Invoice {
  id: string;
  number: string;
  orderId: string;
  customerId: string;
  lines: InvoiceLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  issuedAt: Date;
  dueAt: Date;
  paidAt?: Date;
  lateFeeCents: number;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  revoked: boolean;
}
