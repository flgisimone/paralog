# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Package scaffold with the `paralog` and `paralog/mcp` entry points and the `paralog` bin (`--version`, `--help`).
- Project discovery: every `tsconfig.json` under the root (workspaces, project references), each file assigned to the nearest tsconfig; tests, declarations, generated files and build output excluded by default; `paralog.config.json` with `tsconfigs`, `exclude`, `defaultExcludes`.
- Unit extraction with ts-morph: functions, methods, accessors, constructors and named arrow functions, with resolved parameter and return types, touched properties qualified by their declaring type, resolved calls, non-trivial literals, implemented interface members, statement count and a formatting-insensitive body hash.
- `paralog units [path]` prints the units as JSON.
- `paralog candidates [path]`: ranked pairs of units with explainable signals (types, properties, calls, literals, names, body shape), blocking on shared features, exclusions for accessors, constructors, trivial units, implementations of the same interface member and direct calls; `--json`, `--limit`.
- Optional embeddings for the candidates through any OpenAI-compatible `/embeddings` API, configured in `paralog.config.json`.
- Units also record `domainTypes`, `nodes` and `shape`.
- Unit cache in `.paralog/cache/`, keyed by each file and the project files it imports; `--no-cache` to skip it.
- Benchmark fixture `shop`: two packages, 25 annotated overlaps at four difficulty levels and 15 near-misses.
- Benchmark annotation formats (`benchmarks/schema.ts`, JSON Schemas) with validation.

## [0.0.1]

- Name placeholder.
