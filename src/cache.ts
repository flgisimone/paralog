import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { ts } from "ts-morph";
import { toPosix } from "./discovery.js";
import type { CodeUnit } from "./extract.js";

export const CACHE_DIR = ".paralog/cache";
const CACHE_FILE = "units.json";

interface CacheEntry {
  readonly key: string;
  readonly units: readonly CodeUnit[];
}

interface CacheData {
  readonly extractorVersion: number;
  readonly files: Readonly<Record<string, CacheEntry>>;
}

function sha256(...parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part).update("\u0000");
  return hash.digest("hex");
}

/** Units of every analyzed file, keyed by a hash of the file and everything it depends on. */
export class UnitCache {
  private readonly path: string;
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    root: string,
    private readonly extractorVersion: number,
  ) {
    this.path = join(root, CACHE_DIR, CACHE_FILE);
    if (!existsSync(this.path)) return;
    try {
      const data = JSON.parse(readFileSync(this.path, "utf8")) as CacheData;
      if (data.extractorVersion !== extractorVersion) return;
      for (const [file, entry] of Object.entries(data.files)) this.entries.set(file, entry);
    } catch {
      // A corrupt cache is ignored and rebuilt.
    }
  }

  get(file: string, key: string): readonly CodeUnit[] | undefined {
    const entry = this.entries.get(file);
    return entry?.key === key ? entry.units : undefined;
  }

  set(file: string, key: string, units: readonly CodeUnit[]): void {
    this.entries.set(file, { key, units });
  }

  /** Keeps only the given files (removed files leave the cache) and writes it atomically. */
  save(files: ReadonlySet<string>): void {
    const kept = [...this.entries].filter(([file]) => files.has(file)).sort(([a], [b]) => (a < b ? -1 : 1));
    const data: CacheData = { extractorVersion: this.extractorVersion, files: Object.fromEntries(kept) };
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${String(process.pid)}.tmp`;
    writeFileSync(temporary, JSON.stringify(data));
    renameSync(temporary, this.path);
  }
}

/**
 * Cache keys of the files of one project. A key covers the file, every project file it imports
 * (directly or not, since types flow through re-exports) and the compiler options; dependencies
 * in node_modules are not covered.
 */
export function cacheKeys(root: string, tsconfig: string, files: readonly string[]): Map<string, string> {
  const parsed = ts.getParsedCommandLineOfConfigFile(resolve(root, tsconfig), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => undefined,
  });
  const options = parsed?.options ?? {};
  const optionsHash = sha256(JSON.stringify(options, Object.keys(options).sort()));
  const resolutionCache = ts.createModuleResolutionCache(root, (f) => f, options);

  const contentHashes = new Map<string, string | null>();
  const contentHash = (absolute: string): string | null => {
    let hash = contentHashes.get(absolute);
    if (hash === undefined) {
      hash = existsSync(absolute) ? sha256(readFileSync(absolute, "utf8")) : null;
      contentHashes.set(absolute, hash);
    }
    return hash;
  };

  const isProjectFile = (absolute: string): boolean => {
    const rel = relative(root, absolute);
    return !rel.startsWith("..") && !isAbsolute(rel) && !rel.split(/[\\/]/).includes("node_modules");
  };

  const importsOf = new Map<string, readonly string[]>();
  const directImports = (absolute: string): readonly string[] => {
    const cached = importsOf.get(absolute);
    if (cached !== undefined) return cached;
    const text = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
    const info = ts.preProcessFile(text, true, true);
    const specifiers = [...info.importedFiles, ...info.referencedFiles].map((f) => f.fileName);
    const resolved: string[] = [];
    for (const specifier of specifiers) {
      const result = ts.resolveModuleName(specifier, absolute, options, ts.sys, resolutionCache).resolvedModule;
      if (result !== undefined && isProjectFile(result.resolvedFileName)) resolved.push(resolve(result.resolvedFileName));
    }
    importsOf.set(absolute, resolved);
    return resolved;
  };

  const keys = new Map<string, string>();
  for (const file of files) {
    const start = resolve(root, file);
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined) break;
      for (const next of directImports(current)) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    const parts = [...seen]
      .map((absolute) => `${toPosix(relative(root, absolute))}=${contentHash(absolute) ?? "missing"}`)
      .sort();
    keys.set(file, sha256(optionsHash, toPosix(tsconfig), ...parts));
  }
  return keys;
}
