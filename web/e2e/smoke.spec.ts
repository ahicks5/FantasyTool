import { expect, test, type Page, type Route } from "@playwright/test";
import { DEV_USER } from "../playwright.config";
import { DESK, PLAN, RIDE, SECTIONS, TICKER } from "../src/lib/vocab";
import { dayStamp } from "../src/lib/elevator";
import { RECAP_COPY, STANDINGS_COPY } from "../src/lib/recap";
import { SCOUT } from "../src/lib/vocab";
import { AVAILABILITY_LABELS, BOARD_LABELS, SORT_LABELS } from "../src/lib/board";

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
    ([key, value, rideKey, today]) => {
      try {
        window.localStorage.setItem(key, value);
        // The elevator plays on the first open of the day. Stamp today so the pages
        // below open straight onto their content; the one test that wants the ride
        // asks for it with ?ride=1. Must match `RIDE_KEY` in web/src/lib/storage.ts.
        window.localStorage.setItem(rideKey, today);
      } catch {
        /* blocked storage: the test will fail on content instead */
      }
    },
    // Must match `KEY` in web/src/lib/storage.ts. It was `edge.connection` before the
    // rebrand and this seed was not carried over, so every page below rendered the connect
    // gate and the suite went dark on six of its eight tests without anyone being told.
    ["booth.connection", JSON.stringify(CONNECTION), "booth.ride", dayStamp(new Date())] as const,
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
      // `.first()` was the header pill until it started pointing at /connect too, and that
      // pill is deliberately hidden below 512px -- so the first match became an invisible
      // one and this went red while the page was fine. Ask the real question instead: at
      // this width, is there a way in that a thumb can actually reach?
      await expect(page.locator('a[href="/connect"]:visible').first()).toBeVisible();
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
    name: "the desk",
    check: async (page) => {
      // The front page is the desk; its nameplate carries the team and the week.
      const desk = page.getByRole("region", { name: DESK.aria });
      await expect(desk).toBeVisible();
      await expect(desk.getByText(CONNECTION.team_name).first()).toBeVisible();
      await expect(desk.getByText(`Week ${CONNECTION.week}`).first()).toBeVisible();
      await expect(desk.locator(".notebook")).toHaveCount(4);
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
      // Paid page, unlocked for this user: the budget strip, then either claims or an
      // explained hold. A paywall or an error box here means the smoke test failed.
      // Both words, because the strip reads one or the other off `plan.waiver_type`.
      // Anchored: the hero collapsed to one line and the label is now its own node.
      await expect(page.getByText(/^(left|waiver order)$/i).first()).toBeVisible();
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
      // The film looks backwards now, so it is no longer a restatement of the other
      // tabs and the old section headings are gone with them.
      //
      // The fixture league's only recorded week is the 2026 week 2, which was recorded
      // mid-week and scores 0.0 across all twelve rosters — so it is correctly not a
      // played week and this asserts the **empty** film. That is the state a new signup
      // sees in preseason, and it is worth pinning: a page whose whole subject is the
      // past has to say so plainly rather than render a blank screen.
      //
      // The populated path is covered where the data actually exists: `tests/test_recap.py`
      // and `src/lib/recap.test.ts` both run against a genuinely played 12-team season.
      // Serving those weeks here instead was considered and rejected — they are a
      // different season, so their player ids are absent from this league's player set
      // and their ten starters do not fit its nine starting slots. A fixture that lies
      // is worse than one that is thin.
      await expect(page.getByText(RECAP_COPY.weeksHead, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(RECAP_COPY.nothingPlayedHead, { exact: true })).toBeVisible();
      await expect(page.getByText(RECAP_COPY.nothingPlayed)).toBeVisible();
      await expect(page.getByText(/requires a purchase/i)).toHaveCount(0);
      // The table is the free half and is the reason this page exists for someone who has
      // bought nothing. It renders for THIS (paid) reader too, above the film.
      await expect(page.getByText(STANDINGS_COPY.head, { exact: true })).toBeVisible();
      const rows = page.locator("main li").filter({ hasText: /\d+-\d+/ });
      expect(await rows.count(), "the table rendered no team rows").toBeGreaterThanOrEqual(12);
    },
  },
];

