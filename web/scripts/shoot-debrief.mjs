/**
 * Screenshots of the Debrief, both themes, both widths.
 *
 * Shot against the static demo export (`npm run demo && npm run demo:pack`) rather than
 * the fixture API, and that is a deliberate choice: the Megalabowl fixture's week-2
 * lineup is genuinely settled and its only recorded week never played, so no fixture
 * request will ever show the swap badge on the starters plate, the head coach's memo
 * with a call on it, or the last-week line on the film room's memo. The mock build
 * carries all three (`docs/HANDOFF.md` records the same trap for the last-week line).
 * The fixture build is what `web/e2e/smoke.spec.ts` asserts against; this is what a
 * populated week looks like.
 *
 *   cd web && npm run demo && npm run demo:pack
 *   node scripts/shoot-debrief.mjs <dir>         # writes to /tmp/debrief-shots by default
 *
 * The two traps in `docs/HANDOFF.md` are both handled here: `booth.connection` is
 * seeded before any app script runs, or every shot is of the connect gate; and the
 * staged "Opening the Penthouse" sequence is waited out, or every shot is of a spinner.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "outpub");
const OUT = resolve(process.argv[2] ?? "/tmp/debrief-shots");
const PORT = Number(process.env.SHOT_PORT ?? 4311);

/** The recorded Megalabowl, as the browser would have stored it after /connect. */
const CONNECTION = {
  platform: "sleeper",
  league_id: "1403186749361901568",
  league_name: "The Megalabowl",
  team_id: "8",
  team_name: "HusH",
  week: 2,
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

/** Static host for the packed export: a path, that path's index.html, or 404. */
const server = createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  for (const candidate of [join(ROOT, path), join(ROOT, path, "index.html"), `${join(ROOT, path)}.html`]) {
    if (existsSync(candidate) && extname(candidate)) {
      res.writeHead(200, { "content-type": TYPES[extname(candidate)] ?? "application/octet-stream" });
      res.end(await readFile(candidate));
      return;
    }
  }
  res.writeHead(404).end("not found");
});

await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const browser = await chromium.launch();
try {
  for (const theme of ["dark", "light"]) {
    for (const width of [320, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1400 }, deviceScaleFactor: 2 });
      await context.addInitScript(
        ([conn, t]) => {
          try {
            window.localStorage.setItem("booth.connection", conn);
            // The theme is not read off the OS; it is whatever this key says, applied by
            // the boot script before the first paint (docs/WEB.md).
            window.localStorage.setItem("booth.theme", t);
          } catch {
            /* blocked storage: the shot will show the connect gate and say so */
          }
        },
        [JSON.stringify(CONNECTION), theme],
      );
      const page = await context.newPage();
      // Headshots live on Sleeper's CDN. Offline: let them fail to the painted initials,
      // which is also what risk L1 turning photos off would look like.
      await page.route("**/*", (route) =>
        new URL(route.request().url()).hostname === "127.0.0.1"
          ? route.continue()
          : route.abort(),
      );
      await page.goto(`http://127.0.0.1:${PORT}/home`, { waitUntil: "load" });
      // Wait the narrated opening out, then let the memos settle.
      await page.getByRole("heading", { level: 1, name: "Debrief" }).waitFor();
      await page.locator("main ol > li").first().waitFor();
      await page.waitForTimeout(1200);
      const file = join(OUT, `debrief-${theme}-${width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
