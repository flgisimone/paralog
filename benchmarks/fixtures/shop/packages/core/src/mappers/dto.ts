import type { Order, User } from "../domain/types";

export interface UserDto {
  id: string;
  name: string;
  email: string;
  status: string;
}

export interface OrderDto {
  id: string;
  status: string;
  itemCount: number;
  createdAt: string;
}

export function toUserDto(user: User): UserDto {
  return { id: user.id, name: user.name, email: user.email, status: user.status };
}

export function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    status: order.status,
    itemCount: order.lines.reduce((n, l) => n + l.quantity, 0),
    createdAt: order.createdAt.toISOString(),
  };
}
