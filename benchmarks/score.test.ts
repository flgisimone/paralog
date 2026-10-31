import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bench } from "./bench.js";
import { validateAnnotations, validateCandidates, validateFindings, type Annotations, type Labels } from "./schema.js";
import { renderMarkdown, scoreCandidates, scoreFindings, scoreReal, sumUsage, combine, unitKey } from "./score.js";

const m = (file: string, symbol: string) => ({ file, symbol });

/** Four overlaps, one per difficulty, and one near-miss. */
const ANNOTATIONS: Annotations = {
  fixture: "tiny",
  overlaps: [
    { id: "o1", kind: "semantic_duplication", difficulty: 1, rationale: "r", members: [m("a.ts", "f"), m("b.ts", "g")] },
    { id: "o2", kind: "semantic_duplication", difficulty: 2, rationale: "r", members: [m("a.ts", "h"), m("b.ts", "i")] },
    { id: "o3", kind: "responsibility_overlap", difficulty: 3, rationale: "r", members: [m("a.ts", "S.j"), m("b.ts", "k")] },
    {
      id: "o4",
      kind: "responsibility_overlap",
      difficulty: 4,
      rationale: "r",
      members: [m("a.ts", "l"), m("b.ts", "step1"), m("b.ts", "step2")],
    },
  ],
  nearMisses: [{ id: "n1", members: [m("a.ts", "Card.charge"), m("a.ts", "Paypal.charge")], reason: "strategies" }],
};

describe("unitKey", () => {
  it.each([
    ["a.ts#S.j:method", "a.ts#S.j"],
    ["a.ts#f:function", "a.ts#f"],
    ["a.ts#f:function~2", "a.ts#f"],
    ["a.ts#f", "a.ts#f"],
  ])("%s → %s", (ref, key) => {
    expect(unitKey(ref)).toBe(key);
  });
});

describe("scoreCandidates", () => {
  const candidates = {
    tool: "fake",
    candidates: [
      { members: ["a.ts#f:function", "b.ts#g:function"] as [string, string] }, // o1 at rank 1
      { members: ["a.ts#Card.charge:method", "a.ts#Paypal.charge:method"] as [string, string] }, // near-miss at rank 2
      { members: ["a.ts#x", "b.ts#y"] as [string, string] }, // noise
      { members: ["b.ts#step2:function", "a.ts#l:function"] as [string, string] }, // o4 at rank 4, reversed order
      { members: ["a.ts#f:function", "b.ts#g:function"] as [string, string] }, // duplicate of rank 1
    ],
  };
  const score = scoreCandidates(ANNOTATIONS, candidates, [1, 3, 10]);

  it("computes recall@K overall and per difficulty", () => {
    expect(score.recallAtK.map((r) => [r.k, r.recall])).toEqual([
      [1, 0.25],
      [3, 0.25],
      [10, 0.5],
    ]);
    expect(score.recallAtK[2]?.byDifficulty.map((d) => d.found)).toEqual([1, 0, 0, 1]);
  });

  it("counts near-misses in the top K", () => {
    expect(score.recallAtK.map((r) => r.nearMisses)).toEqual([0, 1, 1]);
  });

  it("reports the rank of the first hit", () => {
    expect(score.firstHitRank).toEqual({ o1: 1, o2: null, o3: null, o4: 4 });
  });
});

describe("scoreFindings", () => {
  const findings = {
    tool: "fake",
    model: "m",
    findings: [
      { id: "F1", status: "confirmed" as const, members: ["a.ts#f:function", "b.ts#g:function"] },
      { id: "F2", status: "confirmed" as const, members: ["a.ts#l:function", "b.ts#step1:function", "b.ts#step2:function"] },
      { id: "F3", status: "confirmed" as const, members: ["a.ts#Card.charge:method", "a.ts#Paypal.charge:method"] },
      { id: "F4", status: "confirmed" as const, members: ["a.ts#x", "b.ts#y"] },
      { id: "F5", status: "unverified" as const, members: ["a.ts#h", "b.ts#i"] },
      { id: "F6", status: "rejected" as const, members: ["a.ts#S.j", "b.ts#k"] },
    ],
  };

  it("scores confirmed findings only by default", () => {
    const score = scoreFindings(ANNOTATIONS, findings);
    expect(score).toMatchObject({
      considered: 4,
      byStatus: { confirmed: 4, unverified: 1, rejected: 1 },
      truePositives: 2,
      falsePositives: 2,
      nearMissHits: 1,
      precision: 0.5,
      recall: 0.5,
      missedOverlaps: ["o2", "o3"],
      falsePositiveIds: ["F3", "F4"],
      unverifiedHits: 1,
    });
    expect(score.byDifficulty.map((d) => d.recall)).toEqual([1, 0, 0, 1]);
  });

  it("includes unverified findings with includeUnverified", () => {
    const score = scoreFindings(ANNOTATIONS, findings, { includeUnverified: true });
    expect(score.considered).toBe(5);
    expect(score.precision).toBe(0.6);
    expect(score.recall).toBe(0.75);
  });

  it("returns null precision with no findings", () => {
    expect(scoreFindings(ANNOTATIONS, { tool: "fake", findings: [] }).precision).toBeNull();
  });
});

