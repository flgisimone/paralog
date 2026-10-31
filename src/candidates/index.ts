/**
 * Deterministic candidates (F3): from all the units, a short ranked list of pairs that may
 * implement the same responsibility, with the signals that explain each pair.
 *
 * 1. Exclusions on units: accessors, constructors, trivial bodies.
 * 2. Blocking: only units that share two types, properties, calls, literals or name tokens (or one
 *    rare one) are compared; features shared by too many units are not used as blocking keys.
 * 3. Exclusions on pairs: two implementations of the same interface member, a unit and its direct callee.
 * 4. Ranking: weighted sum of the signals.
 *
 * Optional embeddings add each unit's nearest neighbours to the compared pairs (see embeddings.ts).
 */
import type { CodeUnit } from "../extract.js";
import { pairKey } from "./embeddings.js";
import { FeatureWeights, featureKeys, pairSignals, unitFeatures, type Shared, type Signals, type UnitFeatures } from "./signals.js";

export {
  embeddingNeighbors,
  EmbeddingError,
  OpenAICompatibleEmbedder,
  pairKey,
  type Embedder,
} from "./embeddings.js";
export { nameTokens } from "./names.js";
export { SIGNAL_NAMES, type Shared, type Signals } from "./signals.js";

export type SignalWeights = Readonly<Record<keyof Signals, number>>;

/** Weights of the ranking; they sum to 1. Chosen on the tuning half of the fixture (plan F3-05). */
export const DEFAULT_WEIGHTS: SignalWeights = {
  types: 0.15,
  properties: 0.25,
  calls: 0.2,
  literals: 0.15,
  names: 0.1,
  shape: 0.15,
  embedding: 0,
};

/** Used when embeddings are on: the deterministic signals keep 80% of the weight. */
export const EMBEDDING_WEIGHTS: SignalWeights = {
  types: 0.12,
  properties: 0.2,
  calls: 0.16,
  literals: 0.12,
  names: 0.08,
  shape: 0.12,
  embedding: 0.2,
};

export interface CandidateOptions {
  /** Units with fewer syntax nodes in the body are skipped. Default 15. */
  readonly minNodes?: number;
  /** Features shared by more units than this are not blocking keys. Default max(20, 2% of the units). */
  readonly maxKeyFrequency?: number;
  /**
   * A pair is compared when it shares at least two blocking keys, or one key found in at most
   * this many units. Default 5.
   */
  readonly rareKeyFrequency?: number;
  /** Maximum number of candidates returned. Default 200. */
  readonly limit?: number;
  /** Candidates below this score are dropped. Default 0. */
  readonly minScore?: number;
  /** Default `DEFAULT_WEIGHTS`, or `EMBEDDING_WEIGHTS` with `similarities`. */
  readonly weights?: SignalWeights;
  /** Embedding similarities of neighbour pairs (see embeddings.ts): compared even without shared keys. */
  readonly similarities?: ReadonlyMap<string, number>;
}

export interface Candidate {
  /** Unit ids, `a < b`. */
  readonly a: string;
  readonly b: string;
  readonly score: number;
  readonly signals: Signals;
  readonly shared: Shared;
}

export type UnitExclusion = "accessor" | "constructor" | "trivial";
export type PairExclusion = "same-interface-member" | "direct-call";

export interface CandidateStats {
  readonly units: number;
  readonly eligibleUnits: number;
  readonly possiblePairs: number;
  /** Pairs that share at least one blocking key. */
  readonly comparedPairs: number;
  readonly excludedUnits: Readonly<Record<UnitExclusion, number>>;
  readonly excludedPairs: Readonly<Record<PairExclusion, number>>;
}

export interface CandidateResult {
  /** Highest score first; ties broken by ids. */
  readonly candidates: readonly Candidate[];
  readonly stats: CandidateStats;
}

function unitExclusion(unit: CodeUnit, minNodes: number): UnitExclusion | undefined {
  if (unit.kind === "getter" || unit.kind === "setter") return "accessor";
  if (unit.kind === "constructor") return "constructor";
  if (unit.nodes < minNodes) return "trivial";
  return undefined;
}

