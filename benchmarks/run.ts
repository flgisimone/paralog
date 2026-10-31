/**
 * Produces a paralog run on the benchmark targets, in the layout `npm run bench` scores.
 * Today: candidates on every fixture (F3). Findings arrive with F4.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findCandidates, type CandidateOptions } from "../src/candidates/index.js";
import { extractUnits } from "../src/extract.js";
import { VERSION } from "../src/version.js";
import type { CandidatesFile } from "./schema.js";

const BENCHMARKS = import.meta.dirname;

export function fixtureNames(): string[] {
  return readdirSync(join(BENCHMARKS, "fixtures"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Candidates of paralog on one fixture, in the scorer format. */
export function fixtureCandidates(fixture: string, options: CandidateOptions = {}): CandidatesFile {
  const { units } = extractUnits({ root: join(BENCHMARKS, "fixtures", fixture) });
  const { candidates } = findCandidates(units, options);
  return {
    tool: `paralog ${VERSION}`,
    candidates: candidates.map((c) => ({ members: [c.a, c.b], score: c.score, signals: { ...c.signals }, shared: { ...c.shared } })),
  };
}

export function generateRun(runDir: string, options: CandidateOptions = {}): void {
  rmSync(runDir, { recursive: true, force: true });
  for (const fixture of fixtureNames()) {
    const dir = join(runDir, "fixtures", fixture);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "candidates.json"), `${JSON.stringify(fixtureCandidates(fixture, options), null, 2)}\n`);
  }
}
