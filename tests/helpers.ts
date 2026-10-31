import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

export const STRICT_TSCONFIG = JSON.stringify({
  compilerOptions: { strict: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", skipLibCheck: true },
});

/** Writes a temporary repository from a path → content map; removed after the test. */
export function writeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "paralog-test-"));
  created.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}
