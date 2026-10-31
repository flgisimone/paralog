import { describe, expect, it } from "vitest";
import { extractUnits, type CodeUnit } from "../src/extract.js";
import { STRICT_TSCONFIG, writeRepo } from "./helpers.js";

const USER = `export interface User { id: string; status: "active" | "inactive"; email: string; plan: Plan }
export interface Plan { name: string; seats: number }
export interface Repo { save(user: User): Promise<void> }
export interface PaymentMethod { charge(amount: number): Promise<string> }
export abstract class Exporter { abstract export(rows: string[]): string }
`;

function extract(files: Record<string, string>): CodeUnit[] {
  const root = writeRepo({ "tsconfig.json": STRICT_TSCONFIG, "src/model.ts": USER, ...files });
  return [...extractUnits({ root }).units];
}

function unit(units: readonly CodeUnit[], id: string): CodeUnit {
  const found = units.find((u) => u.id === id);
  if (found === undefined) throw new Error(`unit ${id} not found among:\n${units.map((u) => u.id).join("\n")}`);
  return found;
}

describe("extractUnits: which units", () => {
  it("extracts functions, methods, accessors, constructors and named arrow functions with stable ids", () => {
    const units = extract({
      "src/users.ts": `import type { User, Repo } from "./model.js";
export class UserService {
  constructor(private readonly repo: Repo) {}
  async deactivate(user: User): Promise<void> { await this.repo.save({ ...user, status: "inactive" }); }
  static create(repo: Repo): UserService { return new UserService(repo); }
  get name(): string { return "users"; }
  set name(value: string) { void value; }
  handle = (user: User): string => user.id;
}
export function isActive(user: User): boolean { return user.status === "active"; }
export const toEmail = (user: User) => user.email;
const legacy = function (user: User) { return user.id; };
export const accounts = { close(user: User) { return legacy(user); }, nested: { open: () => 1 } };
export namespace Billing { export function total(): number { return 3; } }
export default (x: number) => x * 3;
`,
    });
    expect(units.map((u) => u.id)).toEqual([
      "src/users.ts#Billing.total:function",
      "src/users.ts#UserService.constructor:constructor",
      "src/users.ts#UserService.create:method",
      "src/users.ts#UserService.deactivate:method",
      "src/users.ts#UserService.handle:arrow",
      "src/users.ts#UserService.name:getter",
      "src/users.ts#UserService.name:setter",
      "src/users.ts#accounts.close:method",
      "src/users.ts#accounts.nested.open:arrow",
      "src/users.ts#default:arrow",
      "src/users.ts#isActive:function",
      "src/users.ts#legacy:function",
      "src/users.ts#toEmail:arrow",
    ]);
  });

  it("extracts only the implementation of an overloaded function", () => {
    const units = extract({
      "src/parse.ts": `export function parse(v: string): number;
export function parse(v: number): string;
export function parse(v: string | number): string | number { return typeof v === "string" ? Number(v) : String(v); }`,
    });
    expect(units.map((u) => u.id)).toEqual(["src/parse.ts#parse:function"]);
    expect(unit(units, "src/parse.ts#parse:function").startLine).toBe(3);
  });

  it("does not extract nested functions, abstract methods or interface members", () => {
    const units = extract({
      "src/outer.ts": `export function outer(): number { function inner() { return 4; } const arrow = () => inner(); return arrow(); }`,
    });
    expect(units.map((u) => u.id)).toEqual(["src/outer.ts#outer:function"]);
  });

  it("handles generics and static methods", () => {
    const units = extract({
      "src/cache.ts": `export class Cache<T> {
  private items = new Map<string, T>();
  static empty<U>(): Cache<U> { return new Cache<U>(); }
  get<K extends string>(key: K): T | undefined { return this.items.get(key); }
}`,
    });
    expect(unit(units, "src/cache.ts#Cache.empty:method").signature).toBe("empty(): Cache<U>");
    const get = unit(units, "src/cache.ts#Cache.get:method");
    expect(get.signature).toBe("get(key: K): T | undefined");
    expect(get.touchedProperties).toEqual(["Cache.items"]);
    expect(get.calls).toEqual(["Map.get"]);
  });
});

