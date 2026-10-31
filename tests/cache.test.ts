import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CACHE_DIR } from "../src/cache.js";
import { extractUnits } from "../src/extract.js";
import { STRICT_TSCONFIG, writeRepo } from "./helpers.js";

function repo(): string {
  return writeRepo({
    "tsconfig.json": STRICT_TSCONFIG,
    "src/model.ts": "export interface User { id: string; status: string }\n",
    "src/index.ts": 'export type { User } from "./model.js";\n',
    "src/users.ts": 'import type { User } from "./index.js";\nexport function isActive(u: User): boolean { return u.status === "active"; }\n',
    "src/math.ts": "export function double(n: number): number { return n * 2; }\n",
  });
}

const extract = (root: string) => extractUnits({ root, cache: true });

describe("unit cache (F2-05)", () => {
  it("reuses every file on a second run without changes", () => {
    const root = repo();
    const first = extract(root);
    expect(first.stats).toEqual({ cachedFiles: 0, extractedFiles: 4 });
    const second = extract(root);
    expect(second.stats).toEqual({ cachedFiles: 4, extractedFiles: 0 });
    expect(second.units).toEqual(first.units);
  });

  it("extracts again only the changed file when nothing imports it", () => {
    const root = repo();
    extract(root);
    writeFileSync(join(root, "src/math.ts"), "export function double(n: number): number { return n + n; }\n");
    const next = extract(root);
    expect(next.stats).toEqual({ cachedFiles: 3, extractedFiles: 1 });
  });

  it("extracts again the files that use a changed type, also through re-exports", () => {
    const root = repo();
    extract(root);
    writeFileSync(join(root, "src/model.ts"), "export interface User { id: string; status: string; email: string }\n");
    const next = extract(root);
    // model.ts itself, index.ts (re-export) and users.ts (through index.ts); math.ts stays cached.
    expect(next.stats).toEqual({ cachedFiles: 1, extractedFiles: 3 });
  });

  it("does not use the cache unless asked, and ignores a corrupt or outdated cache", () => {
    const root = repo();
    extractUnits({ root });
    expect(existsSync(join(root, CACHE_DIR))).toBe(false);

    extract(root);
    const cacheFile = join(root, CACHE_DIR, "units.json");
    writeFileSync(cacheFile, "{ broken");
    expect(extract(root).stats.extractedFiles).toBe(4);

    const data = JSON.parse(readFileSync(cacheFile, "utf8")) as { extractorVersion: number };
    writeFileSync(cacheFile, JSON.stringify({ ...data, extractorVersion: -1 }));
    expect(extract(root).stats.extractedFiles).toBe(4);
  });

  it("drops deleted files from the cache", () => {
    const root = repo();
    extract(root);
    rmSync(join(root, "src/math.ts"));
    expect(extract(root).units.some((u) => u.file === "src/math.ts")).toBe(false);
    const data = JSON.parse(readFileSync(join(root, CACHE_DIR, "units.json"), "utf8")) as { files: Record<string, unknown> };
    expect(Object.keys(data.files).sort()).toEqual(["src/index.ts", "src/model.ts", "src/users.ts"]);
  });

  describe("on the shop fixture", () => {
    let root: string | undefined;
    afterEach(() => {
      if (root !== undefined) rmSync(root, { recursive: true, force: true });
    });

    it("is at least 5 times faster on the second run", () => {
      root = mkdtempSync(join(tmpdir(), "paralog-cache-"));
      cpSync(join(import.meta.dirname, "..", "benchmarks", "fixtures", "shop"), root, { recursive: true });
      const time = (): number => {
        const started = performance.now();
        extract(root ?? "");
        return performance.now() - started;
      };
      const cold = time();
      const warm = time();
      expect(cold / warm).toBeGreaterThanOrEqual(5);
    });
  });
});
