import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_CONFIG, loadConfig, parseConfig } from "../src/config.js";
import { discoverProjects } from "../src/discovery.js";
import { STRICT_TSCONFIG, writeRepo } from "./helpers.js";

const tsconfig = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ ...(JSON.parse(STRICT_TSCONFIG) as object), ...extra });

/** A pnpm monorepo with a solution tsconfig and project references. */
function monorepo(): string {
  return writeRepo({
    "package.json": JSON.stringify({ private: true }),
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/core" }, { path: "packages/api" }] }),
    "packages/core/tsconfig.json": tsconfig({ compilerOptions: { composite: true, strict: true }, include: ["src"] }),
    "packages/core/src/user.ts": "export interface User { id: string }",
    "packages/core/src/user.test.ts": "export const t = 1;",
    "packages/core/src/__tests__/helpers.ts": "export const h = 1;",
    "packages/core/src/types.d.ts": "declare const x: number;",
    "packages/core/src/api.generated.ts": "export const g = 1;",
    "packages/api/tsconfig.json": tsconfig({
      compilerOptions: { composite: true, strict: true },
      include: ["src"],
      references: [{ path: "../core" }],
    }),
    "packages/api/src/server.ts": "export function start() {}",
    "packages/api/node_modules/dep/tsconfig.json": tsconfig(),
    "packages/api/node_modules/dep/index.ts": "export const d = 1;",
  });
}

describe("discoverProjects", () => {
  it("finds the tsconfigs of a monorepo and excludes tests, declarations and generated files", () => {
    const discovery = discoverProjects(monorepo(), DEFAULT_CONFIG);
    expect(discovery.projects).toEqual([
      { tsconfig: "packages/api/tsconfig.json", files: ["packages/api/src/server.ts"] },
      { tsconfig: "packages/core/tsconfig.json", files: ["packages/core/src/user.ts"] },
    ]);
    expect(discovery.excludedFiles).toBe(4);
    expect(discovery.warnings).toEqual([]);
  });

  it("follows project references when the tsconfigs are given explicitly", () => {
    const discovery = discoverProjects(monorepo(), { ...DEFAULT_CONFIG, tsconfigs: ["tsconfig.json"] });
    expect(discovery.projects.map((p) => p.tsconfig)).toEqual(["packages/api/tsconfig.json", "packages/core/tsconfig.json"]);
  });

  it("assigns a file included by several tsconfigs to the nearest one", () => {
    const root = writeRepo({
      "tsconfig.json": tsconfig({ include: ["**/*.ts"] }),
      "app/tsconfig.json": tsconfig({ include: ["src"] }),
      "app/src/a.ts": "export const a = 1;",
      "lib/b.ts": "export const b = 1;",
    });
    expect(discoverProjects(root, DEFAULT_CONFIG).projects).toEqual([
      { tsconfig: "app/tsconfig.json", files: ["app/src/a.ts"] },
      { tsconfig: "tsconfig.json", files: ["lib/b.ts"] },
    ]);
  });

  it("applies the configured excludes and can disable the defaults", () => {
    const root = writeRepo({
      "tsconfig.json": tsconfig({ include: ["src"] }),
      "src/a.ts": "export const a = 1;",
      "src/a.test.ts": "export const t = 1;",
      "src/legacy/old.ts": "export const o = 1;",
    });
    const files = (config: typeof DEFAULT_CONFIG): readonly string[] =>
      discoverProjects(root, config).projects.flatMap((p) => p.files);
    expect(files({ ...DEFAULT_CONFIG, exclude: ["src/legacy/**"] })).toEqual(["src/a.ts"]);
    expect(files({ ...DEFAULT_CONFIG, defaultExcludes: false })).toEqual(["src/a.test.ts", "src/a.ts", "src/legacy/old.ts"]);
  });

  it("reports a broken tsconfig as a warning and keeps going", () => {
    const root = writeRepo({
      "tsconfig.json": tsconfig({ include: ["src"] }),
      "src/a.ts": "export const a = 1;",
      "broken/tsconfig.json": "{ not json",
    });
    const discovery = discoverProjects(root, DEFAULT_CONFIG);
    expect(discovery.projects.map((p) => p.tsconfig)).toEqual(["tsconfig.json"]);
    expect(discovery.warnings).toHaveLength(1);
    expect(discovery.warnings[0]).toMatch(/^broken\/tsconfig\.json: /);
  });

  it("fails when an explicit tsconfig does not exist", () => {
    const root = writeRepo({ "src/a.ts": "" });
    expect(() => discoverProjects(root, { ...DEFAULT_CONFIG, tsconfigs: ["nope/tsconfig.json"] })).toThrow(
      "tsconfig not found: nope/tsconfig.json",
    );
  });
});

describe("config", () => {
  it("returns the defaults without a config file", () => {
    expect(loadConfig(writeRepo({}))).toEqual(DEFAULT_CONFIG);
  });

  it("reads paralog.config.json", () => {
    const root = writeRepo({ "paralog.config.json": JSON.stringify({ exclude: ["scripts/**"] }) });
    expect(loadConfig(root)).toEqual({ ...DEFAULT_CONFIG, exclude: ["scripts/**"] });
  });

  it.each([
    [[], "must contain a JSON object"],
    [{ exclud: [] }, "unknown option 'exclud'"],
    [{ exclude: "src" }, "'exclude' must be an array of strings"],
    [{ defaultExcludes: "no" }, "'defaultExcludes' must be a boolean"],
  ])("rejects %j", (data, message) => {
    expect(() => parseConfig(data)).toThrow(ConfigError);
    expect(() => parseConfig(data)).toThrow(message);
  });

  it("rejects invalid JSON", () => {
    expect(() => loadConfig(writeRepo({ "paralog.config.json": "{" }))).toThrow("invalid JSON");
  });
});
