import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { extractUnits } from "../extract.js";
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
  units [path]   Print the extracted units as JSON (debugging); path defaults to "."

Options:
  -h, --help     Show this help
  -v, --version  Show the version

paralog is a work in progress: more commands arrive with the next releases.
https://github.com/flgisimone/paralog
`;

/** Runs the CLI with the given arguments (without `node` and the script path). */
export function run(argv: readonly string[], io: CliIO): ExitCode {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
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
  if (command === "units") return units(positionals.slice(1), io);
  io.stderr(`paralog: unknown command '${command}'\n`);
  io.stderr("Run 'paralog --help' for usage.\n");
  return ExitCode.Error;
}

function fail(io: CliIO, message: string): ExitCode {
  io.stderr(`paralog: ${message}\n`);
  return ExitCode.Error;
}

function units(args: readonly string[], io: CliIO): ExitCode {
  if (args.length > 1) return fail(io, "units takes at most one path");
  const root = resolve(args[0] ?? ".");
  if (!existsSync(root) || !statSync(root).isDirectory()) return fail(io, `not a directory: ${root}`);
  const started = performance.now();
  let extraction;
  try {
    extraction = extractUnits({ root });
  } catch (error) {
    return fail(io, error instanceof Error ? error.message : String(error));
  }
  const { discovery, units } = extraction;
  for (const warning of discovery.warnings) io.stderr(`warning: ${warning}\n`);
  const files = discovery.projects.reduce((n, p) => n + p.files.length, 0);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  io.stderr(
    `${units.length} units from ${files} files in ${discovery.projects.length} projects (${discovery.excludedFiles} files excluded) in ${seconds}s\n`,
  );
  io.stdout(`${JSON.stringify(units, null, 2)}\n`);
  return ExitCode.Ok;
}
