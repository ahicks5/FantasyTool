import { expect, test, type Page, type Route } from "@playwright/test";
import { DEV_USER } from "../playwright.config";
import { SECTIONS } from "../src/lib/vocab";

/**
 * Every page of the app at 375px, against the fixture API (`scripts/serve_fixtures.py`).
 *
 * This replaces the one-off manual browser pass recorded in TASKS.md. Each page must:
 *   1. answer HTTP 200,
 *   2. log no console errors and throw no uncaught exception,
 *   3. not scroll sideways (the whole app is mobile-first),
 *   4. actually render its content — a skeleton or a "connect a league" gate is a failure.
 *
 * Assertions are structural, never about particular numbers: the engine's output moves
 * week to week and version to version, and a smoke test that pins numbers is a tripwire,
 * not a test.
 */

/** The fixture league, as the browser would have stored it after /connect. */
const CONNECTION = {
  platform: "sleeper",
  league_id: "1403186749361901568",
  league_name: "The Megalabowl",
  team_id: "5",
  team_name: "GoldenPP",
  week: 2,
};

/** Headshots and team logos live on Sleeper's CDN. Offline test: serve a 1x1 PNG instead. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function isLocal(url: string): boolean {
  const { hostname } = new URL(url);
  return hostname === "127.0.0.1" || hostname === "localhost";
}

async function stubExternal(route: Route): Promise<void> {
  const req = route.request();
  if (isLocal(req.url())) return route.continue();
  if (req.resourceType() === "image") return route.fulfill({ contentType: "image/png", body: PNG_1X1 });
  return route.fulfill({ status: 200, contentType: "text/plain", body: "" });
}

interface Visit {
  status: number;
  problems: string[];
}

async function visit(page: Page, path: string): Promise<Visit> {
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`));
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  return { status: res?.status() ?? 0, problems };
}

/**
 * The page itself must not scroll sideways at 375px.
 *
 * `body { overflow-x: hidden }` in globals.css means the document's scrollWidth never grows,
 * so measuring it as-is would pass no matter how far content stuck out — the bar would be
 * "the overflow is hidden", not "there is none". So un-clip the body for the measurement,
 * read the real scrollWidth, and put it back. Inner scrollers (overflow-x on a child) still
 * clip their own content, so a deliberate horizontal strip does not fail this.
 */
