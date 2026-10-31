import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WEIGHTS,
  EMBEDDING_WEIGHTS,
  embeddingNeighbors,
  EmbeddingError,
  findCandidates,
  nameTokens,
  OpenAICompatibleEmbedder,
  pairKey,
  type Embedder,
} from "../src/candidates/index.js";
import { ConfigError, parseConfig } from "../src/config.js";
import type { CodeUnit } from "../src/extract.js";
import { writeRepo } from "./helpers.js";

/** A unit with sensible defaults; `name` drives the id. */
function unit(name: string, patch: Partial<CodeUnit> = {}): CodeUnit {
  const file = patch.file ?? "src/a.ts";
  const kind = patch.kind ?? "function";
  return {
    id: `${file}#${name}:${kind}`,
    name,
    kind,
    file,
    startLine: 1,
    endLine: 3,
    signature: `${name}(): void`,
    paramTypes: [],
    returnType: "void",
    touchedProperties: [],
    calls: [],
    literals: [],
    implements: [],
    domainTypes: [],
    statements: 3,
    nodes: 40,
    shape: { "Block>ReturnStatement": 1 },
    bodyHash: name,
    ...patch,
  };
}

describe("nameTokens", () => {
  it.each([
    ["checkEmailFormat", ["validate", "email", "format"]],
    ["isValidEmail", ["validate", "email"]],
    ["closeAccount", ["deactivate", "user"]],
    ["deactivate", ["deactivate"]],
    ["getUserById", ["get", "user", "by", "id"]],
    ["parseHTMLDocument", ["parse", "html", "document"]],
    ["count_active_users", ["compute", "active", "user"]],
    ["toUserDto", ["user", "dto"]],
  ])("%s → %j", (name, tokens) => {
    expect(nameTokens(name)).toEqual(tokens);
  });
});

describe("findCandidates: signals and ranking", () => {
  const units = [
    unit("UserService.deactivate", {
      touchedProperties: ["User.status", "User.email", "UserService.repo"],
      calls: ["src/ports.ts#Mailer.send", "src/ports.ts#SessionStore.revoke"],
      literals: ['"Your account has been closed"'],
      domainTypes: ["User"],
    }),
    unit("AccountManager.closeAccount", {
      file: "src/b.ts",
      touchedProperties: ["User.status", "User.email", "AccountManager.store"],
      calls: ["src/ports.ts#Mailer.send", "src/ports.ts#SessionStore.revoke"],
      literals: ['"Your account has been closed"'],
    }),
    unit("formatDate", { file: "src/c.ts", calls: ["Date.getUTCFullYear"], literals: ['"-"'] }),
  ];

  it("explains a pair with its signals and what the units share", () => {
    const [top] = findCandidates(units).candidates;
    expect(top?.a).toBe("src/a.ts#UserService.deactivate:function");
    expect(top?.b).toBe("src/b.ts#AccountManager.closeAccount:function");
    expect(top?.shared).toEqual({
      types: ["User"],
      properties: ["User.email", "User.status"],
      calls: ["src/ports.ts#Mailer.send", "src/ports.ts#SessionStore.revoke"],
      literals: ['"Your account has been closed"'],
      names: ["deactivate"],
    });
    // The units' own fields (UserService.repo, AccountManager.store) are not compared.
    expect(top?.signals.properties).toBe(1);
    expect(top?.signals.embedding).toBe(0);
  });

  it("does not compare units that share nothing", () => {
    expect(findCandidates(units).stats.comparedPairs).toBe(1);
  });

  it("weights rare shared features more than common ones", () => {
    const common = Array.from({ length: 6 }, (_, i) =>
      unit(`noise${String(i)}`, { file: `src/n${String(i)}.ts`, calls: ["Array.map", "Math.round"] }),
    );
    const rare = [
      unit("left", { calls: ["Array.map", "src/x.ts#rareHelper:function"] }),
      unit("right", { file: "src/r.ts", calls: ["Array.map", "src/x.ts#rareHelper:function"] }),
    ];
    const ranked = findCandidates([...common, ...rare], { maxKeyFrequency: 100 }).candidates;
    expect([ranked[0]?.a, ranked[0]?.b]).toEqual(["src/a.ts#left:function", "src/r.ts#right:function"]);
  });

  it("ignores blocking keys shared by too many units and needs two keys or a rare one", () => {
    const many = Array.from({ length: 10 }, (_, i) => unit(`u${String(i)}`, { file: `src/u${String(i)}.ts`, calls: ["Array.map"] }));
    expect(findCandidates(many, { maxKeyFrequency: 5 }).stats.comparedPairs).toBe(0);
    // One shared key found in 10 units: not rare, so not enough on its own.
    expect(findCandidates(many, { maxKeyFrequency: 100, rareKeyFrequency: 5 }).stats.comparedPairs).toBe(0);
    expect(findCandidates(many, { maxKeyFrequency: 100, rareKeyFrequency: 10 }).stats.comparedPairs).toBe(45);
  });

  it("is deterministic and honours limit and minScore", () => {
    const first = findCandidates(units);
    expect(findCandidates([...units].reverse())).toEqual(first);
    expect(findCandidates(units, { limit: 0 }).candidates).toEqual([]);
    expect(findCandidates(units, { minScore: 2 }).candidates).toEqual([]);
  });
});

