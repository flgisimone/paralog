import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AIProvider, GenerateRequest, GenerateResult, JudgeResult } from "../src/judge/index.js";
import { describeFinding } from "./label.js";
import { directoryFindings } from "./run.js";
import { validateFindings } from "./schema.js";
import { stabilityOf } from "./stability.js";

const SHOP = join(import.meta.dirname, "fixtures", "shop");

/** Answers same_responsibility citing the first line of both units; optionally flips some verdicts. */
class FakeProvider implements AIProvider {
  readonly id = "fake:model";
  constructor(private readonly flip: (prompt: string) => boolean = () => false) {}
  generate(request: GenerateRequest): Promise<GenerateResult> {
    const [a = 1, b = 1] = [...request.prompt.matchAll(/lines (\d+)-\d+/g)].map((m) => Number(m[1]));
    const output = {
      verdict: this.flip(request.prompt) ? "different" : "same_responsibility",
      sharedResponsibility: "s",
      differences: [],
      evidence: [{ claim: "c", linesA: [a, a], linesB: [b, b] }],
      suggestion: "",
    };
    return Promise.resolve({ output, model: "fake-model", usage: { inputTokens: 10, outputTokens: 5 } });
  }
}

describe("benchmark findings and stability (F4-07, F4-08)", () => {
  it("writes findings in the scorer format and in full", async () => {
    const { scored, report } = await directoryFindings(SHOP, new FakeProvider(), 5);
    expect(validateFindings(scored).ok).toBe(true);
    expect(scored.model).toBe("fake-model");
    expect(scored.usage).toMatchObject({ inputTokens: 50, outputTokens: 25 });
    expect(report.map((f) => f.id)).toEqual(scored.findings.map((f) => f.id));
    const first = report[0];
    if (first !== undefined) expect(describeFinding(SHOP, first)).toContain(` | `);
  });

  it("measures how many pairs keep their verdict across runs", async () => {
    const { judge } = await import("../src/judge/index.js");
    const { extractUnits } = await import("../src/extract.js");
    const { findCandidates } = await import("../src/candidates/index.js");
    const { units, types } = extractUnits({ root: SHOP });
    const candidates = findCandidates(units, { limit: 4 }).candidates;
    const runWith = (provider: AIProvider): Promise<JudgeResult> => judge({ root: SHOP, units, types, candidates, provider });
    const stable = await runWith(new FakeProvider());
    expect(stabilityOf([stable, stable, stable])).toEqual({ pairs: 4, verdict: 1, status: 1 });
    const firstPair = candidates[0]?.a ?? "";
    const name = firstPair.slice(firstPair.indexOf("#") + 1).replace(/:.*$/, "");
    const flipped = await runWith(new FakeProvider((prompt) => prompt.includes(`Unit A: ${name} `)));
    expect(stabilityOf([stable, flipped]).verdict).toBe(0.75);
  });
});
