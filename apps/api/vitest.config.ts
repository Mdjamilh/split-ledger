import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "api",
    include: ["test/**/*.test.ts"],
    // Each file boots its own database; PGlite start-up is the slow part.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
