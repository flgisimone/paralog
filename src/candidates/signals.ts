import type { CodeUnit } from "../extract.js";
import { nameTokens } from "./names.js";

/** Every signal is in [0, 1]. */
export interface Signals {
  /** Domain types in the signatures and types of the touched properties. */
  readonly types: number;
  readonly properties: number;
  readonly calls: number;
  readonly literals: number;
  readonly names: number;
  /** Cosine similarity of the body shapes. */
  readonly shape: number;
  /** Cosine similarity of the embeddings; 0 when embeddings are off. */
  readonly embedding: number;
}

export const SIGNAL_NAMES: readonly (keyof Signals)[] = ["types", "properties", "calls", "literals", "names", "shape", "embedding"];

/** What the two units have in common: the evidence behind the signals. */
export interface Shared {
  readonly types: readonly string[];
  readonly properties: readonly string[];
  readonly calls: readonly string[];
  readonly literals: readonly string[];
  readonly names: readonly string[];
}

/** The features of a unit that the signals compare. */
export interface UnitFeatures {
  readonly unit: CodeUnit;
  /** Class, object or namespace that contains the unit (`UserService` for `UserService.deactivate`). */
  readonly owner: string | undefined;
  readonly types: ReadonlySet<string>;
  readonly properties: ReadonlySet<string>;
  readonly calls: ReadonlySet<string>;
  readonly literals: ReadonlySet<string>;
  readonly names: ReadonlySet<string>;
  readonly shapeNorm: number;
}

function ownerOf(unit: CodeUnit): string | undefined {
  const dot = unit.name.lastIndexOf(".");
  return dot === -1 ? undefined : unit.name.slice(0, dot);
}

/** `User.status` → `User` */
function typeOfProperty(property: string): string {
  const dot = property.lastIndexOf(".");
  return dot === -1 ? property : property.slice(0, dot);
}

export function unitFeatures(unit: CodeUnit): UnitFeatures {
  const owner = ownerOf(unit);
  // The unit's own fields (injected services, private state) say nothing about its responsibility.
  const properties = unit.touchedProperties.filter((p) => owner === undefined || typeOfProperty(p) !== owner);
  const types = new Set([...unit.domainTypes, ...properties.map(typeOfProperty)]);
  if (owner !== undefined) types.delete(owner);
  const lastName = unit.name.slice(unit.name.lastIndexOf(".") + 1);
  const shapeNorm = Math.sqrt(Object.values(unit.shape).reduce((sum, n) => sum + n * n, 0));
  return {
    unit,
    owner,
    types,
    properties: new Set(properties),
    calls: new Set(unit.calls),
    literals: new Set(unit.literals),
    names: new Set(nameTokens(lastName)),
    shapeNorm,
  };
}

/** Inverse document frequency of each feature, so that rare shared features weigh more. */
export class FeatureWeights {
  private readonly counts = new Map<string, number>();
  private readonly total: number;

  constructor(features: readonly UnitFeatures[]) {
    this.total = features.length;
    for (const f of features) {
      for (const key of featureKeys(f)) this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    }
  }

  /** Number of units with the feature. */
  frequency(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  weight(key: string): number {
    return Math.log((this.total + 1) / ((this.counts.get(key) ?? 0) + 1)) + 1;
  }
}

/** Prefixed features of a unit, as used by the weights and the blocking index. */
export function featureKeys(f: UnitFeatures): string[] {
  return [
    ...[...f.types].map((t) => `type:${t}`),
    ...[...f.properties].map((p) => `prop:${p}`),
    ...[...f.calls].map((c) => `call:${c}`),
    ...[...f.literals].map((l) => `lit:${l}`),
    ...[...f.names].map((n) => `name:${n}`),
  ];
}

/** Weighted Jaccard similarity: shared weight over total weight. */
function weightedOverlap(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
  prefix: string,
  weights: FeatureWeights,
): { score: number; shared: string[] } {
  if (a.size === 0 || b.size === 0) return { score: 0, shared: [] };
  let sharedWeight = 0;
  let totalWeight = 0;
  const shared: string[] = [];
  for (const item of a) {
    const w = weights.weight(`${prefix}:${item}`);
    totalWeight += w;
    if (b.has(item)) {
      sharedWeight += w;
      shared.push(item);
    }
  }
  for (const item of b) if (!a.has(item)) totalWeight += weights.weight(`${prefix}:${item}`);
  return { score: totalWeight === 0 ? 0 : sharedWeight / totalWeight, shared: shared.sort() };
}

function shapeSimilarity(a: UnitFeatures, b: UnitFeatures): number {
  if (a.shapeNorm === 0 || b.shapeNorm === 0) return 0;
  let dot = 0;
  for (const [key, count] of Object.entries(a.unit.shape)) dot += count * (b.unit.shape[key] ?? 0);
  return dot / (a.shapeNorm * b.shapeNorm);
}

export function pairSignals(
  a: UnitFeatures,
  b: UnitFeatures,
  weights: FeatureWeights,
  embedding = 0,
): { signals: Signals; shared: Shared } {
  const types = weightedOverlap(a.types, b.types, "type", weights);
  const properties = weightedOverlap(a.properties, b.properties, "prop", weights);
  const calls = weightedOverlap(a.calls, b.calls, "call", weights);
  const literals = weightedOverlap(a.literals, b.literals, "lit", weights);
  const names = weightedOverlap(a.names, b.names, "name", weights);
  return {
    signals: {
      types: types.score,
      properties: properties.score,
      calls: calls.score,
      literals: literals.score,
      names: names.score,
      shape: shapeSimilarity(a, b),
      embedding,
    },
    shared: {
      types: types.shared,
      properties: properties.shared,
      calls: calls.shared,
      literals: literals.shared,
      names: names.shared,
    },
  };
}
