import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { embeddingNeighbors, findCandidates, OpenAICompatibleEmbedder, SIGNAL_NAMES, type Candidate } from "../candidates/index.js";
import { analyze } from "../analyze.js";
import { loadConfig } from "../config.js";
import type { Finding } from "../judge/index.js";
import { extractUnits, type Extraction } from "../extract.js";
import { VERSION } from "../version.js";

/** Exit codes shared by every command: 0 within limits, 1 over limits, 2 for errors. */
export const ExitCode = {
  Ok: 0,
  OverLimits: 1,
  Error: 2,
} as const;
export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export interface CliIO {
  stdout(text: string): void;
  stderr(text: string): void;
}

export const HELP = `paralog ${VERSION}
Finds duplicated business logic and overlapping responsibilities in TypeScript repositories.

Usage:
  paralog <command> [path] [options]

Commands:
  check [path]       Find duplicated business logic: candidates judged by the configured
                     AI provider, findings with verified evidence
  candidates [path]  Rank pairs of units that may implement the same responsibility
                     (deterministic, no AI); path defaults to "."
  units [path]       Print the extracted units as JSON (debugging)

Options:
  --json            check, candidates: print JSON (the benchmark format) instead of text
  --all             check: also show unverified findings
  --dry-run         check: list the pairs to judge and the estimated tokens; send nothing
  --max-pairs <n>   check: pairs to judge at most (default 50)
  --budget <n>      check: estimated tokens to spend at most on pairs not in the cache
  --limit <n>       candidates: how many pairs to print (default 20, JSON 200)
  --no-cache        Do not read or write .paralog/cache
  -h, --help     Show this help
  -v, --version  Show the version

paralog is a work in progress: more commands arrive with the next releases.
https://github.com/flgisimone/paralog
`;

/** Runs the CLI with the given arguments (without `node` and the script path). */
export async function run(argv: readonly string[], io: CliIO): Promise<ExitCode> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        "no-cache": { type: "boolean" },
        json: { type: "boolean" },
        limit: { type: "string" },
        all: { type: "boolean" },
        "dry-run": { type: "boolean" },
        "max-pairs": { type: "string" },
        budget: { type: "string" },
      },
    });
  } catch (error) {
    io.stderr(`paralog: ${error instanceof Error ? error.message : String(error)}\n`);
    io.stderr("Run 'paralog --help' for usage.\n");
    return ExitCode.Error;
  }

  const { values, positionals } = parsed;
  if (values.version === true) {
    io.stdout(`${VERSION}\n`);
    return ExitCode.Ok;
  }
  const [command] = positionals;
  if (command === undefined || command === "help" || values.help === true) {
    io.stdout(HELP);
    return ExitCode.Ok;
  }
  const cache = values["no-cache"] !== true;
  if (command === "units") return units(positionals.slice(1), io, { cache });
  if (command === "candidates") {
    const limit = parsePositive(values.limit);
    if (limit === null) return fail(io, "--limit must be a positive integer");
    return await candidates(positionals.slice(1), io, { cache, json: values.json === true, limit });
  }
  if (command === "check") {
    const maxPairs = parsePositive(values["max-pairs"]);
    const budget = parsePositive(values.budget);
    if (maxPairs === null) return fail(io, "--max-pairs must be a positive integer");
    if (budget === null) return fail(io, "--budget must be a positive integer");
    return await check(positionals.slice(1), io, {
      cache,
      json: values.json === true,
      all: values.all === true,
      dryRun: values["dry-run"] === true,
      maxPairs,
      budget,
    });
  }
  io.stderr(`paralog: unknown command '${command}'\n`);
  io.stderr("Run 'paralog --help' for usage.\n");
  return ExitCode.Error;
}

