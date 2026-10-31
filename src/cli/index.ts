import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { embeddingNeighbors, findCandidates, OpenAICompatibleEmbedder, SIGNAL_NAMES, type Candidate } from "../candidates/index.js";
import { loadConfig } from "../config.js";
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
  candidates [path]  Rank pairs of units that may implement the same responsibility
                     (deterministic, no AI); path defaults to "."
  units [path]       Print the extracted units as JSON (debugging)

Options:
  --json         candidates: print JSON (the benchmark format) instead of text
  --limit <n>    candidates: how many pairs to print (default 20, JSON 200)
  --no-cache     Do not read or write .paralog/cache
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
    let limit: number | undefined;
    if (values.limit !== undefined) {
      limit = Number(values.limit);
      if (!Number.isInteger(limit) || limit < 1) return fail(io, "--limit must be a positive integer");
    }
    return await candidates(positionals.slice(1), io, { cache, json: values.json === true, limit });
  }
  io.stderr(`paralog: unknown command '${command}'\n`);
  io.stderr("Run 'paralog --help' for usage.\n");
  return ExitCode.Error;
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
