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

The plan is in [`plan/`](plan/README.md) (in Italian). Current work: benchmark (F1) and foundations (F2).

## Development

Requires Node 22 or later (development and CI on Node 26).

```bash
npm install
npm run verify   # typecheck, lint, tests, build
npm run smoke    # pack the tarball, install it in a clean project, run the CLI
```

## License

[MIT](LICENSE)
