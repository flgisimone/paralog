# AGENTS.md

Guide for coding agents working **on** paralog.

## Start here

1. Read [`plan/README.md`](plan/README.md): scope, decisions, phases and task format.
2. Read the file of the phase you are working on (`plan/0<n>-*.md`) and pick the task by ID.
3. Follow [`CONVENTIONS.md`](CONVENTIONS.md).

## Commands

| Command | What it does |
|---|---|
| `npm run verify` | Typecheck, lint, tests, build. Run before every commit. |
| `npm test` | Vitest only. |
| `npm run smoke` | Packs the tarball, installs it in a clean project and runs the CLI. |
| `npm run build` | Rollup build into `dist/`. |

## Layout

| Path | Content |
|---|---|
| `src/index.ts` | Library entry point (`paralog`). |
| `src/mcp/` | MCP server entry point (`paralog/mcp`). |
| `src/cli/` | CLI (`paralog` bin); `main.ts` is the process wrapper, `index.ts` is testable. |
| `benchmarks/` | Benchmark formats, fixtures, real repositories, scorer. |
| `tests/` | Unit and integration tests. |
| `plan/` | Backlog in Italian. |

## Rules

- One working session per phase; update the phase **Stato** when it closes.
- Scope is semantic duplication and overlapping responsibilities only: do not add static detectors (cycles, dead code, complexity).
- Precision beats recall: when in doubt, do not report.
- Do not publish to npm; the maintainer does.
