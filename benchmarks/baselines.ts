/**
 * npm run bench:baselines (F1-06)
 *
 * Runs existing duplication detectors on every fixture, maps their duplicated fragments to
 * paralog units and scores them like a paralog run. Results go to benchmarks/results/baselines/<tool>/.
 *
 * Tool versions are pinned. Embedding-based modes (`jscpd --semantic`, `fallow similar-code`)
 * download a model from huggingface.co and are not run here: see benchmarks/README.md.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { extractUnits, type CodeUnit } from "../src/extract.js";
import { bench } from "./bench.js";
import type { CandidatesFile, FindingsFile } from "./schema.js";

const BENCHMARKS = import.meta.dirname;
const JSCPD = "jscpd@5.4.2";
const FALLOW = "fallow@3.38.1";

/** A pair of duplicated line ranges; `weight` ranks the pairs (higher first). */
export interface FragmentPair {
  readonly a: { readonly file: string; readonly start: number; readonly end: number };
  readonly b: { readonly file: string; readonly start: number; readonly end: number };
  readonly weight: number;
}

interface Baseline {
  readonly name: string;
  readonly tool: string;
  /** Runs the tool in the fixture root and returns the fragment pairs. */
  run(root: string): FragmentPair[];
}

function npx(args: readonly string[], cwd: string): string {
  return execFileSync("npx", ["--yes", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

interface JscpdReport {
  duplicates: {
    firstFile: { name: string; start: number; end: number };
    secondFile: { name: string; start: number; end: number };
    tokens: number;
    similarity?: number;
  }[];
}

function runJscpd(root: string, args: readonly string[]): FragmentPair[] {
  const out = mkdtempSync(join(tmpdir(), "paralog-jscpd-"));
  try {
    npx([JSCPD, ".", ...args, "--reporters", "json", "--output", out, "--silent"], root);
    const report = JSON.parse(readFileSync(join(out, "jscpd-report.json"), "utf8")) as JscpdReport;
    return report.duplicates.map((d) => ({
      a: { file: d.firstFile.name, start: d.firstFile.start, end: d.firstFile.end },
      b: { file: d.secondFile.name, start: d.secondFile.start, end: d.secondFile.end },
      weight: d.similarity ?? d.tokens,
    }));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

interface FallowReport {
  clone_groups: { instances: { file: string; start_line: number; end_line: number }[]; token_count: number }[];
}

function runFallow(root: string): FragmentPair[] {
  const report = JSON.parse(
    npx([FALLOW, "dupes", "--mode", "semantic", "--min-tokens", "10", "--min-lines", "3", "--format", "json", "--no-cache"], root),
  ) as FallowReport;
  const pairs: FragmentPair[] = [];
  for (const group of report.clone_groups) {
    const ranges = group.instances.map((i) => ({ file: i.file, start: i.start_line, end: i.end_line }));
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const [a, b] = [ranges[i], ranges[j]];
        if (a !== undefined && b !== undefined) pairs.push({ a, b, weight: group.token_count });
      }
    }
  }
  return pairs;
}

export const BASELINES: readonly Baseline[] = [
  {
    name: "jscpd-tokens",
    tool: `${JSCPD} --mode weak --min-tokens 10 --min-lines 3 --ignore-identifiers --ignore-literals`,
    run: (root) =>
      runJscpd(root, ["--mode", "weak", "--min-tokens", "10", "--min-lines", "3", "--ignore-identifiers", "--ignore-literals"]),
  },
  {
    name: "jscpd-similar",
    tool: `${JSCPD} --similarity=0.5 --kind similar`,
    run: (root) => runJscpd(root, ["--similarity=0.5", "--kind", "similar"]),
  },
  {
    name: "fallow-dupes",
    tool: `${FALLOW} dupes --mode semantic --min-tokens 10 --min-lines 3`,
    run: runFallow,
  },
];

function unitsIn(units: readonly CodeUnit[], range: FragmentPair["a"]): CodeUnit[] {
  return units.filter((u) => u.file === range.file && u.startLine <= range.end && u.endLine >= range.start);
}

/** Maps fragment pairs to ranked unit pairs: every unit overlapping one side with every unit overlapping the other. */
export function toUnitPairs(units: readonly CodeUnit[], fragments: readonly FragmentPair[]): { members: [string, string]; score: number }[] {
  const best = new Map<string, { members: [string, string]; score: number }>();
  for (const fragment of fragments) {
    for (const left of unitsIn(units, fragment.a)) {
      for (const right of unitsIn(units, fragment.b)) {
        if (left.id === right.id) continue;
        const members: [string, string] = left.id < right.id ? [left.id, right.id] : [right.id, left.id];
        const key = members.join("|");
        const current = best.get(key);
        if (current === undefined || fragment.weight > current.score) best.set(key, { members, score: fragment.weight });
      }
    }
  }
  return [...best.entries()]
    .sort(([ka, a], [kb, b]) => b.score - a.score || (ka < kb ? -1 : 1))
    .map(([, pair]) => pair);
}

function main(): void {
  const fixtures = readdirSync(join(BENCHMARKS, "fixtures"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const baseline of BASELINES) {
    const runDir = resolve(BENCHMARKS, "results", "baselines", baseline.name);
    rmSync(runDir, { recursive: true, force: true });
    for (const fixture of fixtures) {
      const root = join(BENCHMARKS, "fixtures", fixture);
      const { units } = extractUnits({ root });
      const started = performance.now();
      const pairs = toUnitPairs(units, baseline.run(root));
      const seconds = (performance.now() - started) / 1000;
      const dir = join(runDir, "fixtures", fixture);
      mkdirSync(dir, { recursive: true });
      const candidates: CandidatesFile = { tool: baseline.tool, candidates: pairs };
      // Clone detectors have no verification step: every reported pair counts as a confirmed finding.
      const findings: FindingsFile = {
        tool: baseline.tool,
        findings: pairs.map((p) => ({
          id: createHash("sha256").update(p.members.join("|")).digest("hex").slice(0, 12),
          status: "confirmed" as const,
          members: p.members,
        })),
        usage: { seconds: Math.round(seconds * 10) / 10 },
      };
      writeFileSync(join(dir, "candidates.json"), `${JSON.stringify(candidates, null, 2)}\n`);
      writeFileSync(join(dir, "findings.json"), `${JSON.stringify(findings, null, 2)}\n`);
    }
    const { json, markdown } = bench(runDir);
    writeFileSync(join(runDir, "score.json"), json);
    writeFileSync(join(runDir, "score.md"), markdown);
    process.stdout.write(`\n<!-- ${baseline.name} -->\n${markdown}`);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main();
}
