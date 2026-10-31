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
| `npm run bench` | Produces the current paralog run on the fixtures and scores it. |
| `npm run bench -- --run <dir>` | Scores an existing run (see `benchmarks/README.md`). |
| `npm run bench:baselines` | Runs jscpd and Fallow on the fixtures and scores them (needs network for npx). |
| `npm run bench:fetch` | Downloads the real repositories of `benchmarks/real/repos.json` at their pinned commits. |
| `npm run bench:units` | Extraction time and memory on the real repositories, cold and warm. |

## Layout

| Path | Content |
|---|---|
| `src/index.ts` | Library entry point (`paralog`). |
| `src/mcp/` | MCP server entry point (`paralog/mcp`). |
| `src/cli/` | CLI (`paralog` bin); `main.ts` is the process wrapper, `index.ts` is testable. |
| `src/config.ts`, `src/discovery.ts` | `paralog.config.json` and tsconfig discovery. |
| `src/extract.ts` | Unit extraction with ts-morph. |
| `src/candidates/` | Candidates (F3): `names.ts` (name tokens), `signals.ts`, `embeddings.ts`, `index.ts` (blocking, exclusions, ranking). |
| `src/cache.ts` | `.paralog/cache/`: units per file, keyed by the file and its project imports. |
| `benchmarks/` | Benchmark formats, fixtures, real repositories, scorer. |
| `benchmarks/fixtures/shop/` | Synthetic fixture; `annotations.json` lists the expected overlaps and near-misses. Not type-checked or linted by the repository config: `benchmarks/fixtures.test.ts` checks it. |
| `tests/` | Unit and integration tests. |
| `plan/` | Backlog in Italian. |

## Rules

- One working session per phase; update the phase **Stato** when it closes.
- When a phase is finished (`npm run verify` green, status updated), merge its branch into `develop` with `git merge --no-ff` and push `develop`. Phases are never merged half done.
- Scope is semantic duplication and overlapping responsibilities only: do not add static detectors (cycles, dead code, complexity).
- Precision beats recall: when in doubt, do not report.
- Do not publish to npm; the maintainer does.
- When you change the fixture, keep `annotations.json` in sync; adding a case never weakens an existing one.
