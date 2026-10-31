/**
 * Judgment (F4): every selected candidate pair is judged by the configured model on the real
 * code; verdicts are checked against deterministic evidence and grouped into findings.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CACHE_DIR } from "../cache.js";
import type { Candidate } from "../candidates/index.js";
import type { CodeUnit, TypeDeclaration } from "../extract.js";
import { checkEvidence } from "./evidence.js";
import { buildFindings, type Finding, type JudgedPair } from "./findings.js";
import { buildPrompt, estimateTokens, parseVerdict, PROMPT_VERSION, SYSTEM_PROMPT, VERDICT_SCHEMA, type Verdict } from "./prompt.js";
import { mapWithConcurrency, type AIProvider, type Usage } from "./providers.js";

export * from "./evidence.js";
export * from "./findings.js";
export * from "./prompt.js";
export * from "./providers.js";

/** Output tokens assumed per pair when estimating costs. */
export const ESTIMATED_OUTPUT_TOKENS = 600;
const MAX_OUTPUT_TOKENS = 4000;

export class NoProviderError extends Error {
  override readonly name = "NoProviderError";
  constructor() {
    super("no AI provider configured: add an 'ai' section to paralog.config.json, or use --dry-run or paralog candidates");
  }
}

export interface JudgeOptions {
  readonly root: string;
  readonly units: readonly CodeUnit[];
  readonly types: readonly TypeDeclaration[];
  /** Ranked; the first `maxPairs` within the budget are judged. */
  readonly candidates: readonly Candidate[];
  /** Required unless `dryRun`. */
  readonly provider?: AIProvider;
  /** Default 50. */
  readonly maxPairs?: number;
  /** Maximum estimated tokens (input + output) spent on pairs not in the cache. */
  readonly budget?: number;
  /** Plan and estimate only: no request is sent. */
  readonly dryRun?: boolean;
  /** Reuse and update `.paralog/cache/verdicts.json`. Default false. */
  readonly cache?: boolean;
  /** Default 4. */
  readonly concurrency?: number;
  /** See `EvidenceOptions.minSupport`. */
  readonly minSupport?: number;
}

export interface PlannedPair {
  readonly candidate: Candidate;
  readonly estimatedTokens: number;
  /** A cached verdict exists: the pair costs nothing. */
  readonly cached: boolean;
}

export interface JudgeFailure {
  readonly a: string;
  readonly b: string;
  readonly error: string;
}

export interface JudgeResult {
  /** Pairs selected for judgment, in rank order. */
  readonly planned: readonly PlannedPair[];
  /** Candidates left out by `maxPairs` and by the budget. */
  readonly skipped: { readonly maxPairs: number; readonly budget: number };
  readonly judged: readonly JudgedPair[];
  readonly failures: readonly JudgeFailure[];
  readonly findings: readonly Finding[];
  readonly usage: Usage & { readonly requests: number; readonly cachedPairs: number };
}

interface CachedVerdict {
  /** Evidence lines are stored relative to the unit's first line, so moving the unit keeps them valid. */
  readonly verdict: Verdict;
  readonly model: string;
}

function shift(verdict: Verdict, a: CodeUnit, b: CodeUnit, sign: 1 | -1): Verdict {
  return {
    ...verdict,
    evidence: verdict.evidence.map((e) => ({
      ...e,
      linesA: [e.linesA[0] + sign * (a.startLine - 1), e.linesA[1] + sign * (a.startLine - 1)] as const,
      linesB: [e.linesB[0] + sign * (b.startLine - 1), e.linesB[1] + sign * (b.startLine - 1)] as const,
    })),
  };
}

class VerdictCache {
  private readonly path: string;
  private readonly entries = new Map<string, CachedVerdict>();
  private dirty = false;

  constructor(root: string) {
    this.path = join(root, CACHE_DIR, "verdicts.json");
    if (!existsSync(this.path)) return;
    try {
      const data = JSON.parse(readFileSync(this.path, "utf8")) as { promptVersion: number; entries: Record<string, CachedVerdict> };
      if (data.promptVersion !== PROMPT_VERSION) return;
      for (const [key, entry] of Object.entries(data.entries)) this.entries.set(key, entry);
    } catch {
      // Rebuilt from scratch.
    }
  }

  static key(provider: string, a: CodeUnit, b: CodeUnit): string {
    return createHash("sha256").update([String(PROMPT_VERSION), provider, a.bodyHash, b.bodyHash].join("\n")).digest("hex");
  }

  get(key: string, a: CodeUnit, b: CodeUnit): CachedVerdict | undefined {
    const entry = this.entries.get(key);
    return entry === undefined ? undefined : { ...entry, verdict: shift(entry.verdict, a, b, 1) };
  }