function pairExclusion(a: CodeUnit, b: CodeUnit): PairExclusion | undefined {
  if (a.implements.some((member) => b.implements.includes(member))) return "same-interface-member";
  if (a.calls.includes(b.id) || b.calls.includes(a.id)) return "direct-call";
  return undefined;
}

export function score(signals: Signals, weights: SignalWeights): number {
  return (
    signals.types * weights.types +
    signals.properties * weights.properties +
    signals.calls * weights.calls +
    signals.literals * weights.literals +
    signals.names * weights.names +
    signals.shape * weights.shape +
    signals.embedding * weights.embedding
  );
}

export function findCandidates(units: readonly CodeUnit[], options: CandidateOptions = {}): CandidateResult {
  const minNodes = options.minNodes ?? 15;
  const limit = options.limit ?? 200;
  const minScore = options.minScore ?? 0;
  const similarities = options.similarities;
  const weights = options.weights ?? (similarities === undefined ? DEFAULT_WEIGHTS : EMBEDDING_WEIGHTS);

  const excludedUnits: Record<UnitExclusion, number> = { accessor: 0, constructor: 0, trivial: 0 };
  const eligible: UnitFeatures[] = [];
  for (const unit of units) {
    const reason = unitExclusion(unit, minNodes);
    if (reason === undefined) eligible.push(unitFeatures(unit));
    else excludedUnits[reason]++;
  }
  const featureWeights = new FeatureWeights(eligible);
  const maxKeyFrequency = options.maxKeyFrequency ?? Math.max(20, Math.ceil(eligible.length * 0.02));

  // Blocking: inverted index from feature to units.
  const index = new Map<string, number[]>();
  eligible.forEach((f, i) => {
    for (const key of featureKeys(f)) {
      const frequency = featureWeights.frequency(key);
      if (frequency < 2 || frequency > maxKeyFrequency) continue;
      const list = index.get(key) ?? [];
      list.push(i);
      index.set(key, list);
    }
  });
  const rareKeyFrequency = options.rareKeyFrequency ?? 5;
  const sharedKeys = new Map<number, number>();
  const n = eligible.length;
  for (const list of index.values()) {
    // A rare key is enough on its own: count it as two.
    const weight = list.length <= rareKeyFrequency ? 2 : 1;
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const i = list[x] ?? 0;
        const j = list[y] ?? 0;
        const pair = i < j ? i * n + j : j * n + i;
        sharedKeys.set(pair, (sharedKeys.get(pair) ?? 0) + weight);
      }
    }
  }
  const pairs = new Set([...sharedKeys].filter(([, count]) => count >= 2).map(([pair]) => pair));
  if (similarities !== undefined) {
    const position = new Map(eligible.map((f, i) => [f.unit.id, i]));
    for (const key of similarities.keys()) {
      const [left, right] = key.split("|");
      const i = position.get(left ?? "");
      const j = position.get(right ?? "");
      if (i !== undefined && j !== undefined && i !== j) pairs.add(i < j ? i * n + j : j * n + i);
    }
  }

  const excludedPairs: Record<PairExclusion, number> = { "same-interface-member": 0, "direct-call": 0 };
  const candidates: Candidate[] = [];
  for (const pair of pairs) {
    const left = eligible[Math.floor(pair / n)];
    const right = eligible[pair % n];
    if (left === undefined || right === undefined) continue;
    const reason = pairExclusion(left.unit, right.unit);
    if (reason !== undefined) {
      excludedPairs[reason]++;
      continue;
    }
    const { signals, shared } = pairSignals(left, right, featureWeights, similarities?.get(pairKey(left.unit.id, right.unit.id)) ?? 0);
    const value = score(signals, weights);
    if (value < minScore) continue;
    const [a, b] = left.unit.id < right.unit.id ? [left.unit.id, right.unit.id] : [right.unit.id, left.unit.id];
    candidates.push({ a, b, score: Math.round(value * 10_000) / 10_000, signals, shared });
  }
  candidates.sort((x, y) => y.score - x.score || (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : 1));

  return {
    candidates: candidates.slice(0, limit),
    stats: {
      units: units.length,
      eligibleUnits: n,
      possiblePairs: (n * (n - 1)) / 2,
      comparedPairs: pairs.size,
      excludedUnits,
      excludedPairs,
    },
  };
}
