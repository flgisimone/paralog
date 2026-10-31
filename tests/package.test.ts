import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index.js";
import { serverInfo } from "../src/mcp/index.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

describe("package", () => {
  it("exports the same version as package.json", () => {
    expect(VERSION).toBe(pkg.version);
  });

  it("describes the MCP server", () => {
    expect(serverInfo).toEqual({ name: "paralog", version: pkg.version });
  });
});
