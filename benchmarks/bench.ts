/**
 * npm run bench -- [--run <dir>] [--all]
 *
 * Scores the outputs of one run. Layout of the run directory:
 *
 *   <run>/fixtures/<fixture>/candidates.json   ranked candidate pairs (optional)
 *   <run>/fixtures/<fixture>/findings.json     findings (optional)
 *   <run>/real/<repo>/findings.json            findings on a real repository
 *
 * Annotations come from benchmarks/fixtures/<fixture>/annotations.json and labels from
 * benchmarks/labels/<repo>.json. Writes <run>/score.json and <run>/score.md and prints the markdown.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  validateAnnotations,
  validateCandidates,
  validateFindings,
  validateLabels,
  type FindingsFile,
  type Usage,
  type ValidationResult,
} from "./schema.js";
import {
  combine,
  renderMarkdown,
  scoreCandidates,
  scoreFindings,
  scoreReal,
  sumUsage,
  type FixtureScore,
  type RealScore,
} from "./score.js";

const BENCHMARKS = import.meta.dirname;

function read<T>(path: string, validate: (data: unknown) => ValidationResult<T>): T {
  const result = validate(JSON.parse(readFileSync(path, "utf8")));
  if (!result.ok) throw new Error(`${path}:\n  ${result.errors.join("\n  ")}`);
  return result.value;
}

function subdirectories(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export function bench(runDir: string, options: { includeUnverified?: boolean } = {}): { json: string; markdown: string } {
  const usages: (Usage | undefined)[] = [];
  const fixtures: FixtureScore[] = [];
  for (const fixture of subdirectories(join(runDir, "fixtures"))) {
    const dir = join(runDir, "fixtures", fixture);
    const annotations = read(join(BENCHMARKS, "fixtures", fixture, "annotations.json"), validateAnnotations);
    const candidatesPath = join(dir, "candidates.json");
    const findingsPath = join(dir, "findings.json");
    let findings: FindingsFile | undefined;
    if (existsSync(findingsPath)) {
      findings = read(findingsPath, validateFindings);
      usages.push(findings.usage);
    }
    fixtures.push({
      fixture,
      candidates: existsSync(candidatesPath) ? scoreCandidates(annotations, read(candidatesPath, validateCandidates)) : null,
      findings: findings === undefined ? null : scoreFindings(annotations, findings, options),
    });
  }

  const real: RealScore[] = [];
  for (const repo of subdirectories(join(runDir, "real"))) {
    const findingsPath = join(runDir, "real", repo, "findings.json");
    if (!existsSync(findingsPath)) continue;
    const findings = read(findingsPath, validateFindings);
    usages.push(findings.usage);
    const labelsPath = join(BENCHMARKS, "labels", `${repo}.json`);
    real.push(scoreReal(repo, findings, existsSync(labelsPath) ? read(labelsPath, validateLabels) : undefined));
  }

  if (fixtures.length === 0 && real.length === 0) {
    throw new Error(`${runDir} has no fixtures/<name>/ or real/<repo>/ results`);
  }
  const score = combine(fixtures, real, sumUsage(usages));
  return { json: `${JSON.stringify(score, null, 2)}\n`, markdown: renderMarkdown(score) };
}

function main(): void {
  const { values } = parseArgs({
    options: { run: { type: "string" }, all: { type: "boolean" } },
  });
  const runDir = resolve(values.run ?? join(BENCHMARKS, "results", "latest"));
  const { json, markdown } = bench(runDir, { includeUnverified: values.all === true });
  writeFileSync(join(runDir, "score.json"), json);
  writeFileSync(join(runDir, "score.md"), markdown);
  process.stdout.write(markdown);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`bench: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
