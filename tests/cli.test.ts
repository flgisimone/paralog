import { describe, expect, it } from "vitest";
import { ExitCode, run, type CliIO } from "../src/cli/index.js";
import { VERSION } from "../src/index.js";
import { validateCandidates } from "../benchmarks/schema.js";
import { STRICT_TSCONFIG, writeRepo } from "./helpers.js";

function capture(): CliIO & { out: string; err: string } {
  const io = {
    out: "",
    err: "",
    stdout(text: string) {
      io.out += text;
    },
    stderr(text: string) {
      io.err += text;
    },
  };
  return io;
}

describe("cli", () => {
  it.each([["--version"], ["-v"]])("prints the version with %s", async (flag) => {
    const io = capture();
    expect(await run([flag], io)).toBe(ExitCode.Ok);
    expect(io.out).toBe(`${VERSION}\n`);
  });

  it.each([[[]], [["--help"]], [["help"]]])("prints the help with %j", async (args) => {
    const io = capture();
    expect(await run(args, io)).toBe(ExitCode.Ok);
    expect(io.out).toContain("Usage:");
  });

  it("fails with exit code 2 on an unknown command", async () => {
    const io = capture();
    expect(await run(["frobnicate"], io)).toBe(ExitCode.Error);
    expect(io.err).toContain("unknown command 'frobnicate'");
  });

  it("fails with exit code 2 on an unknown option", async () => {
    const io = capture();
    expect(await run(["--nope"], io)).toBe(ExitCode.Error);
    expect(io.err).toContain("--help");
  });
});

describe("cli units", () => {
  it("prints the units of a repository as JSON", async () => {
    const root = writeRepo({
      "tsconfig.json": STRICT_TSCONFIG,
      "src/a.ts": "export function double(n: number): number { return n * 2; }",
    });
    const io = capture();
    expect(await run(["units", root, "--no-cache"], io)).toBe(ExitCode.Ok);
    const units = JSON.parse(io.out) as { id: string }[];
    expect(units.map((u) => u.id)).toEqual(["src/a.ts#double:function"]);
    expect(io.err).toMatch(/^1 units from 1 files in 1 projects \(0 files excluded, 0 cached\) in \d+\.\ds\n$/);
  });

  it("fails with exit code 2 on a missing directory", async () => {
    const io = capture();
    expect(await run(["units", "/does/not/exist"], io)).toBe(ExitCode.Error);
    expect(io.err).toContain("not a directory");
  });
});

describe("cli candidates", () => {
  const shop = new URL("../benchmarks/fixtures/shop", import.meta.url).pathname;

  it("prints ranked pairs with their signals", async () => {
    const io = capture();
    expect(await run(["candidates", shop, "--limit", "2", "--no-cache"], io)).toBe(ExitCode.Ok);
    expect(io.out).toMatch(/^ {2}1\. \d\.\d\d {2}packages\//);
    expect(io.out).toContain("shared: ");
    expect(io.out).not.toContain("  3. ");
    expect(io.err).toMatch(/\d+ of 3321 pairs compared, 2 candidates/);
  });

  it("prints the benchmark format with --json", async () => {
    const io = capture();
    expect(await run(["candidates", shop, "--json", "--no-cache"], io)).toBe(ExitCode.Ok);
    const output = JSON.parse(io.out) as unknown;
    expect(validateCandidates(output).ok).toBe(true);
  });

  it("rejects a bad --limit", async () => {
    const io = capture();
    expect(await run(["candidates", shop, "--limit", "zero"], io)).toBe(ExitCode.Error);
  });
});
