/**
 * npm run bench:label -- --repo <name> [--run <dir>]   (F4-07)
 *
 * Shows every confirmed finding of a run on a real repository that has no label yet, with the
 * code of its units, and asks: true (a real overlap), false (a false positive), unsure (left out
 * of the precision), skip. Answers are saved to benchmarks/labels/<repo>.json after each one.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import type { Finding } from "../src/judge/index.js";
import { loadRepos, repoRoot } from "./real.js";
import { validateLabels, type Label, type Labels } from "./schema.js";

const BENCHMARKS = import.meta.dirname;

function excerpt(root: string, file: string, start: number, end: number, max = 30): string {
  const lines = readFileSync(join(root, file), "utf8").split("\n");
  const last = Math.min(end, start + max - 1);
  const body = lines.slice(start - 1, last).map((l, i) => `${String(start + i).padStart(5)} | ${l}`);
  if (last < end) body.push(`      ... ${String(end - last)} more lines`);
  return body.join("\n");
}

export function describeFinding(root: string, finding: Finding): string {
  const parts = [`${finding.kind} [${finding.severity}] ${finding.id}`, finding.sharedResponsibility];
  for (const m of finding.members) parts.push(`\n${m.name} (${m.file})\n${excerpt(root, m.file, m.startLine, m.endLine)}`);
  for (const e of finding.evidence) {
    parts.push(`evidence: ${e.claim} (${String(e.linesA[0])}-${String(e.linesA[1])} / ${String(e.linesB[0])}-${String(e.linesB[1])}) [${e.support.join(", ")}]`);
  }
  if (finding.differences.length > 0) parts.push(`differences: ${finding.differences.join("; ")}`);
  return parts.join("\n");
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { repo: { type: "string" }, run: { type: "string" } } });
  const repo = loadRepos().find((r) => r.name === values.repo);
  if (repo === undefined) throw new Error(`--repo must be one of: ${loadRepos().map((r) => r.name).join(", ")}`);
  const runDir = resolve(values.run ?? join(BENCHMARKS, "results", "latest"));
  const reportPath = join(runDir, "real", repo.name, "report.json");
  if (!existsSync(reportPath)) throw new Error(`${reportPath} not found: run npm run bench -- --ai <file> --real first`);
  const findings = (JSON.parse(readFileSync(reportPath, "utf8")) as Finding[]).filter((f) => f.status === "confirmed");

  const labelsPath = join(BENCHMARKS, "labels", `${repo.name}.json`);
  let labels: Labels = { repo: repo.name, sha: repo.sha, labels: {} };
  if (existsSync(labelsPath)) {
    const parsed = validateLabels(JSON.parse(readFileSync(labelsPath, "utf8")));
    if (!parsed.ok) throw new Error(`${labelsPath}:\n  ${parsed.errors.join("\n  ")}`);
    if (parsed.value.sha !== repo.sha) throw new Error(`${labelsPath} labels commit ${parsed.value.sha}, repos.json pins ${repo.sha}`);
    labels = parsed.value;
  }
  const todo = findings.filter((f) => !(f.id in labels.labels));
  process.stdout.write(`${String(todo.length)} of ${String(findings.length)} confirmed findings to label\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const [i, finding] of todo.entries()) {
      process.stdout.write(`\n──── ${String(i + 1)}/${String(todo.length)} ────\n${describeFinding(repoRoot(repo), finding)}\n`);
      const answer = (await rl.question("Real overlap? [t]rue / [f]alse / [u]nsure / [s]kip / [q]uit: ")).trim().toLowerCase();
      if (answer === "q") break;
      const label: Label | undefined = answer === "t" ? true : answer === "f" ? false : answer === "u" ? "unsure" : undefined;
      if (label === undefined) continue;
      labels = { ...labels, labels: { ...labels.labels, [finding.id]: label } };
      mkdirSync(join(BENCHMARKS, "labels"), { recursive: true });
      writeFileSync(labelsPath, `${JSON.stringify({ $schema: "../schema/labels.schema.json", ...labels }, null, 2)}\n`);
    }
  } finally {
    rl.close();
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error: unknown) => {
    process.stderr.write(`bench:label: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