describe("findCandidates: exclusions", () => {
  const shared = { touchedProperties: ["Order.total", "Order.status"], calls: ["src/p.ts#Gateway.charge"] };

  it("skips accessors, constructors and trivial units", () => {
    const result = findCandidates([
      unit("A.total", { ...shared, kind: "getter" }),
      unit("B.constructor", { ...shared, kind: "constructor", file: "src/b.ts" }),
      unit("tiny", { ...shared, nodes: 5, file: "src/c.ts" }),
      unit("real", { ...shared, file: "src/d.ts" }),
    ]);
    expect(result.stats.excludedUnits).toEqual({ accessor: 1, constructor: 1, trivial: 1 });
    expect(result.candidates).toEqual([]);
  });

  it("skips two implementations of the same interface member", () => {
    const result = findCandidates([
      unit("Card.charge", { ...shared, implements: ["PaymentMethod.charge"] }),
      unit("Paypal.charge", { ...shared, implements: ["PaymentMethod.charge"], file: "src/b.ts" }),
    ]);
    expect(result.stats.excludedPairs["same-interface-member"]).toBe(1);
    expect(result.candidates).toEqual([]);
  });

  it("skips a unit and its direct callee", () => {
    const callee = unit("OrderService.updateStatus", shared);
    const caller = unit("OrderAdmin.updateStatus", { ...shared, file: "src/b.ts", calls: [...shared.calls, callee.id] });
    const result = findCandidates([callee, caller]);
    expect(result.stats.excludedPairs["direct-call"]).toBe(1);
    expect(result.candidates).toEqual([]);
  });
});

