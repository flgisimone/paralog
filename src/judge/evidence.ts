/**
 * Evidence verification (F4-03). A verdict is trusted only when its evidence holds up:
 * every cited range lies inside the cited unit, and the claims are backed by something the two
 * units share (a property, call, literal or type found by the deterministic signals) that
 * actually appears in the cited lines of both units.
 */
import type { Shared } from "../candidates/index.js";
import type { CodeUnit } from "../extract.js";
import type { EvidenceClaim, Verdict } from "./prompt.js";

export type FindingStatus = "confirmed" | "unverified" | "rejected";

export interface CheckedClaim extends EvidenceClaim {
  readonly rangesValid: boolean;
  /** Shared features found in the cited lines of both units. */
  readonly support: readonly string[];
}

export interface EvidenceCheck {
  readonly status: FindingStatus;
  readonly claims: readonly CheckedClaim[];
  /** Why the verdict is not confirmed; empty when confirmed. */
  readonly reasons: readonly string[];
}

export interface EvidenceOptions {
  /** Share of claims that need deterministic support. Default 0.5. */
  readonly minSupport?: number;
}

interface SupportToken {
  readonly label: string;
  readonly pattern: RegExp;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function identifierToken(label: string, name: string): SupportToken {
  return { label, pattern: new RegExp(`(?<![A-Za-z0-9_$])${escape(name)}(?![A-Za-z0-9_$])`) };
}

/** The textual forms of the shared features, as they can appear in source lines. */
export function supportTokens(shared: Shared): SupportToken[] {
  const tokens: SupportToken[] = [];
  for (const type of shared.types) tokens.push(identifierToken(type, type.slice(type.lastIndexOf(".") + 1)));
  for (const property of shared.properties) tokens.push(identifierToken(property, property.slice(property.lastIndexOf(".") + 1)));
  for (const call of shared.calls) {
    const name = call.slice(call.indexOf("#") + 1).replace(/:[a-z]+(?:~\d+)?$/, "");
    const segments = name.split(".");
    // `new UserService()` resolves to UserService.constructor; the source says UserService.
    const last = segments.at(-1) === "constructor" ? segments.at(-2) : segments.at(-1);
    if (last !== undefined && last !== "") tokens.push(identifierToken(call, last));
  }
  for (const literal of shared.literals) {
    if (literal.startsWith('"')) {
      const value = JSON.parse(literal) as string;
      tokens.push({ label: literal, pattern: new RegExp(escape(value)) });
    } else {
      // Numbers may be written with separators (50_00) or as other literals of the same value.
      const digits = literal.split("").map(escape).join("_?");
      tokens.push({ label: literal, pattern: new RegExp(`(?<![0-9_.])${digits}(?![0-9_])`) });
    }
  }
  return tokens;
}

function inside(unit: CodeUnit, range: readonly [number, number]): boolean {
  return range[0] <= range[1] && range[0] >= unit.startLine && range[1] <= unit.endLine;
}

function linesOf(source: readonly string[], range: readonly [number, number]): string {
  return source.slice(range[0] - 1, range[1]).join("\n");
}

/**
 * Checks a verdict. `sourceA` and `sourceB` are the lines of the files of the two units
 * (index 0 is line 1).
 */
export function checkEvidence(
  verdict: Verdict,
  a: CodeUnit,
  b: CodeUnit,
  shared: Shared,
  sourceA: readonly string[],
  sourceB: readonly string[],
  options: EvidenceOptions = {},
): EvidenceCheck {
  const tokens = supportTokens(shared);
  const claims: CheckedClaim[] = verdict.evidence.map((claim) => {
    const rangesValid = inside(a, claim.linesA) && inside(b, claim.linesB);
    if (!rangesValid) return { ...claim, rangesValid, support: [] };
    const textA = linesOf(sourceA, claim.linesA);
    const textB = linesOf(sourceB, claim.linesB);
    const support = tokens.filter((t) => t.pattern.test(textA) && t.pattern.test(textB)).map((t) => t.label);
    return { ...claim, rangesValid, support: [...new Set(support)].sort() };
  });

  if (verdict.verdict === "different" || verdict.verdict === "intentional_variant") {
    return { status: "rejected", claims, reasons: [`the model answered ${verdict.verdict}`] };
  }
  const reasons: string[] = [];
  if (claims.length === 0) reasons.push("no evidence");
  const invalid = claims.filter((c) => !c.rangesValid).length;
  if (invalid > 0) reasons.push(`${String(invalid)} evidence range(s) outside the cited unit`);
  const supported = claims.filter((c) => c.support.length > 0).length;
  const minSupport = options.minSupport ?? 0.5;
  if (claims.length > 0 && (supported === 0 || supported / claims.length < minSupport)) {
    reasons.push(`${String(supported)} of ${String(claims.length)} claims backed by shared code`);
  }
  return { status: reasons.length === 0 ? "confirmed" : "unverified", claims, reasons };
}
