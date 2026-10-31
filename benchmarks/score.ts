/**
 * Benchmark scorer (F1-05): pure functions from annotations, labels and run outputs to scores.
 *
 * Matching rule: a candidate pair or a finding hits an overlap (or a near-miss) when at least
 * two of its members are distinct members of that case. Units are compared by `file#Name`,
 * so unit ids with or without the `:kind` suffix both work.
 */
import type { Annotations, CandidatesFile, Difficulty, FindingsFile, Labels, Usage } from "./schema.js";

export const DEFAULT_KS: readonly number[] = [10, 25, 50, 100, 200];
const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4];

/** `src/a.ts#A.b:method~2` → `src/a.ts#A.b` */
export function unitKey(ref: string): string {
  return ref.replace(/~\d+$/, "").replace(/:(?:function|arrow|method|getter|setter|constructor)$/, "");
}

interface Case {
  readonly id: string;
  readonly keys: ReadonlySet<string>;
}

function toCases(cases: readonly { id: string; members: readonly { file: string; symbol: string }[] }[]): Case[] {
  return cases.map((c) => ({ id: c.id, keys: new Set(c.members.map((m) => `${m.file}#${m.symbol}`)) }));
}

/** Ids of the cases hit by a group of units, in annotation order. */
function hits(cases: readonly Case[], members: readonly string[]): string[] {
  const keys = [...new Set(members.map(unitKey))];
  return cases.filter((c) => keys.filter((k) => c.keys.has(k)).length >= 2).map((c) => c.id);
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export interface DifficultyRecall {
  readonly difficulty: Difficulty;
  readonly total: number;
  readonly found: number;
  readonly recall: number | null;
}

function byDifficulty(annotations: Annotations, found: ReadonlySet<string>): DifficultyRecall[] {
  return DIFFICULTIES.map((difficulty) => {
    const cases = annotations.overlaps.filter((o) => o.difficulty === difficulty);
    const hit = cases.filter((o) => found.has(o.id)).length;
    return { difficulty, total: cases.length, found: hit, recall: ratio(hit, cases.length) };
  });
}

export interface RecallAtK {
  readonly k: number;
  readonly recall: number | null;
  readonly byDifficulty: readonly DifficultyRecall[];
  /** Near-misses with a pair in the first K candidates. */
  readonly nearMisses: number;
}

export interface CandidateScore {
  readonly tool: string;
  readonly candidates: number;
  readonly recallAtK: readonly RecallAtK[];
  /** 1-based rank of the first candidate hitting each overlap; null when none does. */
  readonly firstHitRank: Readonly<Record<string, number | null>>;
}

export function scoreCandidates(
  annotations: Annotations,
  run: CandidatesFile,
  ks: readonly number[] = DEFAULT_KS,
): CandidateScore {
  const overlaps = toCases(annotations.overlaps);
  const nearMisses = toCases(annotations.nearMisses);
  const firstHit = new Map<string, number>();
  const firstNearMiss = new Map<string, number>();
  run.candidates.forEach((candidate, index) => {
    for (const id of hits(overlaps, candidate.members)) if (!firstHit.has(id)) firstHit.set(id, index + 1);
    for (const id of hits(nearMisses, candidate.members)) if (!firstNearMiss.has(id)) firstNearMiss.set(id, index + 1);
  });

  const recallAtK = ks.map((k) => {
    const found = new Set([...firstHit].filter(([, rank]) => rank <= k).map(([id]) => id));
    return {
      k,
      recall: ratio(found.size, overlaps.length),
      byDifficulty: byDifficulty(annotations, found),
      nearMisses: [...firstNearMiss.values()].filter((rank) => rank <= k).length,
    };
  });
  const firstHitRank = Object.fromEntries(annotations.overlaps.map((o) => [o.id, firstHit.get(o.id) ?? null]));
  return { tool: run.tool, candidates: run.candidates.length, recallAtK, firstHitRank };
}

export interface FindingScore {
  readonly tool: string;
  readonly model: string | null;
  /** Findings scored: confirmed only, or every status with `includeUnverified`. */
  readonly considered: number;
  readonly byStatus: Readonly<Record<"confirmed" | "unverified" | "rejected", number>>;
  readonly truePositives: number;
  readonly falsePositives: number;
  /** False positives that pair members of an annotated near-miss. */
  readonly nearMissHits: number;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly byDifficulty: readonly DifficultyRecall[];
  readonly missedOverlaps: readonly string[];
  readonly falsePositiveIds: readonly string[];
  /** Unverified findings that would have been true positives (lost to evidence checks). */
  readonly unverifiedHits: number;
}

export function scoreFindings(
  annotations: Annotations,
  run: FindingsFile,
  options: { includeUnverified?: boolean } = {},
): FindingScore {
  const overlaps = toCases(annotations.overlaps);
  const nearMisses = toCases(annotations.nearMisses);
  const statuses = options.includeUnverified === true ? ["confirmed", "unverified"] : ["confirmed"];
  const considered = run.findings.filter((f) => statuses.includes(f.status));

  const found = new Set<string>();
  const falsePositiveIds: string[] = [];
  let truePositives = 0;
  let nearMissHits = 0;
  for (const finding of considered) {
    const hit = hits(overlaps, finding.members);
    if (hit.length > 0) {
      truePositives++;
      hit.forEach((id) => found.add(id));
    } else {
      falsePositiveIds.push(finding.id);
      if (hits(nearMisses, finding.members).length > 0) nearMissHits++;
    }
  }
  const count = (status: string): number => run.findings.filter((f) => f.status === status).length;
  return {
    tool: run.tool,
    model: run.model ?? null,
    considered: considered.length,
    byStatus: { confirmed: count("confirmed"), unverified: count("unverified"), rejected: count("rejected") },
    truePositives,
    falsePositives: falsePositiveIds.length,
    nearMissHits,
    precision: ratio(truePositives, considered.length),
    recall: ratio(found.size, overlaps.length),
    byDifficulty: byDifficulty(annotations, found),
    missedOverlaps: annotations.overlaps.filter((o) => !found.has(o.id)).map((o) => o.id),
    falsePositiveIds: falsePositiveIds.sort(),
    unverifiedHits: run.findings.filter((f) => f.status === "unverified" && hits(overlaps, f.members).length > 0).length,
  };
}

export interface RealScore {
  readonly repo: string;
  readonly tool: string;
  readonly model: string | null;
  /** Confirmed findings. */
  readonly findings: number;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly unsure: number;
  /** Confirmed findings without a label: label them before trusting the precision. */
  readonly unlabeled: readonly string[];
  /** true / (true + false); unsure and unlabeled are excluded. */
  readonly precision: number | null;
}

export function scoreReal(repo: string, run: FindingsFile, labels: Labels | undefined): RealScore {
  const confirmed = run.findings.filter((f) => f.status === "confirmed");
  let truePositives = 0;
  let falsePositives = 0;
  let unsure = 0;
  const unlabeled: string[] = [];
  for (const finding of confirmed) {
    const label = labels?.labels[finding.id];
    if (label === true) truePositives++;
    else if (label === false) falsePositives++;
    else if (label === "unsure") unsure++;
    else unlabeled.push(finding.id);
  }
  return {
    repo,
    tool: run.tool,
    model: run.model ?? null,
    findings: confirmed.length,
    truePositives,
    falsePositives,
    unsure,
    unlabeled: unlabeled.sort(),
    precision: ratio(truePositives, truePositives + falsePositives),
  };
}

export interface TotalUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly seconds: number;
}

