import { defineConfig, devices } from "@playwright/test";

const PORT = 47314;
// Set BASE_URL to run the same suite against a deployment instead of a local build.
const external = process.env.BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  // Tests share one demo server, so keep them in a predictable order.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external
    ? undefined
    : {
        // The production bundle serving the built web app, on in-memory PGlite in demo mode.
        command: "node apps/api/dist/server.mjs",
        env: { PORT: String(PORT), WEB_ROOT: "apps/web/dist" },
        url: `http://localhost:${PORT}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
