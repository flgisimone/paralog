// Packs the tarball, installs it in a clean temporary project and runs the CLI and both entry points.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dir = mkdtempSync(join(tmpdir(), "paralog-smoke-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

try {
  const tarball = sh(npm, ["pack", "--silent", "--pack-destination", dir], root).trim().split("\n").pop();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "smoke", private: true, type: "module" }));
  sh(npm, ["install", "--silent", "--no-audit", "--no-fund", join(dir, tarball)], dir);

  const version = sh(join(dir, "node_modules", ".bin", "paralog"), ["--version"], dir).trim();
  if (version !== pkg.version) throw new Error(`paralog --version printed '${version}', expected '${pkg.version}'`);
  sh(join(dir, "node_modules", ".bin", "paralog"), ["--help"], dir);

  writeFileSync(
    join(dir, "check.js"),
    `import { VERSION } from "paralog";
import { serverInfo } from "paralog/mcp";
if (VERSION !== serverInfo.version) throw new Error("entry points disagree");`,
  );
  sh(process.execPath, ["check.js"], dir);
  console.log(`smoke ok: paralog ${version} from ${tarball}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
