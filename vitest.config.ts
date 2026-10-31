import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "benchmarks/**/*.test.ts"],
    exclude: ["**/node_modules/**", "benchmarks/.repos/**", "benchmarks/fixtures/**"],
  },
});