/** undefined when absent, null when not a positive integer. */
function parsePositive(value: string | undefined): number | undefined | null {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function fail(io: CliIO, message: string): ExitCode {
  io.stderr(`paralog: ${message}\n`);
  return ExitCode.Error;
}

/** Extracts the units of the directory given as the only positional argument; reports on stderr. */
function extract(command: string, args: readonly string[], io: CliIO, cache: boolean): Extraction | ExitCode {
  if (args.length > 1) return fail(io, `${command} takes at most one path`);
  const root = resolve(args[0] ?? ".");
  if (!existsSync(root) || !statSync(root).isDirectory()) return fail(io, `not a directory: ${root}`);
  const started = performance.now();
  let extraction;
  try {
    extraction = extractUnits({ root, cache });
  } catch (error) {
    return fail(io, error instanceof Error ? error.message : String(error));
  }
  const { discovery, units, stats } = extraction;
  for (const warning of discovery.warnings) io.stderr(`warning: ${warning}\n`);
  const files = discovery.projects.reduce((n, p) => n + p.files.length, 0);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  io.stderr(
    `${units.length} units from ${files} files in ${discovery.projects.length} projects (${discovery.excludedFiles} files excluded, ${stats.cachedFiles} cached) in ${seconds}s\n`,
  );
  return extraction;
}

function units(args: readonly string[], io: CliIO, options: { cache: boolean }): ExitCode {
  const extraction = extract("units", args, io, options.cache);
  if (typeof extraction === "number") return extraction;
  io.stdout(`${JSON.stringify(extraction.units, null, 2)}\n`);
  return ExitCode.Ok;
}

function formatCandidate(candidate: Candidate, rank: number): string {
  const signals = SIGNAL_NAMES.filter((name) => candidate.signals[name] > 0)
    .map((name) => `${name} ${candidate.signals[name].toFixed(2)}`)
    .join(" · ");
  const shared = [
    ...candidate.shared.types,
    ...candidate.shared.properties,
    ...candidate.shared.calls.map((c) => c.slice(c.indexOf("#") + 1)),
    ...candidate.shared.literals,
  ];
  const lines = [
    `${String(rank).padStart(3)}. ${candidate.score.toFixed(2)}  ${candidate.a}`,
    `           ${candidate.b}`,
    `           ${signals}`,
  ];
  if (shared.length > 0) lines.push(`           shared: ${[...new Set(shared)].slice(0, 8).join(", ")}`);
  return lines.join("\n");
}

async function candidates(
  args: readonly string[],
  io: CliIO,
  options: { cache: boolean; json: boolean; limit: number | undefined },
): Promise<ExitCode> {
  const extraction = extract("candidates", args, io, options.cache);
  if (typeof extraction === "number") return extraction;
  const limit = options.limit ?? (options.json ? 200 : 20);
  const embeddings = loadConfig(extraction.discovery.root).embeddings;
  let similarities: Map<string, number> | undefined;
  if (embeddings !== undefined) {
    try {
      similarities = await embeddingNeighbors(extraction.units, {
        root: extraction.discovery.root,
        embedder: new OpenAICompatibleEmbedder(embeddings),
        cache: options.cache,
        ...(embeddings.neighbors === undefined ? {} : { neighbors: embeddings.neighbors }),
      });
    } catch (error) {
      return fail(io, `embeddings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const result = findCandidates(extraction.units, { limit, ...(similarities === undefined ? {} : { similarities }) });
  const { stats } = result;
  io.stderr(
    `${String(stats.comparedPairs)} of ${String(stats.possiblePairs)} pairs compared, ${String(result.candidates.length)} candidates\n`,
  );
  if (options.json) {
    const output = {
      tool: `paralog ${VERSION}`,
      candidates: result.candidates.map((c) => ({ members: [c.a, c.b], score: c.score, signals: c.signals, shared: c.shared })),
      stats,
    };
    io.stdout(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    io.stdout(result.candidates.map((c, i) => formatCandidate(c, i + 1)).join("\n\n") + (result.candidates.length > 0 ? "\n" : ""));
  }
  return ExitCode.Ok;
}

function formatFinding(finding: Finding): string {
  const lines = [
    `[${finding.severity}] ${finding.kind}${finding.status === "confirmed" ? "" : ` (${finding.status})`}  ${finding.id}`,
    `  ${finding.sharedResponsibility}`,
    ...finding.members.map((m) => `  - ${m.file}:${String(m.startLine)}-${String(m.endLine)}  ${m.name}`),
  ];
  if (finding.evidence.length > 0) {
    lines.push("  evidence:");
    for (const e of finding.evidence) {
      const backed = e.support.length > 0 ? ` backed by ${e.support.slice(0, 3).join(", ")}` : " (not backed by shared code)";
      lines.push(`    · ${e.claim} (lines ${String(e.linesA[0])}-${String(e.linesA[1])} and ${String(e.linesB[0])}-${String(e.linesB[1])})${backed}`);
    }
  }
  if (finding.differences.length > 0) lines.push(`  differences: ${finding.differences.join("; ")}`);
  if (finding.suggestion !== "") lines.push(`  suggestion: ${finding.suggestion}`);
  if (finding.reasons.length > 0) lines.push(`  not confirmed: ${finding.reasons.join("; ")}`);
  return lines.join("\n");
}

async function check(
  args: readonly string[],
  io: CliIO,
  options: { cache: boolean; json: boolean; all: boolean; dryRun: boolean; maxPairs: number | undefined; budget: number | undefined },
): Promise<ExitCode> {
  if (args.length > 1) return fail(io, "check takes at most one path");
  const root = resolve(args[0] ?? ".");
  if (!existsSync(root) || !statSync(root).isDirectory()) return fail(io, `not a directory: ${root}`);
  const started = performance.now();
  let analysis;
  try {
    analysis = await analyze({
      root,
      cache: options.cache,
      dryRun: options.dryRun,
      ...(options.maxPairs === undefined ? {} : { maxPairs: options.maxPairs }),
      ...(options.budget === undefined ? {} : { budget: options.budget }),
    });
  } catch (error) {
    return fail(io, error instanceof Error ? error.message : String(error));
  }
  const { extraction, candidates, judgment } = analysis;
  for (const warning of extraction.discovery.warnings) io.stderr(`warning: ${warning}\n`);
  const seconds = (performance.now() - started) / 1000;

  if (options.dryRun) {
    const fresh = judgment.planned.filter((p) => !p.cached);
    const tokens = fresh.reduce((n, p) => n + p.estimatedTokens, 0);
    if (options.json) {
      io.stdout(`${JSON.stringify({ planned: judgment.planned.map((p) => ({ members: [p.candidate.a, p.candidate.b], estimatedTokens: p.estimatedTokens, cached: p.cached })), skipped: judgment.skipped, estimatedTokens: tokens }, null, 2)}\n`);
    } else {
      judgment.planned.forEach((p, i) => {
        io.stdout(`${String(i + 1).padStart(3)}. ${p.cached ? "cached" : `~${String(p.estimatedTokens)} tokens`}  ${p.candidate.a}  ~  ${p.candidate.b}\n`);
      });
      io.stdout(`\n${String(judgment.planned.length)} pairs to judge (${String(judgment.planned.length - fresh.length)} cached), about ${String(tokens)} tokens; ${String(judgment.skipped.maxPairs)} left out by --max-pairs, ${String(judgment.skipped.budget)} by --budget\n`);
    }
    return ExitCode.Ok;
  }

  for (const failure of judgment.failures) io.stderr(`warning: could not judge ${failure.a} ~ ${failure.b}: ${failure.error}\n`);
  const { usage } = judgment;
  const confirmed = judgment.findings.filter((f) => f.status === "confirmed");
  const unverified = judgment.findings.filter((f) => f.status === "unverified");
  io.stderr(
    `${String(candidates.candidates.length)} candidates, ${String(judgment.judged.length)} pairs judged (${String(usage.cachedPairs)} cached, ${String(usage.inputTokens + usage.outputTokens)} tokens) in ${seconds.toFixed(1)}s\n`,
  );
  if (options.json) {
    const output = {
      tool: `paralog ${VERSION}`,
      model: judgment.judged[0]?.model,
      findings: judgment.findings,
      usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, seconds: Math.round(seconds * 10) / 10 },
      failures: judgment.failures,
    };
    io.stdout(`${JSON.stringify(output, null, 2)}\n`);
    return ExitCode.Ok;
  }
  const shown = options.all ? judgment.findings : confirmed;
  io.stdout(shown.map(formatFinding).join("\n\n") + (shown.length > 0 ? "\n\n" : ""));
  const hidden = options.all || unverified.length === 0 ? "" : `, ${String(unverified.length)} unverified hidden (--all to show)`;
  io.stdout(`${String(confirmed.length)} confirmed findings${hidden}\n`);
  return ExitCode.Ok;
}
