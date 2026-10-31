import { describe, expect, it } from "vitest";
import { loadRepos } from "./real.js";
import { validateRepos } from "./schema.js";

describe("real repositories (F1-04)", () => {
  const repos = loadRepos();

  it("lists 6-8 repositories between 5k and 150k lines", () => {
    expect(repos.length).toBeGreaterThanOrEqual(6);
    expect(repos.length).toBeLessThanOrEqual(8);
    for (const repo of repos) {
      expect(repo.lines, repo.name).toBeGreaterThanOrEqual(5_000);
      expect(repo.lines, repo.name).toBeLessThanOrEqual(150_000);
    }
  });

  it("covers backends, frontends, libraries and monorepos", () => {
    expect(new Set(repos.map((r) => r.kind))).toEqual(new Set(["backend", "frontend", "library", "business", "monorepo"]));
  });

  const valid = {
    name: "x",
    url: "https://github.com/a/b",
    sha: "0".repeat(40),
    license: "MIT",
    kind: "library",
    description: "d",
    lines: 1,
  };

  it.each([
    ["a short sha", { sha: "abc" }],
    ["a non-https url", { url: "git@github.com:a/b.git" }],
    ["an unknown kind", { kind: "game" }],
    ["a path outside the repository", { path: "../other" }],
    ["an absolute path", { path: "/etc" }],
  ])("rejects %s", (_, patch) => {
    expect(validateRepos({ repos: [{ ...valid, ...patch }] }).ok).toBe(false);
  });

  it("rejects duplicate names", () => {
    expect(validateRepos({ repos: [valid, valid] })).toEqual({ ok: false, errors: ["/repos/1/name duplicate repository name 'x'"] });
  });
});