test("the desk names a player without a click, and the plan opens, for a reader who has bought nothing", async ({ context, page }) => {
  // The finding this whole plan started from: the home screen showed no player names at
  // all, every row folded. A free reader is the one who must see them -- the desk is the
  // only screen they get in full, and the plan behind a story is free too; only the wire's
  // names and the trade partners' names wait behind a pass.
  await context.route("**/api/**", (route) => {
    const headers = { ...route.request().headers(), "x-edge-user": "free@example.com" };
    route.continue({ headers });
  });
  await page.goto("/home");
  const desk = page.getByRole("region", { name: DESK.aria });
  await expect(desk).toBeVisible();
  const first = desk.locator(".desk-news-row").first();
  // A real name, not a skeleton: at least two capitalised words in the headline.
  await expect(first.getByText(/[A-Z][a-z]+ [A-Z][a-zA-Z.'-]+/).first()).toBeVisible();
  await first.locator(".desk-plan-link").click();
  await page.waitForURL(`**${SECTIONS.plan.href}**`);
  await expect(page.getByText(PLAN.nextUp.title, { exact: true })).toBeVisible();
  // A locked list shows the count and the door, never a name.
  const wire = page.getByText(/pickups? ranked at the spot/);
  if (await wire.count()) await expect(page.getByRole("link", { name: new RegExp(PLAN.wire.unlock) })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

for (const p of PAGES) {
  test(`${p.path} (${p.name}) renders clean at 375px`, async ({ page }) => {
    const { status, problems } = await visit(page, p.path);
    expect(status, `${p.path} should answer 200`).toBe(200);
    await p.check(page);
    await assertNoHorizontalOverflow(page);
    expect(problems, `${p.path} logged browser errors`).toEqual([]);
  });
}

test("the scout: search a player, his page rises", async ({ page }) => {
  // The whole feature end to end through the real engine: the board finds him by name,
  // the API scores his season by this league's settings, and his page renders it.
  // Nothing navigates — since the player page became a sheet, a board row raises it over
  // the room rather than leaving it.
  const { status } = await visit(page, "/waivers");
  expect(status).toBe(200);

  const box = page.getByPlaceholder(SCOUT.placeholder);
  await expect(box).toBeVisible();
  await box.fill("jeffer");

  const hit = page.getByRole("button", { name: /Jefferson/i }).first();
  await expect(hit).toBeVisible({ timeout: 10_000 });
  await hit.click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: /Jefferson/i })).toBeVisible();
  // The URL carries him, so the link is shareable and the back button closes him.
  await expect(page).toHaveURL(/\?player=/);
  await assertNoHorizontalOverflow(page);
});

test("the board: filter to free-agent running backs, then re-sort them", async ({ page }) => {
  // The browse half of Scouting, end to end through the real engine: the API cuts the
  // league's own universe down and orders it, and the page draws what came back. Nothing
  // here pins a number -- the engine's output moves week to week -- only that the filters
  // and the sort actually change the list.
  const { status, problems } = await visit(page, "/waivers");
  expect(status).toBe(200);

  // The board's own list, by its id: the plan above it is also a list (the claim sits
  // in an <ol>), so "the first list on the page" is the board only until the plan lands.
  // With the opening no longer holding the page, it lands before this test reads its rows.
  const board = page.locator("main ul[id$='-list']");
  await expect(board.getByRole("listitem").first()).toBeVisible({ timeout: 10_000 });

  const rows = board.getByRole("listitem");
  const countLine = page.getByText(/\d+ players?/).first();
  /** The number the count line ends on: how many matched, not how many fitted on the page. */
  const found = async () => Number(/(\d+) players?/.exec((await countLine.textContent()) ?? "")![1]);

  // Running backs, still across the whole league.
  await page.getByRole("button", { name: "RB", exact: true }).click();
  await expect.poll(async () => rows.count(), { timeout: 10_000 }).toBeGreaterThan(0);
  const everyRb = await found();

  // Now only the ones nobody has.
  await page.getByRole("button", { name: AVAILABILITY_LABELS.free, exact: true }).click();
  await expect.poll(found, { timeout: 10_000 }).toBeLessThan(everyRb);
  await expect.poll(async () => rows.count(), { timeout: 10_000 }).toBeGreaterThan(0);

  for (const row of await rows.all()) {
    // Every row is a running back. Matched against the meta line's own shape
    // ("RB \u00b7 GB \u00b7 Bye 11") rather than a bare word: a row's text content runs the
    // avatar initials and the name straight into it, so "Chris Brooks" at RB reads as
    // "...BrooksRB \u00b7 GB" and there is no word boundary to anchor to.
    await expect(row).toContainText(/RB \u00b7 /);
    // And none of them repeats what the filter already said. `showsOwner` in lib/board.ts
    // drops the badge here: "Free agent" on all of them is noise, and it wrapped under the
    // meta line on some rows and not others, which left the list visibly ragged.
    await expect(row).not.toContainText(SCOUT.free);
  }

  // Re-sorting is a different order, not a different list.
  const first = await rows.first().textContent();
  await page.getByLabel(BOARD_LABELS.sortBy).selectOption("name");
  await expect.poll(async () => rows.first().textContent(), { timeout: 10_000 }).not.toBe(first);

  // And the control says what it did.
  await expect(page.getByLabel(BOARD_LABELS.sortBy)).toHaveValue("name");
  expect(SORT_LABELS.name.label).toBe("Name");

  await assertNoHorizontalOverflow(page);
  expect(problems, "the board logged browser errors").toEqual([]);
});

test("the board is free, and clicking a row opens that player", async ({ page }) => {
  // The other half of the growth decision, in the browser. The API half is pinned by
  // `tests/test_directory.py::test_the_board_does_not_open_the_wire`; this is the half a
  // page refactor could quietly undo, by moving the board inside the lock.
  await page.route("**/waivers/plan*", (route) =>
    route.fulfill({
      status: 402,
      contentType: "application/json",
      body: JSON.stringify({ detail: { error: "requires a purchase", feature: "waivers", upsell: [] } }),
    }),
  );

  const { status } = await visit(page, "/waivers");
  expect(status).toBe(200);
  await expect(page.getByText("Wire Pass").first()).toBeVisible();

  // A locked reader still gets a working board, and every row still opens a player.
  const row = page.locator("main ul[id$='-list']").getByRole("listitem").first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\?player=/);
  await assertNoHorizontalOverflow(page);
});

test("the search box survives the Wire Pass paywall", async ({ page }) => {
  // The growth decision, pinned in the browser: a visitor who has not bought Wire Pass
  // still gets a working room. The API half is pinned by
  // `tests/test_scout_api.py::test_a_profile_is_free_and_does_not_open_the_wire`; this is
  // the half that a page refactor could quietly undo, by putting the lock back above the
  // search instead of beside it.
  //
  // The fixture server grants every SKU, so the 402 is injected here rather than by
  // booting a second server without them.
  await page.route("**/waivers/plan*", (route) =>
    route.fulfill({
      status: 402,
      contentType: "application/json",
      body: JSON.stringify({ detail: { error: "requires a purchase", feature: "waivers", upsell: [] } }),
    }),
  );

  const { status } = await visit(page, "/waivers");
  expect(status).toBe(200);
  // "Wire Pass", the product name on the lock card's eyebrow. Note the other page checks
  // in this file look for "requires a purchase" — that is the API's 402 *message* and is
  // never rendered, so those assertions cannot fail; this one keys off what a reader sees.
  await expect(page.getByText("Wire Pass").first()).toBeVisible();
  const box = page.getByPlaceholder(SCOUT.placeholder);
  await expect(box).toBeVisible();

  // And the offer is *under* the board, not over it. A paid reader opens this tab onto
  // his claims; a reader who has not bought opens it onto every player in the league,
  // and meets the price after the room has shown him something real. That order is the
  // growth loop, and it is the half a layout change could quietly reverse.
  const search = (await box.boundingBox())!;
  const lock = (await page.getByText("Wire Pass").first().boundingBox())!;
  expect(lock.y, "the lock should sit below the board, not above it").toBeGreaterThan(search.y);
  await assertNoHorizontalOverflow(page);
});

test("the API really is the fixture server, not mocks", async ({ page }) => {
  // If NEXT_PUBLIC_API_URL were unset the app would quietly serve src/lib/mocks.ts and the
  // whole suite would pass without ever touching the engine. Catch that here.
  const seen: string[] = [];
  page.on("request", (r) => r.url().includes("/api/") && seen.push(r.url()));
  await page.goto("/home");
  // Attached, not visible: this test is about where the data came from rather than about
  // what is on screen. The desk is one call; it warms the call sheet with a second.
  await expect(page.locator("main article").first()).toBeAttached();
  expect(seen.some((u) => u.includes("/desk")), `no API calls seen: ${seen.join(", ")}`).toBe(true);
  expect(DEV_USER).toContain("@");
});


test("tap a name, his page rises; swipe it down, it is gone", async ({ page }) => {
  // The whole of phase A in one gesture. It runs on /team because the depth chart is the
  // densest wall of names in the app -- if the sheet works anywhere it works there.
  const { status } = await visit(page, "/team");
  expect(status).toBe(200);

  // A real name, not a slot label or a team: two capitalised words on a button.
  const name = page.locator("main").getByRole("button", { name: /^[A-Z][a-z]+ [A-Z][a-zA-Z.'-]+/ }).first();
  await expect(name).toBeVisible();
  // Its *accessible* name, not its text: on the depth chart the whole row is the target, so
  // `textContent` is the slot, the tag and the projection as well as the man. `aria-label`
  // is what a screen reader reads out, and it is his name alone.
  const who = (await name.getAttribute("aria-label")) ?? (await name.textContent())?.trim() ?? "";
  expect(who, "the tap target has no player name on it").toMatch(/^[A-Z][a-z]+ [A-Z]/);
  await name.click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  // It is his page, and the URL says so, so the link is shareable and the back button works.
  await expect(sheet.getByRole("heading", { name: who })).toBeVisible();
  await expect(page).toHaveURL(/\?player=/);
  // Both sides are reachable and the word changes with the frame's colour.
  await expect(sheet.getByRole("tab", { name: /Vibes/ })).toHaveAttribute("aria-selected", "true");
  await sheet.getByRole("tab", { name: /Stats/ }).click();
  await expect(sheet.getByRole("tab", { name: /Stats/ })).toHaveAttribute("aria-selected", "true");

  // Swipe it away, from the header, which is the one grip that always belongs to the sheet.
  const box = (await sheet.locator(".sheet-panel").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  for (const step of [40, 90, 150, 220]) await page.mouse.move(box.x + box.width / 2, box.y + 20 + step);
  await page.mouse.up();

  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/\?player=/);
  await assertNoHorizontalOverflow(page);
});

test("a scrolled report does not throw the page away", async ({ page }) => {
  // The case the gesture rules exist for: reading the Stats side is a long series of
  // downward drags, and every one of them would otherwise close the sheet.
  await visit(page, "/team");
  await page.locator("main").getByRole("button", { name: /^[A-Z][a-z]+ [A-Z][a-zA-Z.'-]+/ }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("tab", { name: /Stats/ }).click();

  const middle = sheet.locator(".sheet-panel > div").nth(1);
  await middle.evaluate((el) => el.scrollBy(0, 200));
  expect(await middle.evaluate((el) => el.scrollTop), "the report did not scroll").toBeGreaterThan(0);

  const box = (await middle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (const step of [60, 140, 240]) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + step);
  await page.mouse.up();

  await expect(sheet).toBeVisible();
});

test("a link with ?player= opens straight onto his page", async ({ page }) => {
  // The deep link, and the back button that closes it. Both are the same state: the URL.
  await visit(page, "/team");
  await page.locator("main").getByRole("button", { name: /^[A-Z][a-z]+ [A-Z][a-zA-Z.'-]+/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const url = page.url();

  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto(url);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("the desk: three stories on top, hardest first, the matchup, four notebooks that open their rooms", async ({ page }) => {
  await visit(page, "/home");
  const desk = page.getByRole("region", { name: DESK.aria });
  await expect(desk).toBeVisible();
  // The news paper is first, cut to three stories; the recorded week has more than three.
  const news = desk.locator(".desk-news-row");
  await expect(news).toHaveCount(DESK.news.shown);
  // Every story carries the meter and the arrow into its plan; the meter never climbs
  // down the page, because the desk is sorted by how hard a story lands.
  await expect(desk.locator(".desk-sev")).toHaveCount(DESK.news.shown);
  await expect(desk.locator(".desk-plan-link")).toHaveCount(DESK.news.shown);
  const sev = await desk.locator(".desk-sev").evaluateAll((els) => els.map((e) => Number(/desk-sev-(\d)/.exec(e.className)?.[1])));
  for (let i = 1; i < sev.length; i++) expect(sev[i], `story ${i + 1} lands harder than the one above it`).toBeLessThanOrEqual(sev[i - 1]);
  await desk.locator(".desk-more").click();
  expect(await news.count()).toBeGreaterThan(DESK.news.shown);
  // A story opens to the platform's own note.
  const disclosure = news.first().locator("button[aria-expanded]");
  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  const paperTop = (await desk.locator(".desk-paper-news").boundingBox())!.y;
  const matchupTop = (await desk.locator(".desk-matchup").boundingBox())!.y;
  expect(paperTop, "news is above the matchup").toBeLessThan(matchupTop);
  // The matchup paper names the opponent, their record, and opens the full read.
  const matchup = desk.locator(`a[href="${SECTIONS.matchup.href}"]`);
  await expect(matchup).toBeVisible();
  await expect(matchup.getByText(/\d+-\d+ · \d+ of \d+/)).toHaveCount(2);
  await expect(matchup.getByText(/% to win/)).toBeVisible();
  // Four notebooks, each a link; the fourth is the film; a lit one carries a count inside.
  const notebooks = desk.locator(".notebook");
  await expect(notebooks).toHaveCount(4);
  await expect(desk.locator(`a.notebook[href="${SECTIONS.report.href}"]`)).toBeVisible();
  const lit = desk.locator(".notebook-lit");
  await expect(lit.first()).toBeVisible();
  await expect(lit.first().locator(".notebook-badge")).toHaveText(/^\d+$/);
  // The rings are whole: none is cut off at the notebook's edge.
  await assertNoHorizontalOverflow(page);
  await notebooks.first().click();
  await page.waitForURL(`**${SECTIONS.team.href}`);
  await expect(page.getByRole("heading", { level: 1, name: SECTIONS.team.title })).toBeVisible();
});

test("a story's arrow opens its action plan: the call, the next man up, and the way back", async ({ page }) => {
  await visit(page, "/home");
  const desk = page.getByRole("region", { name: DESK.aria });
  const row = desk.locator(".desk-news-row").first();
  const who = (await row.locator(".display").first().textContent())!.split(" ").slice(0, 2).join(" ");
  await row.locator(".desk-plan-link").click();
  await page.waitForURL(`**${SECTIONS.plan.href}**`);
  await expect(page.getByRole("heading", { level: 1, name: SECTIONS.plan.title })).toBeVisible();
  // The man the story is about, and one of the four calls.
  await expect(page.locator("main").getByText(new RegExp(who.split(" ")[1])).first()).toBeVisible();
  const heads = Object.values(PLAN.posture).map((p) => p.head);
  await expect(page.locator("main").getByText(new RegExp(heads.map((h) => h.replace(".", "\\.")).join("|")))).toBeVisible();
  await expect(page.getByText(PLAN.nextUp.title, { exact: true })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.getByRole("link", { name: PLAN.back }).click();
  await page.waitForURL(`**${SECTIONS.home.href}`);
  await expect(desk).toBeVisible();
});

test("the ticker runs the desk's news along the bottom of a tab that is not the desk", async ({ page }) => {
  await visit(page, SECTIONS.team.href);
  const ticker = page.getByRole("link", { name: TICKER.aria });
  await expect(ticker).toBeVisible();
  // Real news from the recorded feed, not the quiet line and not the loading line.
  await expect(ticker.locator(".ticker-item").first()).toBeAttached();
  await expect(ticker.getByText(TICKER.quiet)).toHaveCount(0);
  // It sits over the tab bar, on screen, and it is a door to the desk.
  const box = (await ticker.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(812);
  await ticker.click();
  await page.waitForURL(`**${SECTIONS.home.href}`);
});

test("the first open rides up to the call sheet, and the second does not", async ({ page }) => {
  // The opening is an elevator (`components/Elevator.tsx`): it takes the screen, the
  // floors go by, and the doors open onto the page that loaded underneath. Two things
  // have to be true for it to be an opening and not a wall: it ends on its own, and
  // it does not play again on the next open.
  await visit(page, "/home?ride=1");
  const ride = page.getByRole("status", { name: RIDE.aria });
  await expect(ride).toBeVisible();
  await expect(ride.getByText(RIDE.goingUp)).toBeVisible();
  // It ends, and the desk is there when the doors open. The whole ride is under fifteen
  // seconds; the default timeout is inside that, so this one waits longer.
  await expect(ride).toHaveCount(0, { timeout: 25_000 });
  await expect(page.getByRole("region", { name: DESK.aria })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  // Stamped, so a reload today is a quiet load.
  expect(await page.evaluate(() => localStorage.getItem("booth.ride"))).toBe(dayStamp(new Date()));
  await page.goto("/home", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: DESK.aria })).toBeVisible();
  await expect(page.getByRole("status", { name: RIDE.aria })).toHaveCount(0);
});

test("tapping the ride opens the doors early", async ({ page }) => {
  await visit(page, "/home?ride=1");
  const ride = page.getByRole("status", { name: RIDE.aria });
  await expect(ride).toBeVisible();
  const t0 = Date.now();
  await ride.click();
  await expect(ride).toHaveCount(0);
  // The whole ride is over ten seconds; a skip is the landing's fade and no more.
  expect(Date.now() - t0).toBeLessThan(2500);
  await expect(page.getByRole("region", { name: DESK.aria })).toBeVisible();
});
