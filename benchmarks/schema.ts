/**
 * Benchmark annotation formats (F1-02).
 *
 * - `annotations.json` of a fixture: the overlaps inserted on purpose and the
 *   near-misses (similar code that must NOT be reported).
 * - `labels/<repo>.json`: hand labels of the findings reported on a real repository.
 *
 * The JSON Schemas in `benchmarks/schema/` are the source of truth for editors;
 * `validateAnnotations` and `validateLabels` add the checks a schema cannot express.
 */
import { readFileSync } from "node:fs";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

export type OverlapKind = "semantic_duplication" | "responsibility_overlap";

/**
 * 1: different names; 2: different structure (loop vs `reduce`);
 * 3: class vs functions, different packages; 4: rule spread over two steps.
 */
export type Difficulty = 1 | 2 | 3 | 4;

export interface Member {
  /** Path relative to the fixture root, with forward slashes. */
  readonly file: string;
  /** Qualified name of the unit, e.g. `UserService.deactivate`. */
  readonly symbol: string;
}

export interface Overlap {
  readonly id: string;
  readonly kind: OverlapKind;
  readonly members: readonly Member[];
  readonly difficulty: Difficulty;
  readonly rationale: string;
}

export interface NearMiss {
  readonly id: string;
  readonly members: readonly Member[];
  readonly reason: string;
}

export interface Annotations {
  readonly fixture: string;
  readonly overlaps: readonly Overlap[];
  readonly nearMisses: readonly NearMiss[];
}

/** `true` real overlap, `false` false positive, `"unsure"` excluded from precision but reported. */
export type Label = boolean | "unsure";

export interface Labels {
  readonly repo: string;
  /** Commit the findings were produced on. */
  readonly sha: string;
  /** Finding id → label. */
  readonly labels: Readonly<Record<string, Label>>;
}

export interface RankedCandidate {
  /** Unit ids (`file#Name:kind`) or `file#Name`. */
  readonly members: readonly [string, string];
  readonly score?: number;
}

/** Candidate pairs of one run on one target; the array order is the rank. */
export interface CandidatesFile {
  readonly tool: string;
  readonly candidates: readonly RankedCandidate[];
}

export type FindingStatus = "confirmed" | "unverified" | "rejected";

export interface ReportedFinding {
  readonly id: string;
  readonly status: FindingStatus;
  readonly members: readonly string[];
}

export interface Usage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costUsd?: number;
  readonly seconds?: number;
}

export interface FindingsFile {
  readonly tool: string;
  readonly model?: string;
  readonly findings: readonly ReportedFinding[];
  readonly usage?: Usage;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

function loadSchema(name: string): object {
  return JSON.parse(readFileSync(new URL(`./schema/${name}`, import.meta.url), "utf8")) as object;
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const annotationsValidator = ajv.compile<Annotations>(loadSchema("annotations.schema.json"));
const labelsValidator = ajv.compile<Labels>(loadSchema("labels.schema.json"));
const candidatesValidator = ajv.compile<CandidatesFile>(loadSchema("candidates.schema.json"));
const findingsValidator = ajv.compile<FindingsFile>(loadSchema("findings.schema.json"));

function formatErrors(errors: readonly ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`);
}

function checkSchema<T>(validate: ValidateFunction<T>, data: unknown): ValidationResult<T> {
  if (validate(data)) return { ok: true, value: data };
  return { ok: false, errors: formatErrors(validate.errors) };
}

/** A fixture path must be relative, use forward slashes and stay inside the fixture. */
function checkPath(file: string): string | undefined {
  if (file.includes("\\")) return "must use forward slashes";
  if (file.startsWith("/") || /^[A-Za-z]:/.test(file)) return "must be relative";
  if (file.split("/").some((part) => part === ".." || part === "." || part === "")) {
    return "must be normalized and stay inside the fixture";
  }
  return undefined;
}

export function validateAnnotations(data: unknown): ValidationResult<Annotations> {
  const result = checkSchema(annotationsValidator, data);
  if (!result.ok) return result;

  const errors: string[] = [];
  const seenIds = new Set<string>();
  const cases = [
    ...result.value.overlaps.map((c, i) => ({ c, path: `/overlaps/${i}` })),
    ...result.value.nearMisses.map((c, i) => ({ c, path: `/nearMisses/${i}` })),
  ];
  for (const { c, path } of cases) {
    if (seenIds.has(c.id)) errors.push(`${path}/id duplicate case id '${c.id}'`);
    seenIds.add(c.id);

    const seenMembers = new Set<string>();
    c.members.forEach((m, j) => {
      const pathError = checkPath(m.file);
      if (pathError !== undefined) errors.push(`${path}/members/${j}/file ${pathError}`);
      const key = `${m.file}#${m.symbol}`;
      if (seenMembers.has(key)) errors.push(`${path}/members/${j} duplicate member '${key}'`);
      seenMembers.add(key);
    });
  }
  return errors.length === 0 ? result : { ok: false, errors };
}

export function validateLabels(data: unknown): ValidationResult<Labels> {
  return checkSchema(labelsValidator, data);
}

export function validateCandidates(data: unknown): ValidationResult<CandidatesFile> {
  return checkSchema(candidatesValidator, data);
}

export function validateFindings(data: unknown): ValidationResult<FindingsFile> {
  const result = checkSchema(findingsValidator, data);
  if (!result.ok) return result;
  const seen = new Set<string>();
  const errors: string[] = [];
  result.value.findings.forEach((f, i) => {
    if (seen.has(f.id)) errors.push(`/findings/${i}/id duplicate finding id '${f.id}'`);
    seen.add(f.id);
  });
  return errors.length === 0 ? result : { ok: false, errors };
}
