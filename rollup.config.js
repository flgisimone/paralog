import { builtinModules } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import typescript from "@rollup/plugin-typescript";
import { dts } from "rollup-plugin-dts";

const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "package.json"), "utf8"));

const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies });
const external = (id) =>
  id.startsWith("node:") ||
  builtinModules.includes(id) ||
  dependencies.some((dep) => id === dep || id.startsWith(`${dep}/`));

const entries = {
  index: "src/index.ts",
  mcp: "src/mcp/index.ts",
  cli: "src/cli/main.ts",
};

export default [
  {
    input: entries,
    external,
    output: {
      dir: "dist",
      format: "es",
      entryFileNames: "[name].js",
      chunkFileNames: "chunks/[name]-[hash].js",
      banner: (chunk) => (chunk.name === "cli" ? "#!/usr/bin/env node" : ""),
    },
    plugins: [
      typescript({
        tsconfig: "./tsconfig.build.json",
        compilerOptions: { module: "esnext", moduleResolution: "bundler" },
      }),
    ],
  },
  {
    input: { index: entries.index, mcp: entries.mcp },
    external,
    output: { dir: "dist", format: "es", entryFileNames: "[name].d.ts" },
    plugins: [dts({ tsconfig: "./tsconfig.build.json" })],
  },
];
