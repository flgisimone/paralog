/**
 * npm run bench:units -- [--only <name>...]  (F2-06)
 *
 * Extracts the units of every fetched real repository twice, each time in a fresh process:
 * cold (empty cache) and warm (cache from the first run). Reports files, units, time and peak
 * memory. Run `npm run bench:fetch` first.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { CACHE_DIR } from "../src/cache.js";
import { parseArgs } from "node:util";
import { extractUnits } from "../src/extract.js";
import { loadRepos, repoRoot } from "./real.js";

interface Measure {
  readonly projects: number;
  readonly files: number;
  readonly units: number;
  readonly warnings: number;
  readonly seconds: number;
  readonly peakMemoryMb: number;
}

/** Child mode: measure one root and print the result as JSON. */
function measure(root: string): Measure {
  const started = performance.now();
  const { discovery, units } = extractUnits({ root, cache: true });
  return {
    projects: discovery.projects.length,
    files: discovery.projects.reduce((n, p) => n + p.files.length, 0),
    units: units.length,
    warnings: discovery.warnings.length,
    seconds: Math.round((performance.now() - started) / 100) / 10,
    peakMemoryMb: Math.round(process.resourceUsage().maxRSS / 1024),
  };
}

function main(): void {
  const { values } = parseArgs({ options: { only: { type: "string", multiple: true }, child: { type: "string" } } });
  if (values.child !== undefined) {
    process.stdout.write(JSON.stringify(measure(values.child)));
    return;
  }
  const rows = [
    "| Repository | Lines | tsconfigs | Files | Units | Warnings | Cold | Peak memory | Warm |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const repo of loadRepos().filter((r) => values.only === undefined || values.only.includes(r.name))) {
    const root = repoRoot(repo);
    if (!existsSync(root)) {
      process.stderr.write(`${repo.name}: not fetched, run npm run bench:fetch\n`);
      continue;
    }
    rmSync(join(root, CACHE_DIR), { recursive: true, force: true });
    const child = (): Measure =>
      JSON.parse(
        execFileSync(process.execPath, ["--max-old-space-size=4096", "--import", "tsx", import.meta.filename, "--child", root], {
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
          stdio: ["ignore", "pipe", "inherit"],
        }),
      ) as Measure;
    const m = child();
    const warm = child();
    rows.push(
      `| ${repo.name} | ${repo.lines} | ${m.projects} | ${m.files} | ${m.units} | ${m.warnings} | ${m.seconds.toFixed(1)} s | ${m.peakMemoryMb} MB | ${warm.seconds.toFixed(1)} s |`,
    );
    process.stderr.write(`${repo.name}: done\n`);
  }
  process.stdout.write(`${rows.join("\n")}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main();
}
