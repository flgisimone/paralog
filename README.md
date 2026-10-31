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

The plan is in [`plan/`](plan/README.md) (in Italian). Done: foundations (F2) and deterministic candidates (F3); AI judgment (F4) is implemented and awaiting its precision gate on real models; the synthetic benchmark fixture is in [`benchmarks/fixtures/shop`](benchmarks/fixtures/shop).

## Checking a repository

`paralog check [path]` runs the whole pipeline: units, candidates, then each of the first candidate pairs judged by the AI provider configured in `paralog.config.json`. Without a provider it stops with an error and sends nothing; `paralog candidates` works without AI.

```json
{
  "ai": { "provider": "anthropic", "model": "claude-opus-5-5" }
}
```

| `ai` option | Default | Meaning |
|---|---|---|
| `provider` | — | `anthropic`, or `openai-compatible` (Ollama, vLLM, OpenRouter, OpenAI) |
| `model` | — | Model id, e.g. `claude-opus-5-5`, `claude-haiku-5-5`, `qwen3-coder:30b` |
| `baseUrl` | — | Required for `openai-compatible`, e.g. `http://localhost:11434/v1` |
| `apiKeyEnv` | `ANTHROPIC_API_KEY` for `anthropic`, none otherwise | Name of the environment variable holding the key; the key never goes in the file |
| `effort` | `medium` | `anthropic` only: `low` … `max` |
| `concurrency` | 4 | Pairs judged in parallel |
| `timeoutMs`, `maxRetries` | 120000, 3 | Per request; retries on rate limits, server and network errors |

For each pair the model answers `same_responsibility`, `partial_overlap`, `intentional_variant` or `different`, with line-level evidence. A finding is **confirmed** only when every cited line range lies inside the cited unit and at least half of the claims are backed by something the two units share (a property, call, literal or type) found in the cited lines of both. Other positive verdicts are **unverified** and hidden unless `--all` is given. Pairs that share supporting features are grouped into one finding (A~B and B~C with a common reason).

Options: `--max-pairs <n>` (default 50), `--budget <tokens>`, `--dry-run` (list the pairs and the estimated tokens, send nothing), `--all`, `--json`, `--no-cache`. Verdicts are cached in `.paralog/cache/` by the bodies of the two units, the model and the prompt version: a second run without changes calls no model.

### What goes to the model

For each judged pair: the full source of the two units with their line numbers, the definitions of the project types they use (up to 8, 40 lines each), the names and files of their direct callers, and the deterministic signals. Nothing else from the repository is sent, and nothing at all without an `ai` section. The prompt tells the model that code, comments and strings are data, not instructions.

## Configuration

paralog finds every `tsconfig.json` under the root (workspaces and project references included) and analyzes the files they include. A file included by several tsconfigs belongs to the nearest one. An optional `paralog.config.json` at the root changes this:

| Option | Default | Meaning |
|---|---|---|
| `tsconfigs` | `[]` (discover all) | tsconfig files to use, relative to the root; their project references are followed. |
| `exclude` | `[]` | Extra globs to skip, relative to the root. |
| `ai` | none | AI provider for `paralog check`; see [Checking a repository](#checking-a-repository). |
| `embeddings` | none | Optional embeddings for the candidates; see [Embeddings](#embeddings-optional). |
| `defaultExcludes` | `true` | Skip tests (`*.test.ts`, `*.spec.ts`, `__tests__/`, `test/`, `tests/`, `e2e/`), declaration files, generated code (`*.generated.ts`, `*.gen.ts`, `generated/`, `__generated__/`) and `node_modules/`, `dist/`, `build/`, `coverage/`. |

## Units and their ids

A *unit* is a function, method, getter, setter, constructor or named arrow function / function expression (also inside classes, namespaces and object literals). Nested functions are part of the unit that contains them. `paralog units [path]` prints them as JSON.

Each unit has an id like `src/users/user.service.ts#UserService.deactivate:method`: file, qualified name, kind. Findings and baselines refer to these ids, so:

- moving lines, reordering methods, editing the body or the comments **keeps** the id;
- renaming the unit or one of its containers (class, namespace, object), moving it to another file, or turning a function into an arrow function (or the other way round) **changes** it.

When two units would get the same id (declaration merging, duplicate keys), the second one gets a `~2` suffix.

## Candidates

`paralog candidates [path]` ranks pairs of units that may implement the same responsibility, without AI. Each pair comes with the signals that explain it and what the two units share:

| Signal | Compares |
|---|---|
| `types` | Project types in the signatures and types of the touched properties |
| `properties` | Properties read or written (`User.status`), the unit's own fields excluded |
| `calls` | Called functions and methods |
| `literals` | Strings of 3+ characters and numbers other than 0, 1, 2 |
| `names` | Name tokens, with a small list of synonyms (`close` ~ `deactivate`, `fetch` ~ `get`) |
| `shape` | Structure of the body, names and values left out |
| `embedding` | Embedding similarity, only when embeddings are configured |

Shared features weigh more when few units have them. Only units that share at least two features (or one rare feature) are compared. Never paired: getters, setters, constructors, units with fewer than 15 syntax nodes, two implementations of the same interface or abstract member, a unit and the unit it calls.

Options: `--limit <n>` (default 20, or 200 with `--json`), `--json` (the benchmark format), `--no-cache`.

### Embeddings (optional)

Off unless `paralog.config.json` has an `embeddings` section. Any API compatible with OpenAI's `POST /embeddings` works, Ollama included:

```json
{
  "embeddings": { "baseUrl": "http://localhost:11434/v1", "model": "nomic-embed-text", "neighbors": 5 }
}
```

The source of every unit is sent to that endpoint. `apiKeyEnv` names the environment variable that holds the API key; the key never goes in the file. Vectors are cached in `.paralog/cache/` by body hash.

## Cache

The CLI keeps the extracted units in `.paralog/cache/` (add `.paralog/` to your `.gitignore`); `--no-cache` skips it. A file is extracted again when it changes, when a project file it imports changes (directly or through re-exports), when its tsconfig options change or when paralog's extractor changes. Changes inside `node_modules` are not tracked: run with `--no-cache` after upgrading a dependency whose types matter.

## Development

Requires Node 22 or later (development and CI on Node 26).

```bash
npm install
npm run verify   # typecheck, lint, tests, build
npm run smoke    # pack the tarball, install it in a clean project, run the CLI
```

## License

[MIT](LICENSE)