describe("embeddings (F3-04)", () => {
  const a = unit("slugify", { file: "src/a.ts" });
  const b = unit("toUrlSegment", { file: "src/b.ts" });
  const c = unit("sendInvoice", { file: "src/c.ts" });
  const vectors: Record<string, number[]> = { slugify: [1, 0.1, 0], toUrlSegment: [0.9, 0.2, 0], sendInvoice: [0, 0, 1] };

  class FakeEmbedder implements Embedder {
    readonly id = "fake";
    calls = 0;
    embed(texts: readonly string[]): Promise<number[][]> {
      this.calls++;
      return Promise.resolve(texts.map((t) => vectors[t.trim()] ?? [0, 0, 0]));
    }
  }

  function repoFor(units: readonly CodeUnit[]): string {
    return writeRepo(Object.fromEntries(units.map((u) => [u.file, `${u.name}\n`])));
  }

  it("adds nearest neighbours to the compared pairs, with the embedding signal", async () => {
    const root = repoFor([a, b, c]);
    const similarities = await embeddingNeighbors([a, b, c], { root, embedder: new FakeEmbedder(), neighbors: 1 });
    expect(findCandidates([a, b, c]).candidates).toEqual([]);
    const [top] = findCandidates([a, b, c], { similarities }).candidates;
    expect([top?.a, top?.b]).toEqual([a.id, b.id]);
    expect(top?.signals.embedding).toBeCloseTo(0.99, 2);
    expect(top?.score).toBeCloseTo(
      (top?.signals.embedding ?? 0) * EMBEDDING_WEIGHTS.embedding + (top?.signals.shape ?? 0) * EMBEDDING_WEIGHTS.shape,
      3,
    );
    expect(similarities.has(pairKey(b.id, a.id))).toBe(true);
  });

  it("caches vectors by body hash", async () => {
    const root = repoFor([a, b, c]);
    const embedder = new FakeEmbedder();
    await embeddingNeighbors([a, b, c], { root, embedder, cache: true });
    await embeddingNeighbors([a, b, c], { root, embedder, cache: true });
    expect(embedder.calls).toBe(1);
  });

  it("keeps the embedding weight at zero when embeddings are off", () => {
    expect(DEFAULT_WEIGHTS.embedding).toBe(0);
    const sum = (w: Record<string, number>): number => Object.values(w).reduce((x, y) => x + y, 0);
    expect(sum(DEFAULT_WEIGHTS)).toBeCloseTo(1);
    expect(sum(EMBEDDING_WEIGHTS)).toBeCloseTo(1);
  });

  describe("OpenAICompatibleEmbedder", () => {
    let server: Server | undefined;
    afterEach(() => {
      server?.close();
    });

    async function serve(handler: (body: { model: string; input: string[] }, request: IncomingMessage) => [number, unknown]): Promise<string> {
      server = createServer((request, response) => {
        let raw = "";
        request.on("data", (chunk: Buffer) => (raw += chunk.toString()));
        request.on("end", () => {
          const [status, body] = handler(JSON.parse(raw) as { model: string; input: string[] }, request);
          response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
        });
      });
      await new Promise<void>((done) => server?.listen(0, "127.0.0.1", done));
      return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/v1`;
    }

    it("posts the model and the inputs and sends the key from the environment", async () => {
      let seen: { model: string; input: string[]; authorization: string | undefined } | undefined;
      const baseUrl = await serve((body, request) => {
        seen = { ...body, authorization: request.headers.authorization };
        return [200, { data: body.input.map((_, index) => ({ index, embedding: [index, 1] })) }];
      });
      const embedder = new OpenAICompatibleEmbedder({ baseUrl, model: "nomic", apiKeyEnv: "KEY" }, { KEY: "secret-123" });
      expect(await embedder.embed(["x", "y"])).toEqual([
        [0, 1],
        [1, 1],
      ]);
      expect(seen).toEqual({ model: "nomic", input: ["x", "y"], authorization: "Bearer secret-123" });
    });

    it("never puts the key in errors", async () => {
      const baseUrl = await serve(() => [401, { error: "bad key secret-123" }]);
      const embedder = new OpenAICompatibleEmbedder({ baseUrl, model: "m", apiKeyEnv: "KEY" }, { KEY: "secret-123" });
      const error = await embedder.embed(["x"]).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(EmbeddingError);
      expect(String(error)).toContain("401");
      expect(String(error)).not.toContain("secret-123");
    });

    it("fails clearly when the key variable is missing", () => {
      expect(() => new OpenAICompatibleEmbedder({ baseUrl: "http://x", model: "m", apiKeyEnv: "NOPE" }, {})).toThrow(
        "environment variable NOPE is not set",
      );
    });
  });

  it("is configured in paralog.config.json and validated", () => {
    expect(parseConfig({ embeddings: { baseUrl: "http://localhost:11434/v1", model: "nomic-embed-text" } }).embeddings).toEqual({
      baseUrl: "http://localhost:11434/v1",
      model: "nomic-embed-text",
    });
    expect(parseConfig({}).embeddings).toBeUndefined();
    expect(() => parseConfig({ embeddings: { baseUrl: "localhost", model: "m" } })).toThrow(ConfigError);
    expect(() => parseConfig({ embeddings: { baseUrl: "http://x", model: "m", apiKeyEnv: "sk-abc123-def" } })).toThrow(
      "not a key",
    );
    expect(() => parseConfig({ embeddings: { baseUrl: "http://x", model: "m", apiKey: "x" } })).toThrow("unknown option");
  });
});
