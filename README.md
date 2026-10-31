# paralog

> **Work in progress.** Nothing is usable yet: the first release (0.1.0) ships only after the benchmark shows that the findings are worth reading.

paralog finds the business logic your TypeScript codebase already has twice — even when the two copies are written differently — and tells your agent before it writes it a third time.

A *paralog* is a gene duplicated inside the same genome that then diverges: different shape, similar function. That is the case of `UserService.deactivate()` and `AccountManager.closeAccount()`.

## What it will do

- Extract functions and methods with resolved types (TypeScript Compiler API via ts-morph).
- Pick candidate pairs with deterministic, explainable signals: shared domain types, touched properties, calls, literals, names.
- Ask an LLM **you configure** to judge each candidate pair on the real code, then show only the findings whose evidence paralog can verify.
- Expose everything to the developer (CLI, JSON, SARIF, markdown) and to coding agents (MCP over stdio), including `paralog_similar`: "does this already exist?" before writing new code.

## What it will not do

- It is not a linter, a clone detector, a dead-code finder or a complexity meter: use [Fallow](https://github.com/fallow-rs), knip, dependency-cruiser and jscpd for those.
- It never modifies your code. It finds, explains and verifies; your agent fixes.
- It never sends code to a model unless you configure a provider explicitly.

## Status

The plan is in [`plan/`](plan/README.md) (in Italian). Current work: benchmark (F1) and foundations (F2); the synthetic benchmark fixture is in [`benchmarks/fixtures/shop`](benchmarks/fixtures/shop).

## Configuration

paralog finds every `tsconfig.json` under the root (workspaces and project references included) and analyzes the files they include. A file included by several tsconfigs belongs to the nearest one. An optional `paralog.config.json` at the root changes this:

| Option | Default | Meaning |
|---|---|---|
| `tsconfigs` | `[]` (discover all) | tsconfig files to use, relative to the root; their project references are followed. |
| `exclude` | `[]` | Extra globs to skip, relative to the root. |
| `defaultExcludes` | `true` | Skip tests (`*.test.ts`, `*.spec.ts`, `__tests__/`, `test/`, `tests/`, `e2e/`), declaration files, generated code (`*.generated.ts`, `*.gen.ts`, `generated/`, `__generated__/`) and `node_modules/`, `dist/`, `build/`, `coverage/`. |

## Units and their ids

A *unit* is a function, method, getter, setter, constructor or named arrow function / function expression (also inside classes, namespaces and object literals). Nested functions are part of the unit that contains them. `paralog units [path]` prints them as JSON.

Each unit has an id like `src/users/user.service.ts#UserService.deactivate:method`: file, qualified name, kind. Findings and baselines refer to these ids, so:

- moving lines, reordering methods, editing the body or the comments **keeps** the id;
- renaming the unit or one of its containers (class, namespace, object), moving it to another file, or turning a function into an arrow function (or the other way round) **changes** it.

When two units would get the same id (declaration merging, duplicate keys), the second one gets a `~2` suffix.

## Development

Requires Node 22 or later (development and CI on Node 26).

```bash
npm install
npm run verify   # typecheck, lint, tests, build
npm run smoke    # pack the tarball, install it in a clean project, run the CLI
```

## License

[MIT](LICENSE)
