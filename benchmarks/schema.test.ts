import { describe, expect, it } from "vitest";
import { validateAnnotations, validateLabels } from "./schema.js";

const userA = { file: "src/users/user.service.ts", symbol: "UserService.deactivate" };
const userB = { file: "packages/accounts/src/account-manager.ts", symbol: "AccountManager.closeAccount" };

function annotations(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fixture: "shop",
    overlaps: [
      {
        id: "deactivate-user",
        kind: "responsibility_overlap",
        members: [userA, userB],
        difficulty: 3,
        rationale: "Both close the account and revoke the sessions.",
      },
    ],
    nearMisses: [
      {
        id: "payment-strategies",
        members: [
          { file: "src/payments/card.ts", symbol: "CardPayment.charge" },
          { file: "src/payments/paypal.ts", symbol: "PaypalPayment.charge" },
        ],
        reason: "Two strategies of the same PaymentMethod interface.",
      },
    ],
    ...overrides,
  };
}

describe("validateAnnotations", () => {
  it("accepts a valid file", () => {
    const result = validateAnnotations(annotations());
    expect(result.ok).toBe(true);
  });

  it("accepts an empty fixture and a $schema pointer", () => {
    const result = validateAnnotations({ $schema: "./schema.json", fixture: "x", overlaps: [], nearMisses: [] });
    expect(result.ok).toBe(true);
  });

  it("rejects a missing top-level field", () => {
    const data = annotations();
    delete data.nearMisses;
    expect(validateAnnotations(data).ok).toBe(false);
  });

  it("rejects an unknown top-level field", () => {
    expect(validateAnnotations(annotations({ extra: 1 })).ok).toBe(false);
  });

  it.each([
    ["an unknown kind", { kind: "clone" }],
    ["difficulty 0", { difficulty: 0 }],
    ["difficulty 5", { difficulty: 5 }],
    ["a fractional difficulty", { difficulty: 2.5 }],
    ["a single member", { members: [userA] }],
    ["an empty rationale", { rationale: "" }],
    ["a non kebab-case id", { id: "Deactivate_User" }],
    ["a symbol with spaces", { members: [userA, { file: "a.ts", symbol: "not a symbol" }] }],
  ])("rejects an overlap with %s", (_, patch) => {
    const [overlap] = annotations().overlaps as Record<string, unknown>[];
    const result = validateAnnotations(annotations({ overlaps: [{ ...overlap, ...patch }] }));
    expect(result.ok).toBe(false);
  });

  it("rejects a near-miss without a reason", () => {
    const result = validateAnnotations(
      annotations({ nearMisses: [{ id: "x", members: [userA, userB] }] }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate ids across overlaps and near-misses", () => {
    const result = validateAnnotations(
      annotations({ nearMisses: [{ id: "deactivate-user", members: [userA, userB], reason: "r" }] }),
    );
    expect(result).toEqual({ ok: false, errors: ["/nearMisses/0/id duplicate case id 'deactivate-user'"] });
  });

  it("rejects the same member twice in a case", () => {
    const [overlap] = annotations().overlaps as Record<string, unknown>[];
    const result = validateAnnotations(annotations({ overlaps: [{ ...overlap, members: [userA, userA] }] }));
    expect(result).toEqual({
      ok: false,
      errors: ["/overlaps/0/members/1 duplicate member 'src/users/user.service.ts#UserService.deactivate'"],
    });
  });

  it.each(["/abs/user.ts", "../outside.ts", "src/./user.ts", "src\\user.ts", "C:/user.ts", "src//user.ts"])(
    "rejects the path %s",
    (file) => {
      const [overlap] = annotations().overlaps as Record<string, unknown>[];
      const result = validateAnnotations(
        annotations({ overlaps: [{ ...overlap, members: [userA, { file, symbol: "f" }] }] }),
      );
      expect(result.ok).toBe(false);
    },
  );

  it("reports every error with its path", () => {
    const result = validateAnnotations({ fixture: "", overlaps: [{}], nearMisses: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("/fixture must NOT have fewer than 1 characters");
      expect(result.errors.some((e) => e.startsWith("/overlaps/0 "))).toBe(true);
    }
  });
});

describe("validateLabels", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";

  it("accepts true, false and unsure", () => {
    const result = validateLabels({ repo: "nestjs-realworld", sha, labels: { a1: true, b2: false, c3: "unsure" } });
    expect(result.ok).toBe(true);
  });

  it.each([
    ["a string label other than unsure", { labels: { a1: "yes" } }],
    ["a numeric label", { labels: { a1: 1 } }],
    ["a short sha", { sha: "0123abc" }],
    ["an uppercase sha", { sha: sha.toUpperCase() }],
    ["an unknown field", { model: "x" }],
  ])("rejects %s", (_, patch) => {
    expect(validateLabels({ repo: "r", sha, labels: {}, ...patch }).ok).toBe(false);
  });
});