async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const box = await page.evaluate(() => {
    const d = document.documentElement;
    const previous = document.body.style.overflowX;
    document.body.style.overflowX = "visible";
    void d.offsetWidth; // force reflow before reading
    const scrollWidth = d.scrollWidth;
    const clientWidth = d.clientWidth;
    // Name the widest visible element, so a failure points at the culprit.
    let worst = { tag: "", right: 0 };
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.right > worst.right) {
        worst = { tag: `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 140), right: r.right };
      }
    }
    document.body.style.overflowX = previous;
    return { scrollWidth, clientWidth, worst };
  });
  expect(
    box.scrollWidth,
    `horizontal overflow: scrollWidth ${box.scrollWidth} > clientWidth ${box.clientWidth}; widest element right edge ${Math.round(box.worst.right)} (${box.worst.tag})`,
  ).toBeLessThanOrEqual(box.clientWidth + 1);
}

test.beforeEach(async ({ context, page }) => {
  await context.route("**/*", stubExternal);
  // Seed the stored league before any app script runs, so the pages skip the connect gate.
  await context.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* blocked storage: the test will fail on content instead */
      }
    },
    // Must match `KEY` in web/src/lib/storage.ts. It was `edge.connection` before the
    // rebrand and this seed was not carried over, so every page below rendered the connect
    // gate and the suite went dark on six of its eight tests without anyone being told.
    ["booth.connection", JSON.stringify(CONNECTION)] as const,
  );
  page.setDefaultTimeout(15_000);
});

interface PageCase {
  path: string;
  name: string;
  check: (page: Page) => Promise<void>;
}

const PAGES: PageCase[] = [
  {
    path: "/",
    name: "landing",
    check: async (page) => {
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // By destination, not by label: the CTA's words live in vocab.ts and have already
      // changed once ("Connect your league" -> "Open the Penthouse · free"), which left
      // this assertion looking for a link that no longer existed.
      await expect(page.locator('a[href="/connect"]').first()).toBeVisible();
    },
  },
  {
    path: "/connect",
    name: "connect",
    check: async (page) => {
      // Nothing is selected on arrival: the two platform buttons are the whole screen,
      // and the one box only exists once one of them is picked.
      const sleeper = page.getByRole("radio", { name: "Sleeper" });
      await expect(sleeper).toBeVisible();
      await expect(page.getByRole("radio", { name: "ESPN" })).toBeVisible();
      // Yahoo is a roadmap marker with no connector behind it in edge/. It must be visible
      // and unpickable: never offered as a third radio, and disabled if it is reached.
      await expect(page.getByRole("radio", { name: /yahoo/i })).toHaveCount(0);
      const yahoo = page.getByRole("button", { name: /yahoo/i });
      await expect(yahoo).toBeVisible();
      await expect(yahoo).toBeDisabled();
      await expect(page.locator("#sleeper-input")).toHaveCount(0);
      await sleeper.click();
      await expect(page.locator("#sleeper-input")).toBeVisible();

      // The wipe stays reachable while the saved cookies still work. "Forget these" lives
      // inside EspnAuthForm, and that form only mounts once a request has come back saying
      // the league is private — so without a second control, someone whose cookies work has
      // no way to delete them until they expire. They are a read session for a whole ESPN
      // account on what may be a shared phone, so this one is a promise, not a convenience.
      // Must match KEY in web/src/lib/espnAuth.ts.
      await page.evaluate(() =>
        localStorage.setItem("booth.espn.auth", JSON.stringify({ s2: "fixture-s2", swid: "{fixture-swid}" })),
      );
      await page.reload();
      await page.getByRole("radio", { name: "ESPN" }).click();
      const forget = page.getByRole("button", { name: /forget it/i });
      await expect(forget).toBeVisible();
      await forget.click();
      await expect(forget).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem("booth.espn.auth"))).toBeNull();
    },
  },
  {
    path: "/home",
    name: "action feed",
    check: async (page) => {
      // The hero names the week and team once the feed has loaded.
      await expect(page.getByText(`Week ${CONNECTION.week}`).first()).toBeVisible();
      await expect(page.getByText(CONNECTION.team_name).first()).toBeVisible();
      // The sheet is a row per room now — the three benches that own calls, then the film,
      // which owns none. Every one renders even when it holds nothing: that empty row is
      // the whole feature, and the film's row is what makes the front page a map of the
      // building rather than a list of this week's chores.
      // Assert the words rather than a role: a bench with no calls is deliberately a plain
      // row and not a control, and in this fixture the depth chart is exactly that, so
      // looking for buttons here fails on the case the grouping exists to show.
      // Scoped to `main` because the tab bar says several of these words too.
      const sheet = page.locator("main");
      for (const key of ["team", "waivers", "trade", "report"] as const) {
        await expect(sheet.getByText(SECTIONS[key].title, { exact: true }).first()).toBeVisible();
      }
      // Every row is a door. The film's is the one with nothing to expand, so if rooms ever
      // stop linking out it is the row that proves it — there is no other way into it here.
      await expect(sheet.getByRole("link", { name: `Go to ${SECTIONS.report.title}` })).toBeVisible();
      // The cards are folded behind whichever rows do have calls. Group rows are the only
      // `<section>` with a disclosure — cards are `<article>` — so this cannot catch a
      // card's own Why? toggle by accident.
      const toggles = sheet.locator("section button[aria-expanded]");
      expect(await toggles.count(), "no group on the sheet had anything to open").toBeGreaterThan(0);
      await toggles.first().click();
      // At least one action card, and cards are <article>, not skeletons.
      const cards = page.locator("main article");
      await expect(cards.first()).toBeVisible();
      expect(await cards.count()).toBeGreaterThan(0);
    },
  },
  {
    path: "/team",
    name: "lineup",
    check: async (page) => {
      await expect(page.getByText(/Projected/i).first()).toBeVisible();
      // A full lineup: one row per starting slot (9 in this league), each naming its slot.
      const slots = page.locator("main li", { hasText: /^(QB|RB|WR|TE|FLEX|DEF|K)/ });
      await expect(slots.first()).toBeVisible();
      expect(await slots.count()).toBeGreaterThanOrEqual(9);
    },
  },
  {
    path: "/waivers",
    name: "waiver plan",
    check: async (page) => {
      // Paid page, unlocked for this user: the budget hero, then either claims or an
      // explained hold. A paywall or an error box here means the smoke test failed.
      // Both words, because the hero reads one or the other off `plan.waiver_type`.
      await expect(page.getByText(/Budget left|Waiver order/i).first()).toBeVisible();
      // Either the first claim's CTA, or the Hold stamp a quiet week gets instead.
      // Anchored, so the word "hold" inside a sentence of prose does not satisfy it.
      await expect(page.getByText(/^(Claim him|Hold)$/).first()).toBeVisible();
      await expect(page.getByText(/requires a purchase/i)).toHaveCount(0);
    },
  },
  {
    path: "/trade",
    name: "trade lab",
    check: async (page) => {
      await expect(page.getByRole("tab", { name: /find a trade/i })).toBeVisible();
      await expect(page.getByRole("tab", { name: /grade an offer/i })).toBeVisible();
      await expect(page.getByText(/requires a purchase/i)).toHaveCount(0);
    },
  },
  {
    path: "/report",
    name: "full report",
    check: async (page) => {
      // The film is every section in one payload. Its waiver section is named from
      // vocab, so take it from there rather than typing the word twice.
      await expect(page.getByRole("heading", { name: "On the field" })).toBeVisible();
      await expect(page.getByRole("heading", { name: SECTIONS.waivers.title })).toBeVisible();
      await expect(page.getByText(/requires a purchase/i)).toHaveCount(0);
    },
  },
];

for (const p of PAGES) {
  test(`${p.path} (${p.name}) renders clean at 375px`, async ({ page }) => {
    const { status, problems } = await visit(page, p.path);
    expect(status, `${p.path} should answer 200`).toBe(200);
    await p.check(page);
    await assertNoHorizontalOverflow(page);
    expect(problems, `${p.path} logged browser errors`).toEqual([]);
  });
}

test("the API really is the fixture server, not mocks", async ({ page }) => {
  // If NEXT_PUBLIC_API_URL were unset the app would quietly serve src/lib/mocks.ts and the
  // whole suite would pass without ever touching the engine. Catch that here.
  const seen: string[] = [];
  page.on("request", (r) => r.url().includes("/api/") && seen.push(r.url()));
  await page.goto("/home");
  // Attached, not visible: the call sheet folds its cards behind the group rows, and this
  // test is about where the data came from rather than about what is on screen.
  await expect(page.locator("main article").first()).toBeAttached();
  expect(seen.some((u) => u.includes("/actions")), `no API calls seen: ${seen.join(", ")}`).toBe(true);
  expect(DEV_USER).toContain("@");
});