  set(key: string, a: CodeUnit, b: CodeUnit, entry: CachedVerdict): void {
    this.entries.set(key, { ...entry, verdict: shift(entry.verdict, a, b, -1) });
    this.dirty = true;
  }

  save(): void {
    if (!this.dirty) return;
    const entries = Object.fromEntries([...this.entries].sort(([x], [y]) => (x < y ? -1 : 1)));
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${String(process.pid)}.tmp`;
    writeFileSync(temporary, JSON.stringify({ promptVersion: PROMPT_VERSION, entries }));
    renameSync(temporary, this.path);
  }
}

export async function judge(options: JudgeOptions): Promise<JudgeResult> {
  const byId = new Map(options.units.map((u) => [u.id, u]));
  const providerId = options.provider?.id ?? "none";
  const cache = options.cache === true && options.provider !== undefined ? new VerdictCache(options.root) : undefined;
  const maxPairs = options.maxPairs ?? 50;

  const prompts = new Map<Candidate, string>();
  const planned: PlannedPair[] = [];
  let spent = 0;
  let skippedBudget = 0;
  for (const candidate of options.candidates.slice(0, maxPairs)) {
    const a = byId.get(candidate.a);
    const b = byId.get(candidate.b);
    if (a === undefined || b === undefined) continue;
    const prompt = buildPrompt({ a, b, candidate, units: options.units, types: options.types, root: options.root });
    const estimatedTokens = estimateTokens(SYSTEM_PROMPT) + estimateTokens(prompt) + ESTIMATED_OUTPUT_TOKENS;
    const cached = cache?.get(VerdictCache.key(providerId, a, b), a, b) !== undefined;
    if (!cached && options.budget !== undefined && spent + estimatedTokens > options.budget) {
      skippedBudget++;
      continue;
    }
    if (!cached) spent += estimatedTokens;
    prompts.set(candidate, prompt);
    planned.push({ candidate, estimatedTokens, cached });
  }
  const skipped = { maxPairs: Math.max(0, options.candidates.length - maxPairs), budget: skippedBudget };
  const empty = { inputTokens: 0, outputTokens: 0, requests: 0, cachedPairs: 0 };
  if (options.dryRun === true) return { planned, skipped, judged: [], failures: [], findings: [], usage: empty };
  const provider = options.provider;
  if (provider === undefined) throw new NoProviderError();

  const files = new Map<string, string[]>();
  const source = (file: string): string[] => {
    let lines = files.get(file);
    if (lines === undefined) {
      lines = readFileSync(resolve(options.root, file), "utf8").split("\n");
      files.set(file, lines);
    }
    return lines;
  };

  const failures: JudgeFailure[] = [];
  const usage = { ...empty };
  const results = await mapWithConcurrency(planned, options.concurrency ?? 4, async ({ candidate }) => {
    const a = byId.get(candidate.a);
    const b = byId.get(candidate.b);
    if (a === undefined || b === undefined) return undefined;
    const key = VerdictCache.key(provider.id, a, b);
    let entry = cache?.get(key, a, b);
    let pairUsage: Usage = { inputTokens: 0, outputTokens: 0 };
    const fromCache = entry !== undefined;
    if (entry === undefined) {
      try {
        const result = await provider.generate({
          system: SYSTEM_PROMPT,
          prompt: prompts.get(candidate) ?? "",
          schema: VERDICT_SCHEMA,
          maxTokens: MAX_OUTPUT_TOKENS,
        });
        usage.requests++;
        usage.inputTokens += result.usage.inputTokens;
        usage.outputTokens += result.usage.outputTokens;
        pairUsage = result.usage;
        entry = { verdict: parseVerdict(result.output), model: result.model };
        cache?.set(key, a, b, entry);
      } catch (error) {
        failures.push({ a: a.id, b: b.id, error: error instanceof Error ? error.message : String(error) });
        return undefined;
      }
    } else {
      usage.cachedPairs++;
    }
    const check = checkEvidence(entry.verdict, a, b, candidate.shared, source(a.file), source(b.file), {
      ...(options.minSupport === undefined ? {} : { minSupport: options.minSupport }),
    });
    const judged: JudgedPair = { candidate, a, b, verdict: entry.verdict, check, model: entry.model, usage: pairUsage, cached: fromCache };
    return judged;
  });
  cache?.save();
  const judged = results.filter((r): r is JudgedPair => r !== undefined);
  return { planned, skipped, judged, failures, findings: buildFindings(judged), usage };
}
