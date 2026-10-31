/**
 * Tuning and verification halves of a fixture (plan F3-05).
 *
 * Within each difficulty, overlaps sorted by id alternate: even positions tune the weights,
 * odd positions only verify them. The rule depends on ids alone, so it was fixed before any
 * signal was measured.
 */
import type { Annotations } from "./schema.js";

export type Split = "tuning" | "verification";

export function splitOf(annotations: Annotations, overlapId: string): Split {
  const overlap = annotations.overlaps.find((o) => o.id === overlapId);
  if (overlap === undefined) throw new Error(`unknown overlap ${overlapId}`);
  const sameDifficulty = annotations.overlaps
    .filter((o) => o.difficulty === overlap.difficulty)
    .map((o) => o.id)
    .sort();
  return sameDifficulty.indexOf(overlapId) % 2 === 0 ? "tuning" : "verification";
}

/** The annotations restricted to one half; near-misses are kept whole. */
export function restrictToSplit(annotations: Annotations, split: Split): Annotations {
  return { ...annotations, overlaps: annotations.overlaps.filter((o) => splitOf(annotations, o.id) === split) };
}
