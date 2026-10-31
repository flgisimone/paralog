import { parseArgs } from "node:util";
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
  paralog [options]

Options:
  -h, --help     Show this help
  -v, --version  Show the version

paralog is a work in progress: commands arrive with the next releases.
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
  io.stderr(`paralog: unknown command '${command}'\n`);
  io.stderr("Run 'paralog --help' for usage.\n");
  return ExitCode.Error;
}
