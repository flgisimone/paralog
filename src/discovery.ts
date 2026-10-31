import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import picomatch from "picomatch";
import { ts } from "ts-morph";
import { DEFAULT_EXCLUDES, SKIPPED_DIRECTORIES, type ParalogConfig } from "./config.js";

/** A tsconfig and the source files paralog analyzes with it. Paths are relative to the root, with forward slashes. */
export interface DiscoveredProject {
  readonly tsconfig: string;
  readonly files: readonly string[];
}

export interface Discovery {
  readonly root: string;
  readonly projects: readonly DiscoveredProject[];
  /** Files in some tsconfig that the exclude globs removed. */
  readonly excludedFiles: number;
  /** Problems that did not stop the discovery, such as an unreadable tsconfig. */
  readonly warnings: readonly string[];
}

const SOURCE_FILE = /\.(?:ts|tsx|mts|cts)$/;
const DECLARATION_FILE = /\.d\.(?:ts|mts|cts)$|\.d\.[^.]+\.ts$/;

export function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Every `tsconfig.json` under the root, skipping dependencies, build output and hidden directories. */
function findTsconfigs(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".")) walk(join(dir, entry.name));
      } else if (entry.isFile() && entry.name === "tsconfig.json") {
        found.push(join(dir, entry.name));
      }
    }
  };
  walk(root);
  return found;
}

function resolveReference(path: string): string {
  return existsSync(path) && statSync(path).isDirectory() ? join(path, "tsconfig.json") : path;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

function parseTsconfig(path: string): { parsed?: ts.ParsedCommandLine; error?: string } {
  let error: string | undefined;
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      error = formatDiagnostic(diagnostic);
    },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(path, {}, host);
  if (parsed === undefined) return { error: error ?? "cannot be read" };
  // "No inputs were found" is expected for solution-style tsconfigs that only hold references.
  const fatal = parsed.errors.filter((d) => d.category === ts.DiagnosticCategory.Error && d.code !== 18003);
  if (fatal.length > 0) return { parsed, error: fatal.map(formatDiagnostic).join("; ") };
  return { parsed };
}

/**
 * Finds the tsconfig files of a repository (including workspaces and project references)
 * and assigns every source file to the nearest tsconfig that includes it.
 */
export function discoverProjects(rootPath: string, config: ParalogConfig): Discovery {
  const root = resolve(rootPath);
  const warnings: string[] = [];
  const explicit = config.tsconfigs.length > 0;

  const queue = explicit ? config.tsconfigs.map((p) => resolveReference(resolve(root, p))) : findTsconfigs(root);
  const seen = new Set<string>();
  const filesByTsconfig = new Map<string, string[]>();

  while (queue.length > 0) {
    const tsconfig = queue.shift();
    if (tsconfig === undefined || seen.has(tsconfig)) continue;
    seen.add(tsconfig);
    const rel = toPosix(relative(root, tsconfig));
    if (!existsSync(tsconfig)) {
      if (explicit && config.tsconfigs.some((p) => resolveReference(resolve(root, p)) === tsconfig)) {
        throw new Error(`tsconfig not found: ${rel}`);
      }
      warnings.push(`${rel}: referenced tsconfig not found`);
      continue;
    }
    const { parsed, error } = parseTsconfig(tsconfig);
    if (error !== undefined) warnings.push(`${rel}: ${error}`);
    if (parsed === undefined) continue;

    for (const reference of parsed.projectReferences ?? []) {
      const target = resolveReference(resolve(reference.path));
      if (isInside(root, target)) queue.push(target);
    }
    filesByTsconfig.set(
      tsconfig,
      parsed.fileNames.map((f) => resolve(f)).filter((f) => SOURCE_FILE.test(f) && isInside(root, f)),
    );
  }

  const isExcluded = picomatch([...(config.defaultExcludes ? DEFAULT_EXCLUDES : []), ...config.exclude], {
    dot: true,
  });

  // A file included by several tsconfigs belongs to the nearest one (the deepest directory).
  const owner = new Map<string, string>();
  for (const [tsconfig, files] of filesByTsconfig) {
    for (const file of files) {
      const current = owner.get(file);
      if (current === undefined || dirname(tsconfig).length > dirname(current).length) owner.set(file, tsconfig);
    }
  }

  const projectFiles = new Map<string, string[]>();
  let excludedFiles = 0;
  for (const [file, tsconfig] of owner) {
    const rel = toPosix(relative(root, file));
    if (DECLARATION_FILE.test(rel) || isExcluded(rel)) {
      excludedFiles++;
      continue;
    }
    const list = projectFiles.get(tsconfig) ?? [];
    list.push(rel);
    projectFiles.set(tsconfig, list);
  }

  const projects = [...projectFiles]
    .map(([tsconfig, files]) => ({ tsconfig: toPosix(relative(root, tsconfig)), files: files.sort() }))
    .sort((a, b) => (a.tsconfig < b.tsconfig ? -1 : 1));

  return { root, projects, excludedFiles, warnings };
}