describe("scoreReal", () => {
  const labels: Labels = { repo: "r", sha: "0".repeat(40), labels: { A: true, B: false, C: "unsure", D: true } };
  const run = {
    tool: "fake",
    findings: ["A", "B", "C", "D", "E"].map((id) => ({ id, status: "confirmed" as const, members: ["a#x", "b#y"] })),
  };

  it("computes precision from labels, excluding unsure and unlabeled", () => {
    expect(scoreReal("r", run, labels)).toMatchObject({
      findings: 5,
      truePositives: 2,
      falsePositives: 1,
      unsure: 1,
      unlabeled: ["E"],
      precision: 2 / 3,
    });
  });

  it("leaves every finding unlabeled without labels", () => {
    expect(scoreReal("r", run, undefined)).toMatchObject({ precision: null, unlabeled: ["A", "B", "C", "D", "E"] });
  });

  it("combines repositories and usage", () => {
    const score = combine([], [scoreReal("r", run, labels), scoreReal("s", run, labels)], sumUsage([
      { inputTokens: 10, costUsd: 0.5 },
      undefined,
      { inputTokens: 5, outputTokens: 2, seconds: 1.5 },
    ]));
    expect(score.realPrecision).toBe(2 / 3);
    expect(score.usage).toEqual({ inputTokens: 15, outputTokens: 2, costUsd: 0.5, seconds: 1.5 });
    expect(renderMarkdown(score)).toContain("| r | fake | — | 5 | 2 | 1 | 1 | 1 | 66.7% |");
  });
});

describe("run formats", () => {
  it("validate candidate and finding files", () => {
    expect(validateCandidates({ tool: "t", candidates: [{ members: ["a#x", "b#y"], score: 1 }] }).ok).toBe(true);
    expect(validateCandidates({ tool: "t", candidates: [{ members: ["a#x"] }] }).ok).toBe(false);
    expect(validateCandidates({ tool: "t", candidates: [{ members: ["no-hash", "b#y"] }] }).ok).toBe(false);
    expect(validateFindings({ tool: "t", findings: [{ id: "x", status: "maybe", members: ["a#x", "b#y"] }] }).ok).toBe(false);
    expect(
      validateFindings({
        tool: "t",
        findings: [
          { id: "x", status: "confirmed", members: ["a#x", "b#y"] },
          { id: "x", status: "confirmed", members: ["a#x", "b#z"] },
        ],
      }),
    ).toEqual({ ok: false, errors: ["/findings/1/id duplicate finding id 'x'"] });
  });
});

describe("bench on the shop fixture", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  });

  it("gives a perfect score to an oracle and the same output twice", () => {
    const annotations = validateAnnotations(
      JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "shop", "annotations.json"), "utf8")),
    );
    if (!annotations.ok) throw new Error("invalid annotations");
    const ref = (x: { file: string; symbol: string }): string => `${x.file}#${x.symbol}`;
    const oracle = annotations.value.overlaps.map((o) => ({ members: o.members.slice(0, 2).map(ref) }));

    dir = mkdtempSync(join(tmpdir(), "paralog-bench-"));
    mkdirSync(join(dir, "fixtures", "shop"), { recursive: true });
    writeFileSync(join(dir, "fixtures", "shop", "candidates.json"), JSON.stringify({ tool: "oracle", candidates: oracle }));
    writeFileSync(
      join(dir, "fixtures", "shop", "findings.json"),
      JSON.stringify({
        tool: "oracle",
        findings: annotations.value.overlaps.map((o) => ({ id: o.id, status: "confirmed", members: o.members.map(ref) })),
        usage: { inputTokens: 100, outputTokens: 10, seconds: 2 },
      }),
    );

    const first = bench(dir);
    const score = JSON.parse(first.json) as {
      fixtures: { candidates: { recallAtK: { k: number; recall: number }[] }; findings: { precision: number; recall: number } }[];
    };
    expect(score.fixtures[0]?.candidates.recallAtK.find((r) => r.k === 25)?.recall).toBe(1);
    expect(score.fixtures[0]?.findings).toMatchObject({ precision: 1, recall: 1 });
    expect(first.markdown).toContain("| 25 | 100.0% | 100.0% (5/5) | 100.0% (8/8) | 100.0% (6/6) | 100.0% (6/6) | 0 |");
    expect(bench(dir)).toEqual(first);
  });

  it("fails on an empty run directory", () => {
    dir = mkdtempSync(join(tmpdir(), "paralog-bench-"));
    expect(() => bench(dir ?? "")).toThrow("has no fixtures");
  });
});