describe("extractUnits: what a unit contains", () => {
  const units = extract({
    "src/users.ts": `import type { User, Repo, Plan } from "./model.js";
import { formatPlan } from "./plans.js";
export class UserService {
  constructor(private readonly repo: Repo) {}
  /** Deactivates the user. */
  async deactivate(user: User, reason?: string): Promise<void> {
    // A comment that must not change anything
    if (user.status === "inactive") throw new Error("USER_ALREADY_INACTIVE");
    const { email, plan: { seats } } = user;
    const next: User = { ...user, status: "inactive" };
    await this.repo.save(next);
    console.log(\`deactivated \${email} after 30 days\`, seats, reason, formatPlan(user.plan));
    [1, 2].map((x) => x * 0);
  }
}
export function describePlan({ name }: Plan): string { return name; }
`,
    "src/plans.ts": `import type { Plan } from "./model.js";
export function formatPlan(plan: Plan): string { return plan.name + "/" + String(plan.seats); }
`,
  });
  const deactivate = unit(units, "src/users.ts#UserService.deactivate:method");

  it("records position, signature and types", () => {
    expect(deactivate).toMatchObject({
      name: "UserService.deactivate",
      kind: "method",
      file: "src/users.ts",
      startLine: 6,
      endLine: 14,
      signature: "deactivate(user: User, reason?: string): Promise<void>",
      paramTypes: ["User", "string"],
      returnType: "Promise<void>",
    });
  });

  it("resolves touched properties to the type that declares them, reads and writes", () => {
    expect(deactivate.touchedProperties).toEqual(["Plan.seats", "User.email", "User.plan", "User.status", "UserService.repo"]);
  });

  it("counts destructured parameters as touched properties", () => {
    expect(unit(units, "src/users.ts#describePlan:function").touchedProperties).toEqual(["Plan.name"]);
  });

  it("resolves calls to project units, interface members and globals", () => {
    expect(deactivate.calls).toEqual(["Array.map", "Console.log", "Error", "src/model.ts#Repo.save", "src/plans.ts#formatPlan:function"]);
  });

  it("keeps non-trivial literals only", () => {
    expect(deactivate.literals).toEqual([
      '" after 30 days"',
      '"USER_ALREADY_INACTIVE"',
      '"deactivated "',
      '"inactive"',
    ]);
    expect(unit(units, "src/plans.ts#formatPlan:function").literals).toEqual([]);
  });

  it("counts statements", () => {
    expect(deactivate.statements).toBe(7);
    expect(unit(units, "src/plans.ts#formatPlan:function").statements).toBe(1);
  });
});

describe("extractUnits: implemented members", () => {
  it("records the interface or abstract member a method implements", () => {
    const units = extract({
      "src/pay.ts": `import { Exporter, type PaymentMethod } from "./model.js";
export class Card implements PaymentMethod { async charge(amount: number) { return "card:" + String(amount); } }
export class Csv extends Exporter { export(rows: string[]) { return rows.join(","); } other() { return 3; } }
export const paypal: PaymentMethod = { charge: async (amount) => "paypal:" + String(amount) };
`,
    });
    expect(unit(units, "src/pay.ts#Card.charge:method").implements).toEqual(["PaymentMethod.charge"]);
    expect(unit(units, "src/pay.ts#Csv.export:method").implements).toEqual(["Exporter.export"]);
    expect(unit(units, "src/pay.ts#Csv.other:method").implements).toEqual([]);
    expect(unit(units, "src/pay.ts#paypal.charge:arrow").implements).toEqual(["PaymentMethod.charge"]);
  });
});

describe("extractUnits: stable ids (F2-04)", () => {
  const original = `import type { User } from "./model.js";
export class UserService {
  isActive(user: User): boolean { return user.status === "active"; }
  email(user: User): string { return user.email; }
}
`;
  const ids = (source: string, path = "src/users.ts"): string[] => extract({ [path]: source }).map((u) => u.id);
  const hash = (source: string): string =>
    unit(extract({ "src/users.ts": source }), "src/users.ts#UserService.isActive:method").bodyHash;

  it("keeps ids when lines move, methods are reordered or bodies change", () => {
    const before = ids(original);
    expect(ids(`\n\n// header\n${original}`)).toEqual(before);
    expect(
      ids(original.replace(/( {2}isActive.*\n)( {2}email.*\n)/, "$2$1")),
    ).toEqual(before);
    expect(ids(original.replace('user.status === "active"', 'user.status !== "inactive"'))).toEqual(before);
  });

  it("changes ids when a unit is renamed or moved to another file", () => {
    expect(ids(original.replace("isActive", "isEnabled"))).toContain("src/users.ts#UserService.isEnabled:method");
    expect(ids(original, "src/accounts.ts")).toContain("src/accounts.ts#UserService.isActive:method");
  });

  it("keeps the body hash across comments and formatting, and changes it with the code", () => {
    const base = hash(original);
    expect(hash(original.replace("{ return user.status", "{\n    // why\n    return   user.status"))).toBe(base);
    expect(hash(`\n\n${original}`)).toBe(base);
    expect(hash(original.replace('"active"', '"enabled"'))).not.toBe(base);
  });
});

describe("extractUnits: noise filters", () => {
  it("ignores members of object literals built inside a function and names globals by their value", () => {
    const units = extract({
      "src/merge.ts": `import type { User } from "./model.js";
const DEFAULTS = { status: "active" as const };
export function merge(user: User): User {
  const patch = { status: "inactive" as const, note: "x" };
  void patch.note;
  return Object.assign({}, user, patch, { email: DEFAULTS.status });
}`,
    });
    const merge = unit(units, "src/merge.ts#merge:function");
    expect(merge.touchedProperties).toEqual(["DEFAULTS.status"]);
    expect(merge.calls).toEqual(["Object.assign"]);
  });
});

describe("extractUnits: type declarations", () => {
  it("records interfaces, aliases, classes and enums of the project, not local types", () => {
    const root = writeRepo({
      "tsconfig.json": STRICT_TSCONFIG,
      "src/types.ts": `export interface User { id: string }
export type Status = "a" | "b";
export enum Color { Red }
export class Service { run(): void { interface Local { x: number } const l: Local = { x: 1 }; void l; } }
export namespace Billing { export interface Invoice { total: number } }
`,
    });
    const { types } = extractUnits({ root });
    expect(types.map((t) => [t.name, t.kind, t.startLine])).toEqual([
      ["User", "interface", 1],
      ["Status", "type", 2],
      ["Color", "enum", 3],
      ["Service", "class", 4],
      ["Billing.Invoice", "interface", 5],
    ]);
  });
});
