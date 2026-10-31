import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AIConfig, Effort } from "./judge/providers.js";

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
  /** Optional embeddings for the candidates; off when absent. */
  readonly embeddings?: EmbeddingsConfig;
  /** AI provider for the judgment; nothing is sent to a model when absent. */
  readonly ai?: AIConfig;
}

export interface EmbeddingsConfig {
  /** OpenAI-compatible endpoint without `/embeddings`, e.g. `http://localhost:11434/v1` for Ollama. */
  readonly baseUrl: string;
  readonly model: string;
  /** Name of the environment variable holding the API key; the key itself is never stored. */
  readonly apiKeyEnv?: string;
  /** Neighbours added per unit. Default 5. */
  readonly neighbors?: number;
}

export const DEFAULT_CONFIG: ParalogConfig = { tsconfigs: [], exclude: [], defaultExcludes: true };

function parseEmbeddings(value: unknown): EmbeddingsConfig | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConfigError(`${CONFIG_FILE}: 'embeddings' must be an object`);
  }
  const e = value as Record<string, unknown>;
  for (const key of Object.keys(e)) {
    if (!["baseUrl", "model", "apiKeyEnv", "neighbors"].includes(key)) {
      throw new ConfigError(`${CONFIG_FILE}: unknown option 'embeddings.${key}'`);
    }
  }
  if (typeof e.baseUrl !== "string" || !/^https?:\/\//.test(e.baseUrl)) {
    throw new ConfigError(`${CONFIG_FILE}: 'embeddings.baseUrl' must be an http(s) URL`);
  }
  if (typeof e.model !== "string" || e.model === "") {
    throw new ConfigError(`${CONFIG_FILE}: 'embeddings.model' must be a non-empty string`);
  }
  if (e.apiKeyEnv !== undefined && (typeof e.apiKeyEnv !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.apiKeyEnv))) {
    throw new ConfigError(`${CONFIG_FILE}: 'embeddings.apiKeyEnv' must be the name of an environment variable, not a key`);
  }
  if (e.neighbors !== undefined && (typeof e.neighbors !== "number" || !Number.isInteger(e.neighbors) || e.neighbors < 1)) {
    throw new ConfigError(`${CONFIG_FILE}: 'embeddings.neighbors' must be a positive integer`);
  }
  return {
    baseUrl: e.baseUrl,
    model: e.model,
    ...(e.apiKeyEnv === undefined ? {} : { apiKeyEnv: e.apiKeyEnv }),
    ...(e.neighbors === undefined ? {} : { neighbors: e.neighbors }),
  };
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function positiveInteger(value: unknown, key: string, min = 1): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new ConfigError(`${CONFIG_FILE}: '${key}' must be an integer >= ${String(min)}`);
  }
  return value;
}

function parseAi(value: unknown): AIConfig | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new ConfigError(`${CONFIG_FILE}: 'ai' must be an object`);
  const ai = value as Record<string, unknown>;
  const known = ["provider", "model", "baseUrl", "apiKeyEnv", "concurrency", "timeoutMs", "maxRetries", "effort"];
  for (const key of Object.keys(ai)) if (!known.includes(key)) throw new ConfigError(`${CONFIG_FILE}: unknown option 'ai.${key}'`);
  if (ai.provider !== "anthropic" && ai.provider !== "openai-compatible") {
    throw new ConfigError(`${CONFIG_FILE}: 'ai.provider' must be "anthropic" or "openai-compatible"`);
  }
  if (typeof ai.model !== "string" || ai.model === "") throw new ConfigError(`${CONFIG_FILE}: 'ai.model' must be a non-empty string`);
  if (ai.baseUrl !== undefined && (typeof ai.baseUrl !== "string" || !/^https?:\/\//.test(ai.baseUrl))) {
    throw new ConfigError(`${CONFIG_FILE}: 'ai.baseUrl' must be an http(s) URL`);
  }
  if (ai.provider === "openai-compatible" && ai.baseUrl === undefined) {
    throw new ConfigError(`${CONFIG_FILE}: 'ai.baseUrl' is required for the openai-compatible provider`);
  }
  if (ai.apiKeyEnv !== undefined && (typeof ai.apiKeyEnv !== "string" || !ENV_NAME.test(ai.apiKeyEnv))) {
    throw new ConfigError(`${CONFIG_FILE}: 'ai.apiKeyEnv' must be the name of an environment variable, not a key`);
  }
  const efforts: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];
  if (ai.effort !== undefined && !efforts.includes(ai.effort as Effort)) {
    throw new ConfigError(`${CONFIG_FILE}: 'ai.effort' must be one of ${efforts.join(", ")}`);
  }
  const concurrency = positiveInteger(ai.concurrency, "ai.concurrency");
  const timeoutMs = positiveInteger(ai.timeoutMs, "ai.timeoutMs");
  const maxRetries = positiveInteger(ai.maxRetries, "ai.maxRetries", 0);
  return {
    provider: ai.provider,
    model: ai.model,
    ...(ai.baseUrl === undefined ? {} : { baseUrl: ai.baseUrl }),
    ...(ai.apiKeyEnv === undefined ? {} : { apiKeyEnv: ai.apiKeyEnv }),
    ...(concurrency === undefined ? {} : { concurrency }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(maxRetries === undefined ? {} : { maxRetries }),
    ...(ai.effort === undefined ? {} : { effort: ai.effort as Effort }),
  };
}

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
  const known = new Set(["$schema", "tsconfigs", "exclude", "defaultExcludes", "embeddings", "ai"]);
  for (const key of Object.keys(record)) {
    if (!known.has(key)) throw new ConfigError(`${CONFIG_FILE}: unknown option '${key}'`);
  }
  const defaultExcludes = record.defaultExcludes;
  if (defaultExcludes !== undefined && typeof defaultExcludes !== "boolean") {
    throw new ConfigError(`${CONFIG_FILE}: 'defaultExcludes' must be a boolean`);
  }
  const embeddings = parseEmbeddings(record.embeddings);
  const ai = parseAi(record.ai);
  return {
    tsconfigs: stringArray(record.tsconfigs, "tsconfigs") ?? DEFAULT_CONFIG.tsconfigs,
    exclude: stringArray(record.exclude, "exclude") ?? DEFAULT_CONFIG.exclude,
    defaultExcludes: defaultExcludes ?? DEFAULT_CONFIG.defaultExcludes,
    ...(embeddings === undefined ? {} : { embeddings }),
    ...(ai === undefined ? {} : { ai }),
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
