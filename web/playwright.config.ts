import { defineConfig } from "@playwright/test";

/**
 * Browser smoke test: the real Next build talking to the real API, served from recorded
 * fixtures (`scripts/serve_fixtures.py`), so it runs in CI with zero network.
 *
 * Playwright boots both servers itself. The web server is *built* here rather than reused,
 * because NEXT_PUBLIC_* is inlined at build time — pointing the app at the fixture API is a
 * different build from the one `npm run build` produces.
 */
const API_PORT = Number(process.env.EDGE_FIXTURE_API_PORT ?? 8123);
const WEB_PORT = Number(process.env.EDGE_E2E_WEB_PORT ?? 3123);

export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;
/** Dev-header identity; `serve_fixtures.py` grants it the Full Report so paid pages render. */
export const DEV_USER = "smoke@example.com";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    // Mobile-first app: 375px is the narrowest phone we support, and where overflow shows up.
    viewport: { width: 375, height: 812 },
    browserName: "chromium",
    trace: "retain-on-failure",
    // Set PW_CHROMIUM_PATH when the sandbox's pinned Chromium is not the one this
    // @playwright/test would download (CI installs its own and leaves this unset).
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: `uv run --frozen python scripts/serve_fixtures.py --port ${API_PORT} --user ${DEV_USER}`,
      cwd: "..",
      url: `${API_URL}/api/products`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `npm run build && npm run start -- --port ${WEB_PORT}`,
      url: BASE_URL,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: { NEXT_PUBLIC_API_URL: API_URL, NEXT_PUBLIC_DEV_USER: DEV_USER },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
