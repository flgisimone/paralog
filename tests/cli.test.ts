import { describe, expect, it } from "vitest";
import { ExitCode, run, type CliIO } from "../src/cli/index.js";
import { VERSION } from "../src/index.js";
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
  it.each([["--version"], ["-v"]])("prints the version with %s", (flag) => {
    const io = capture();
    expect(run([flag], io)).toBe(ExitCode.Ok);
    expect(io.out).toBe(`${VERSION}\n`);
  });

  it.each([[[]], [["--help"]], [["help"]]])("prints the help with %j", (args) => {
    const io = capture();
    expect(run(args, io)).toBe(ExitCode.Ok);
    expect(io.out).toContain("Usage:");
  });

  it("fails with exit code 2 on an unknown command", () => {
    const io = capture();
    expect(run(["frobnicate"], io)).toBe(ExitCode.Error);
    expect(io.err).toContain("unknown command 'frobnicate'");
  });

  it("fails with exit code 2 on an unknown option", () => {
    const io = capture();
    expect(run(["--nope"], io)).toBe(ExitCode.Error);
    expect(io.err).toContain("--help");
  });
});

describe("cli units", () => {
  it("prints the units of a repository as JSON", () => {
    const root = writeRepo({
      "tsconfig.json": STRICT_TSCONFIG,
      "src/a.ts": "export function double(n: number): number { return n * 2; }",
    });
    const io = capture();
    expect(run(["units", root, "--no-cache"], io)).toBe(ExitCode.Ok);
    const units = JSON.parse(io.out) as { id: string }[];
    expect(units.map((u) => u.id)).toEqual(["src/a.ts#double:function"]);
    expect(io.err).toMatch(/^1 units from 1 files in 1 projects \(0 files excluded, 0 cached\) in \d+\.\ds\n$/);
  });

  it("fails with exit code 2 on a missing directory", () => {
    const io = capture();
    expect(run(["units", "/does/not/exist"], io)).toBe(ExitCode.Error);
    expect(io.err).toContain("not a directory");
  });
});
