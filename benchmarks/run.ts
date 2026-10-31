/**
 * Produces a paralog run on the benchmark targets, in the layout `npm run bench` scores:
 * candidates on every fixture and, when an AI provider is given, findings on the fixtures and
 * (with `real`) on the fetched real repositories.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyze } from "../src/analyze.js";
import { findCandidates, type CandidateOptions } from "../src/candidates/index.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/config.js";
import { extractUnits } from "../src/extract.js";
import { createProvider, type AIConfig, type AIProvider, type Finding } from "../src/judge/index.js";
import { VERSION } from "../src/version.js";
import { loadRepos, repoRoot } from "./real.js";
import type { CandidatesFile, FindingsFile } from "./schema.js";

const BENCHMARKS = import.meta.dirname;

export function fixtureNames(): string[] {
  return readdirSync(join(BENCHMARKS, "fixtures"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Candidates of paralog on one fixture, in the scorer format. */
export function fixtureCandidates(fixture: string, options: CandidateOptions = {}): CandidatesFile {
  const { units } = extractUnits({ root: join(BENCHMARKS, "fixtures", fixture) });
  const { candidates } = findCandidates(units, options);
  return {
    tool: `paralog ${VERSION}`,
    candidates: candidates.map((c) => ({ members: [c.a, c.b], score: c.score, signals: { ...c.signals }, shared: { ...c.shared } })),
  };
}

/** Reads the `ai` section from a JSON file: either `{ "ai": {...} }` or the section itself. */
export function loadAiConfig(path: string): AIConfig {
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const ai = parseConfig({ ai: "ai" in data ? data.ai : data }).ai;
  if (ai === undefined) throw new Error(`${path} has no AI configuration`);
  return ai;
}

/**
 * Findings of paralog on one directory: in the scorer format (all statuses) and in full, as
 * `report.json`, for the labelling tool.
 */
export async function directoryFindings(
  root: string,
  provider: AIProvider,
  maxPairs: number,
): Promise<{ scored: FindingsFile; report: readonly Finding[] }> {
  const started = performance.now();
  // The benchmark ignores the repository's own paralog.config.json and caches nothing.
  const { judgment } = await analyze({ root, config: DEFAULT_CONFIG, provider, maxPairs });
  const scored: FindingsFile = {
    tool: `paralog ${VERSION}`,
    model: judgment.judged[0]?.model ?? provider.id,
    findings: judgment.findings.map((f) => ({ id: f.id, status: f.status, members: f.members.map((m) => m.id) })),
    usage: {
      inputTokens: judgment.usage.inputTokens,
      outputTokens: judgment.usage.outputTokens,
      seconds: Math.round((performance.now() - started) / 100) / 10,
    },
  };
  return { scored, report: judgment.findings };
}

async function writeFindings(dir: string, root: string, provider: AIProvider, maxPairs: number): Promise<void> {
  const { scored, report } = await directoryFindings(root, provider, maxPairs);
  write(join(dir, "findings.json"), scored);
  write(join(dir, "report.json"), report);
}

export interface RunOptions {
  readonly candidates?: CandidateOptions;
  /** When set, findings are produced too. */
  readonly ai?: AIConfig;
  /** Also run on the fetched real repositories (needs `ai`). */
  readonly real?: boolean;
  /** Pairs judged per target. Default 50. */
  readonly maxPairs?: number;
  readonly log?: (line: string) => void;
}

function write(path: string, data: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

export async function generateRun(runDir: string, options: RunOptions = {}): Promise<void> {
  rmSync(runDir, { recursive: true, force: true });
  const provider = options.ai === undefined ? undefined : createProvider(options.ai);
  const maxPairs = options.maxPairs ?? 50;
  const log = options.log ?? (() => undefined);
  for (const fixture of fixtureNames()) {
    const dir = join(runDir, "fixtures", fixture);
    write(join(dir, "candidates.json"), fixtureCandidates(fixture, options.candidates));
    if (provider !== undefined) {
      log(`judging fixture ${fixture}`);
      await writeFindings(dir, join(BENCHMARKS, "fixtures", fixture), provider, maxPairs);
    }
  }
  if (provider === undefined || options.real !== true) return;
  for (const repo of loadRepos()) {
    const root = repoRoot(repo);
    if (!existsSync(root)) {
      log(`skipping ${repo.name}: not fetched (npm run bench:fetch)`);
      continue;
    }
    log(`judging ${repo.name}`);
    await writeFindings(join(runDir, "real", repo.name), root, provider, maxPairs);
  }
}
