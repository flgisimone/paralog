/**
 * npm run bench:stability -- --ai <file> [--runs 3] [--pairs 30] [--target <fixture or repo>]   (F4-08)
 *
 * Judges the same top candidate pairs several times without cache and reports how many pairs
 * get the same verdict (and the same status after evidence checks) in every run.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { findCandidates } from "../src/candidates/index.js";
import { extractUnits } from "../src/extract.js";
import { createProvider, judge, type JudgeResult } from "../src/judge/index.js";
import { loadRepos, repoRoot } from "./real.js";
import { loadAiConfig } from "./run.js";

const BENCHMARKS = import.meta.dirname;

export interface Stability {
  readonly pairs: number;
  /** Share of pairs with the same verdict in every run. */
  readonly verdict: number;
  /** Share of pairs with the same status (confirmed / unverified / rejected) in every run. */
  readonly status: number;
}

/** Compares runs over the pairs judged in all of them. */
export function stabilityOf(runs: readonly JudgeResult[]): Stability {
  const key = (a: string, b: string): string => `${a}|${b}`;
  const maps = runs.map((r) => new Map(r.judged.map((j) => [key(j.a.id, j.b.id), j])));
  const common = [...(maps[0]?.keys() ?? [])].filter((k) => maps.every((m) => m.has(k)));
  const same = (pick: (k: string, m: (typeof maps)[number]) => string | undefined): number =>
    common.filter((k) => new Set(maps.map((m) => pick(k, m))).size === 1).length;
  const verdict = same((k, m) => m.get(k)?.verdict.verdict);
  const status = same((k, m) => m.get(k)?.check.status);
  const ratio = (n: number): number => (common.length === 0 ? 0 : n / common.length);
  return { pairs: common.length, verdict: ratio(verdict), status: ratio(status) };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { ai: { type: "string" }, runs: { type: "string" }, pairs: { type: "string" }, target: { type: "string" } },
  });
  if (values.ai === undefined) throw new Error("--ai <file> is required");
  const ai = loadAiConfig(values.ai);
  const target = values.target ?? "shop";
  const repo = loadRepos().find((r) => r.name === target);
  const root = repo === undefined ? join(BENCHMARKS, "fixtures", target) : repoRoot(repo);
  if (!existsSync(root)) throw new Error(`${target}: not a fixture or a fetched repository`);
  const runs = Number(values.runs ?? 3);
  const pairs = Number(values.pairs ?? 30);

  const { units, types } = extractUnits({ root });
  const candidates = findCandidates(units, { limit: pairs }).candidates;
  const provider = createProvider(ai);
  const results: JudgeResult[] = [];
  for (let i = 0; i < runs; i++) {
    process.stderr.write(`run ${String(i + 1)}/${String(runs)}\n`);
    results.push(await judge({ root, units, types, candidates, provider, maxPairs: pairs, ...(ai.concurrency === undefined ? {} : { concurrency: ai.concurrency }) }));
  }
  const s = stabilityOf(results);
  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
  process.stdout.write(
    `| Model | Target | Runs | Pairs | Same verdict | Same status |\n|---|---|---|---|---|---|\n| ${provider.id} | ${target} | ${String(runs)} | ${String(s.pairs)} | ${pct(s.verdict)} | ${pct(s.status)} |\n`,
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error: unknown) => {
    process.stderr.write(`bench:stability: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
