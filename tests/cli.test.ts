import { describe, expect, it } from "vitest";
import { ExitCode, run, type CliIO } from "../src/cli/index.js";
import { VERSION } from "../src/index.js";

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
