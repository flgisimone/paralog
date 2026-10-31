import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findCandidates } from "../src/candidates/index.js";
import { extractUnits } from "../src/extract.js";
import { fixtureCandidates } from "./run.js";
import { validateAnnotations, validateCandidates } from "./schema.js";
import { scoreCandidates, unitKey } from "./score.js";
import { restrictToSplit } from "./split.js";

const root = join(import.meta.dirname, "fixtures", "shop");
const parsed = validateAnnotations(JSON.parse(readFileSync(join(root, "annotations.json"), "utf8")));
if (!parsed.ok) throw new Error("invalid annotations");
const annotations = parsed.value;

describe("candidates on the shop fixture (F3 acceptance)", () => {
  const run = fixtureCandidates("shop");

  it("is valid for the scorer and stable between two runs", () => {
    expect(validateCandidates(run).ok).toBe(true);
    expect(fixtureCandidates("shop")).toEqual(run);
  });

  it("finds at least 90% of the verification half within the first 100 candidates (F3-05)", () => {
    expect(run.candidates.length).toBeLessThanOrEqual(200);
    const verification = scoreCandidates(restrictToSplit(annotations, "verification"), run, [100]);
    expect(verification.recallAtK[0]?.recall).toBeGreaterThanOrEqual(0.9);
  });

  it("keeps strategy and mapper near-misses out of the first 100 candidates (F3-03)", () => {
    const top = run.candidates.slice(0, 100).map((c) => c.members.map(unitKey).sort().join("|"));
    for (const id of ["payment-strategies", "report-exporters", "dto-mappers", "notifier-channels"]) {
      const nearMiss = annotations.nearMisses.find((n) => n.id === id);
      const key = (nearMiss?.members ?? []).map((m) => `${m.file}#${m.symbol}`).sort().join("|");
      expect(top, id).not.toContain(key);
    }
  });

  it("loses no overlap to blocking (F3-02)", () => {
    const { units } = extractUnits({ root });
    const all = findCandidates(units, { limit: Number.POSITIVE_INFINITY });
    const everything = { tool: "all", candidates: all.candidates.map((c) => ({ members: [c.a, c.b] as [string, string] })) };
    const score = scoreCandidates(annotations, everything, [all.candidates.length]);
    expect(Object.entries(score.firstHitRank).filter(([, rank]) => rank === null)).toEqual([]);
  });
});
