import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { extractUnits } from "../src/extract.js";
import { validateAnnotations, type Annotations } from "./schema.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

function loadAnnotations(fixture: string): Annotations {
  const result = validateAnnotations(JSON.parse(readFileSync(join(FIXTURES, fixture, "annotations.json"), "utf8")));
  if (!result.ok) throw new Error(`invalid annotations:\n${result.errors.join("\n")}`);
  return result.value;
}

describe("fixture shop (F1-03)", () => {
  const root = join(FIXTURES, "shop");
  const annotations = loadAnnotations("shop");
  const extraction = extractUnits({ root });

  it("has 25 overlaps with at least 5 per difficulty and at least 15 near-misses", () => {
    expect(annotations.overlaps).toHaveLength(25);
    expect(annotations.nearMisses.length).toBeGreaterThanOrEqual(15);
    for (const difficulty of [1, 2, 3, 4]) {
      expect(annotations.overlaps.filter((o) => o.difficulty === difficulty).length).toBeGreaterThanOrEqual(5);
    }
  });

  it("type-checks with --strict in both packages", () => {
    expect(extraction.discovery.projects.map((p) => p.tsconfig)).toEqual([
      "packages/admin/tsconfig.json",
      "packages/core/tsconfig.json",
    ]);
    for (const { tsconfig } of extraction.discovery.projects) {
      const project = new Project({ tsConfigFilePath: join(root, tsconfig) });
      const diagnostics = project.getPreEmitDiagnostics().map((d) => project.formatDiagnosticsWithColorAndContext([d]));
      expect(diagnostics, tsconfig).toEqual([]);
    }
  });

  it("extracts a unit for every annotated member", () => {
    const names = new Set(extraction.units.map((u) => `${u.file}#${u.name}`));
    const members = [...annotations.overlaps, ...annotations.nearMisses].flatMap((c) => c.members);
    const missing = members.map((m) => `${m.file}#${m.symbol}`).filter((key) => !names.has(key));
    expect(missing).toEqual([]);
  });
});
