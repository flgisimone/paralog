import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_FILE = "paralog.config.json";

/** Files that are never analyzed unless `defaultExcludes` is false. Globs are relative to the root. */
export const DEFAULT_EXCLUDES: readonly string[] = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/*.d.ts",
  // Tests
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/test/**",
  "**/tests/**",
  "**/e2e/**",
  // Generated code
  "**/*.generated.ts",
  "**/*.gen.ts",
  "**/generated/**",
  "**/__generated__/**",
];

/** Directories never entered while looking for tsconfig files. */
export const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".paralog",
  "dist",
  "build",
  "coverage",
]);

export interface ParalogConfig {
  /** tsconfig files to use, relative to the root. Empty: discover every `tsconfig.json`. */
  readonly tsconfigs: readonly string[];
  /** Extra globs to exclude, relative to the root. */
  readonly exclude: readonly string[];
  /** When false, `DEFAULT_EXCLUDES` are not applied. */
  readonly defaultExcludes: boolean;
}

export const DEFAULT_CONFIG: ParalogConfig = { tsconfigs: [], exclude: [], defaultExcludes: true };

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

function stringArray(value: unknown, key: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((v): v is string => typeof v === "string")) {
    throw new ConfigError(`${CONFIG_FILE}: '${key}' must be an array of strings`);
  }
  return value;
}

/** Validates a parsed config object and fills in the defaults. */
export function parseConfig(data: unknown): ParalogConfig {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ConfigError(`${CONFIG_FILE}: must contain a JSON object`);
  }
  const record = data as Record<string, unknown>;
  const known = new Set(["$schema", "tsconfigs", "exclude", "defaultExcludes"]);
  for (const key of Object.keys(record)) {
    if (!known.has(key)) throw new ConfigError(`${CONFIG_FILE}: unknown option '${key}'`);
  }
  const defaultExcludes = record.defaultExcludes;
  if (defaultExcludes !== undefined && typeof defaultExcludes !== "boolean") {
    throw new ConfigError(`${CONFIG_FILE}: 'defaultExcludes' must be a boolean`);
  }
  return {
    tsconfigs: stringArray(record.tsconfigs, "tsconfigs") ?? DEFAULT_CONFIG.tsconfigs,
    exclude: stringArray(record.exclude, "exclude") ?? DEFAULT_CONFIG.exclude,
    defaultExcludes: defaultExcludes ?? DEFAULT_CONFIG.defaultExcludes,
  };
}

/** Reads `paralog.config.json` from the root; returns the defaults when it does not exist. */
export function loadConfig(root: string): ParalogConfig {
  const path = join(root, CONFIG_FILE);
  if (!existsSync(path)) return DEFAULT_CONFIG;
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ConfigError(`${CONFIG_FILE}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  return parseConfig(data);
}
