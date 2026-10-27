import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build (the service worker, and therefore
// offline mode, is only active in production). Run `npm run build` first.
const PORT = 3200;
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    locale: "en-US",
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
  },
  webServer: {
    command: `npx next start --port ${PORT}`,
    url: `${BASE}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { BETTER_AUTH_URL: BASE, DISABLE_AUTH_RATE_LIMIT: "1" },
  },
});
