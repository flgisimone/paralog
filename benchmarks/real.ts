/**
 * Real repositories of the benchmark (F1-04).
 *
 * npm run bench:fetch -- [--only <name>...]
 *
 * Downloads every repository of benchmarks/real/repos.json at its pinned commit into
 * benchmarks/.repos/<name> (ignored by git). A repository already at the right commit is skipped.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { validateRepos, type RealRepo } from "./schema.js";

const BENCHMARKS = import.meta.dirname;
export const REPOS_DIR = join(BENCHMARKS, ".repos");

export function loadRepos(): readonly RealRepo[] {
  const result = validateRepos(JSON.parse(readFileSync(join(BENCHMARKS, "real", "repos.json"), "utf8")));
  if (!result.ok) throw new Error(`benchmarks/real/repos.json:\n  ${result.errors.join("\n  ")}`);
  return result.value.repos;
}

/** Directory paralog analyzes for a repository. */
export function repoRoot(repo: RealRepo): string {
  return join(REPOS_DIR, repo.name, repo.path ?? ".");
}

function git(args: readonly string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function currentSha(dir: string): string | undefined {
  if (!existsSync(join(dir, ".git"))) return undefined;
  try {
    return git(["rev-parse", "HEAD"], dir);
  } catch {
    return undefined;
  }
}

/** Shallow fetch of exactly the pinned commit. */
export function fetchRepo(repo: RealRepo): "skipped" | "fetched" {
  const dir = join(REPOS_DIR, repo.name);
  if (currentSha(dir) === repo.sha) return "skipped";
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(["init", "--quiet"], dir);
  git(["remote", "add", "origin", repo.url], dir);
  git(["fetch", "--quiet", "--depth", "1", "origin", repo.sha], dir);
  git(["-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD"], dir);
  return "fetched";
}

function main(): void {
  const { values } = parseArgs({ options: { only: { type: "string", multiple: true } } });
  const repos = loadRepos().filter((r) => values.only === undefined || values.only.includes(r.name));
  if (values.only !== undefined && repos.length !== values.only.length) {
    throw new Error(`unknown repository in --only; known: ${loadRepos().map((r) => r.name).join(", ")}`);
  }
  for (const repo of repos) {
    const started = performance.now();
    const outcome = fetchRepo(repo);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    process.stdout.write(`${repo.name}: ${outcome} ${repo.sha.slice(0, 12)} (${seconds}s)\n`);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`bench:fetch: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
