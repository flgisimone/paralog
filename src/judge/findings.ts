/**
 * Findings (F4-04, F4-05): judged pairs grouped into findings with stable ids and a severity.
 */
import { createHash } from "node:crypto";
import type { Candidate, Signals } from "../candidates/index.js";
import type { CodeUnit } from "../extract.js";
import type { CheckedClaim, EvidenceCheck, FindingStatus } from "./evidence.js";
import type { Verdict } from "./prompt.js";
import type { Usage } from "./providers.js";

export type FindingKind = "semantic_duplication" | "responsibility_overlap";
export type Severity = "low" | "medium" | "high";

/** One judged candidate pair. */
export interface JudgedPair {
  readonly candidate: Candidate;
  readonly a: CodeUnit;
  readonly b: CodeUnit;
  readonly verdict: Verdict;
  readonly check: EvidenceCheck;
  /** Model that produced the verdict. */
  readonly model: string;
  readonly usage: Usage;
  /** The verdict came from the cache: no tokens spent. */
  readonly cached: boolean;
}

export interface FindingMember {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface FindingEvidence extends CheckedClaim {
  /** Unit ids the line ranges refer to. */
  readonly a: string;
  readonly b: string;
}

export interface Finding {
  /** Hash of the sorted unit ids: the same members give the same id in every run. */
  readonly id: string;
  readonly kind: FindingKind;
  readonly status: FindingStatus;
  /** Sorted by id. */
  readonly members: readonly FindingMember[];
  readonly sharedResponsibility: string;
  readonly differences: readonly string[];
  readonly evidence: readonly FindingEvidence[];
  readonly suggestion: string;
  /** Signals of the strongest pair of the finding. */
  readonly signals: Signals;
  /** Shared features backing the evidence, common to every pair of the finding. */
  readonly support: readonly string[];
  readonly severity: Severity;
  readonly model: string;
  /** Why an unverified finding is not confirmed. */
  readonly reasons: readonly string[];
}

export function findingId(unitIds: readonly string[]): string {
  return createHash("sha256").update([...unitIds].sort().join("\n")).digest("hex").slice(0, 12);
}

/** The package a file belongs to: `packages/core`, `apps/web`, or the first directory. */
export function packageOf(file: string): string {
  const parts = file.split("/");
  const index = parts.findIndex((p) => ["packages", "apps", "libs", "modules", "services"].includes(p));
  if (index !== -1 && index + 1 < parts.length - 1) return parts.slice(0, index + 2).join("/");
  return parts.length > 1 ? (parts[0] ?? "") : "";
}

function directoryOf(file: string): string {
  return file.slice(0, Math.max(0, file.lastIndexOf("/")));
}

/**
 * Severity grows with the distance between the copies (same directory: low, different
 * directories: medium, different packages: high) and drops one level for small units
 * (fewer than 60 syntax nodes together).
 */
export function severityOf(units: readonly CodeUnit[]): Severity {
  const files = units.map((u) => u.file);
  let level = 0;
  if (new Set(files.map(packageOf)).size > 1) level = 2;
  else if (new Set(files.map(directoryOf)).size > 1) level = 1;
  const nodes = units.reduce((n, u) => n + u.nodes, 0);
  if (nodes < 60) level -= 1;
  return level >= 2 ? "high" : level === 1 ? "medium" : "low";
}

function member(unit: CodeUnit): FindingMember {
  return { id: unit.id, name: unit.name, file: unit.file, startLine: unit.startLine, endLine: unit.endLine };
}

function kindOf(pairs: readonly JudgedPair[]): FindingKind {
  return pairs.every((p) => p.verdict.verdict === "same_responsibility") ? "semantic_duplication" : "responsibility_overlap";
}

function supportOf(pair: JudgedPair): Set<string> {
  return new Set(pair.check.claims.flatMap((c) => c.support));
}

function toFinding(pairs: readonly JudgedPair[], support: ReadonlySet<string>): Finding {
  const units = new Map<string, CodeUnit>();
  for (const p of pairs) {
    units.set(p.a.id, p.a);
    units.set(p.b.id, p.b);
  }
  const members = [...units.values()].sort((x, y) => (x.id < y.id ? -1 : 1));
  const strongest = [...pairs].sort((x, y) => y.candidate.score - x.candidate.score)[0];
  if (strongest === undefined) throw new Error("a finding needs at least one pair");
  return {
    id: findingId(members.map((m) => m.id)),
    kind: kindOf(pairs),
    status: strongest.check.status,
    members: members.map(member),
    sharedResponsibility: strongest.verdict.sharedResponsibility,
    differences: [...new Set(pairs.flatMap((p) => p.verdict.differences))],
    evidence: pairs.flatMap((p) => p.check.claims.map((c) => ({ ...c, a: p.a.id, b: p.b.id }))),
    suggestion: strongest.verdict.suggestion,
    signals: strongest.candidate.signals,
    support: [...support].sort(),
    severity: severityOf(members),
    model: strongest.model,
    reasons: strongest.check.reasons,
  };
}

/**
 * Groups confirmed pairs (A~B, B~C) into one finding only while every pair keeps at least one
 * supporting feature in common; other pairs stay separate. Unverified pairs become one finding
 * each; rejected pairs are not findings.
 */
export function buildFindings(judged: readonly JudgedPair[]): Finding[] {
  const confirmed = judged
    .filter((p) => p.check.status === "confirmed")
    .sort((x, y) => y.candidate.score - x.candidate.score || (x.candidate.a + x.candidate.b < y.candidate.a + y.candidate.b ? -1 : 1));
  const clusters: { units: Set<string>; support: Set<string>; pairs: JudgedPair[] }[] = [];
  for (const pair of confirmed) {
    const support = supportOf(pair);
    const cluster = clusters.find(
      (c) => (c.units.has(pair.a.id) || c.units.has(pair.b.id)) && [...c.support].some((s) => support.has(s)),
    );
    if (cluster === undefined) {
      clusters.push({ units: new Set([pair.a.id, pair.b.id]), support, pairs: [pair] });
    } else {
      cluster.units.add(pair.a.id);
      cluster.units.add(pair.b.id);
      cluster.support = new Set([...cluster.support].filter((s) => support.has(s)));
      cluster.pairs.push(pair);
    }
  }
  const findings = [
    ...clusters.map((c) => toFinding(c.pairs, c.support)),
    ...judged.filter((p) => p.check.status === "unverified").map((p) => toFinding([p], supportOf(p))),
  ];
  // The same members found twice (a confirmed cluster and an unverified pair): keep the confirmed one.
  const byId = new Map<string, Finding>();
  for (const f of findings) if (!byId.has(f.id)) byId.set(f.id, f);
  const order: Record<FindingStatus, number> = { confirmed: 0, unverified: 1, rejected: 2 };
  const severity: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return [...byId.values()].sort(
    (x, y) => order[x.status] - order[y.status] || severity[x.severity] - severity[y.severity] || (x.id < y.id ? -1 : 1),
  );
}