export function sumUsage(usages: readonly (Usage | undefined)[]): TotalUsage {
  const sum = (key: keyof Usage): number => usages.reduce((total, u) => total + (u?.[key] ?? 0), 0);
  return { inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), costUsd: sum("costUsd"), seconds: sum("seconds") };
}

export interface FixtureScore {
  readonly fixture: string;
  readonly candidates: CandidateScore | null;
  readonly findings: FindingScore | null;
}

export interface Score {
  readonly fixtures: readonly FixtureScore[];
  readonly real: readonly RealScore[];
  /** Real repositories together: true / (true + false). */
  readonly realPrecision: number | null;
  readonly usage: TotalUsage;
}

export function combine(fixtures: readonly FixtureScore[], real: readonly RealScore[], usage: TotalUsage): Score {
  const truePositives = real.reduce((n, r) => n + r.truePositives, 0);
  const falsePositives = real.reduce((n, r) => n + r.falsePositives, 0);
  return { fixtures, real, realPrecision: ratio(truePositives, truePositives + falsePositives), usage };
}

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function difficultyCells(rows: readonly DifficultyRecall[]): string {
  return rows.map((r) => `${pct(r.recall)} (${r.found}/${r.total})`).join(" | ");
}

/** Markdown report; deterministic for the same score. */
export function renderMarkdown(score: Score): string {
  const lines: string[] = ["# Benchmark", ""];
  for (const fixture of score.fixtures) {
    lines.push(`## Fixture \`${fixture.fixture}\``, "");
    if (fixture.candidates !== null) {
      const c = fixture.candidates;
      lines.push(`### Candidates (${c.tool}, ${c.candidates} pairs)`, "");
      lines.push("| K | Recall | D1 | D2 | D3 | D4 | Near-misses in top K |", "|---|---|---|---|---|---|---|");
      for (const r of c.recallAtK) lines.push(`| ${r.k} | ${pct(r.recall)} | ${difficultyCells(r.byDifficulty)} | ${r.nearMisses} |`);
      lines.push("");
    }
    if (fixture.findings !== null) {
      const f = fixture.findings;
      lines.push(`### Findings (${f.tool}${f.model === null ? "" : `, ${f.model}`})`, "");
      lines.push("| Precision | Recall | D1 | D2 | D3 | D4 | TP | FP | FP on near-misses | Unverified hits |");
      lines.push("|---|---|---|---|---|---|---|---|---|---|");
      lines.push(
        `| ${pct(f.precision)} | ${pct(f.recall)} | ${difficultyCells(f.byDifficulty)} | ${f.truePositives} | ${f.falsePositives} | ${f.nearMissHits} | ${f.unverifiedHits} |`,
      );
      lines.push("");
      if (f.missedOverlaps.length > 0) lines.push(`Missed: ${f.missedOverlaps.map((id) => `\`${id}\``).join(", ")}`, "");
    }
  }
  if (score.real.length > 0) {
    lines.push("## Real repositories", "");
    lines.push("| Repository | Tool | Model | Findings | True | False | Unsure | Unlabeled | Precision |");
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const r of score.real) {
      lines.push(
        `| ${r.repo} | ${r.tool} | ${r.model ?? "—"} | ${r.findings} | ${r.truePositives} | ${r.falsePositives} | ${r.unsure} | ${r.unlabeled.length} | ${pct(r.precision)} |`,
      );
    }
    lines.push("", `Overall precision: ${pct(score.realPrecision)}`, "");
  }
  const u = score.usage;
  lines.push("## Cost", "", `${u.inputTokens} input tokens, ${u.outputTokens} output tokens, $${u.costUsd.toFixed(2)}, ${u.seconds.toFixed(1)} s`, "");
  return lines.join("\n");
}
