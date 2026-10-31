# Conventions

Rules every change follows. The plan and its decisions are in [`plan/README.md`](plan/README.md).

## Language

- English for code, CLI output, error messages, README, prompts and commit messages.
- Italian for `plan/`.

## Code

- TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), ESM only, Node 22 or later.
- Node built-ins with the `node:` prefix. New runtime dependencies need a reason in the commit message.
- No `any`; validate external data (config files, model output, JSON on disk) at the boundary.
- Small modules with one responsibility; public types live next to the code that produces them.
- paralog never writes into the user's code. It writes only `.paralog/` and, with `init`, the agent configuration files.
- No code is sent to a model without an explicitly configured provider; API keys come only from environment variables and never appear in logs or errors.
- Comments explain *why*, not *what*.

## CLI

- Exit codes: `0` within limits, `1` over limits, `2` for errors.
- Machine-readable output (`--json`, `--sarif`) is stable: field changes are breaking changes.

## Tests

- Vitest. Every signal or rule has tests for the case to find **and** for the similar cases not to report.
- Tests never call the network; AI providers are faked.
- Changes to candidates or judgment run `npm run bench` and must not lower precision or recall against `develop` without a reason written in the phase status.

## Definition of Done

- `npm run verify` passes.
- New options and defaults are documented in the README.
- Behavior changes are in `CHANGELOG.md` under `Unreleased`.
- The task status is updated in its `plan/` file when a phase closes.

## Git

- One branch per phase: `fase/f<n>-<slug>` from `develop`; merge `--no-ff` into `develop` at the end of the phase.
- Commit messages in the imperative mood, with the task ID when there is one: `F2-03 Extract touched properties`.
