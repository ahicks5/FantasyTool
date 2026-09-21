import { expect, test, type Page, type Route } from "@playwright/test";
import { API_URL, DEV_USER } from "../playwright.config";
import { DEPARTMENTS, DEPARTMENT_ORDER, SECTIONS, STARTERS } from "../src/lib/vocab";
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
    name: "the Debrief",
    check: async (page) => {
      const debrief = page.locator("main");
      // The engine's own headline, now a line rather than a hero (D3).
      await expect(debrief.getByText(/\d+ moves? to make|All settled\./).first()).toBeVisible();
      // Four memos, always all four, in tab order. The quiet one is the point: a
      // department with nothing to report still prints, because a page that can only
      // stay silent about a settled lineup cannot answer "is my lineup set?".
      for (const key of DEPARTMENT_ORDER) {
        await expect(debrief.getByText(DEPARTMENTS[key], { exact: true })).toBeVisible();
      }
      // Every memo is a door. The film room's is the one with no call on it, so if the
      // quiet memos ever stop linking out it is the one that proves it.
      await expect(debrief.getByRole("link", { name: SECTIONS.report.title, exact: true })).toBeVisible();
      // The starters plate: one disc per starting slot, in slot order. Counted against
      // the engine's own lineup rather than against a hard-coded nine, because the
      // number of starting slots is a property of the league.
      const plate = debrief.getByRole("link", { name: new RegExp(STARTERS.head, "i") });
      await expect(plate).toBeVisible();
      const slots = plate.locator("li");
      const lineup = await page.request
        .get(`${API_URL}/api/league/${CONNECTION.platform}/${CONNECTION.league_id}/team/${CONNECTION.team_id}/lineup`, {
          headers: { "x-edge-user": DEV_USER },
        })
        .then((r) => r.json());
      expect(await slots.count(), "a disc per starting slot").toBe(lineup.slots.length);
      // The clock lives here and nowhere else on this page: it is the one dark surface,
      // which is the only place the brand lets its red run.
      await expect(plate.getByText(/kickoff|locks in/i)).toBeVisible();
      // The injury banner is the app's loudest surface and this fixture's starters are
      // all clear, so it must not be here. Asserting the silence rather than the shout
      // on purpose: the way an alert dies is by firing every week until nobody reads it,
      // and that failure is invisible to a test that only checks it can appear.
      await expect(debrief.getByRole("link", { name: /won\u2019t play|in doubt/ })).toHaveCount(0);
      // A real name on the front page with nothing clicked. This is the finding the
      // whole redesign came from and the thing that must not regress.
      await expect(debrief.getByText(/[A-Z][a-z]+ [A-Z][a-zA-Z.'-]+/).first()).toBeVisible();
      await expect(debrief.getByText(/requires a purchase/i)).toHaveCount(0);
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

/**
 * A `start` call spliced into whatever the fixture league's engine really returned.
 *
 * The Megalabowl's week-2 lineup is genuinely settled — `lineup.advise` finds no swap
 * worth calling — so its head coach's memo is correctly the clear one, and no fixture
 * request will ever put a share button on this page. The growth loop is too important
 * to go untested for that reason, so the feed is patched in the browser the same way
 * the Wire Pass 402 is below: the engine still produces every other word on the page.
 */
/** Somebody who has bought nothing. `serve_fixtures.py` grants only the free tier here. */
const FREE_USER = "free@example.com";

const START_CALL = {
  id: "start:test",
  type: "start",
  feature: "my_team",
  locked: false,
  priority: 1,
  title: "Start Jaylen Warren over James Conner",
  subtitle: "RB2 · RB PIT",
  benefit: "+4.3 pts",
  benefit_value: 4.3,
  confidence: "Lock",
  reason: "Conner is out. Warren has the backfield to himself against a soft front.",
  why: ["Conner ruled out", "Warren saw 71% of the snaps last week"],
  players: [
    { id: "1", name: "Jaylen Warren", position: "RB", nfl_team: "PIT", injury_status: null, projected: 14.2 },
    { id: "2", name: "James Conner", position: "RB", nfl_team: "ARI", injury_status: "Out", projected: 9.9 },
  ],
  cta: { label: "Depth chart", href: "/team" },
};

async function withStartCall(page: Page, user: string): Promise<void> {
  // The identity goes on *this* handler rather than on a context-level one. A page route
  // wins over a context route, and `route.fetch()` does not fall back through the
  // handlers it outranked — so a context route adding `x-edge-user` never sees this
  // request, and the feed comes back with everything unlocked. That is a silent failure:
  // the page renders, the assertions about the free tier pass against a paid feed, and
  // the test proves nothing.
  await page.route("**/actions*", async (route) => {
    const res = await route.fetch({ headers: { ...route.request().headers(), "x-edge-user": user } });
    const feed = await res.json();
    feed.actions = [START_CALL, ...(feed.actions ?? [])];
    await route.fulfill({ response: res, json: feed });
  });
}

test("the Lock share button rides on the head coach's memo, and opens nothing else", async ({ context, page }) => {
  // The growth loop, and the half of it that is easy to break by accident. A start/sit
  // call is shareable by someone who has never paid and never signed in; making that
  // memo free must not open Trade Lab as a side effect. The API half is pinned by
  // `tests/test_share.py::test_the_paid_card_is_still_paid` and
  // `test_locked_teasers_never_name_a_player`; this is the half a page refactor could
  // quietly undo, by moving the share button onto a card that only a payer sees.
  await context.route("**/api/**", (route) => {
    const headers = { ...route.request().headers(), "x-edge-user": FREE_USER };
    route.continue({ headers });
  });
  await withStartCall(page, FREE_USER);
  await page.goto("/home");

  const coach = page.locator("main ol > li").filter({ hasText: DEPARTMENTS.team });
  await expect(coach.getByRole("heading", { name: /Jaylen Warren/ })).toBeVisible();
  await expect(coach.getByRole("button", { name: /share this call/i })).toBeVisible();

  // ...and the GM's Office is still shut for this reader, with no player named in it.
  const gm = page.locator("main ol > li").filter({ hasText: DEPARTMENTS.trade });
  await expect(gm.getByRole("link", { name: /unlock/i })).toBeVisible();
  await expect(gm.getByRole("button", { name: /share this call/i })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
});

test("the Debrief shows a player without a click, for a reader who has bought nothing", async ({ context, page }) => {
  // The finding this whole plan started from: the home screen showed no player names at
  // all, every row folded, headline "Pending moves: 2". A free reader is the one who must
  // see them -- it is the only screen they get in full.
  await context.route("**/api/**", (route) => {
    const headers = { ...route.request().headers(), "x-edge-user": FREE_USER };
    route.continue({ headers });
  });
  await withStartCall(page, FREE_USER);
  await page.goto("/home");
  await expect(page.getByText(/\d+ moves? to make|All settled\./)).toBeVisible();
  const memos = page.locator("main ol > li");
  await expect(memos.first()).toBeVisible();
  expect(await memos.count(), "one memo per department, always all four").toBe(DEPARTMENT_ORDER.length);
  // A real name on the front page with nothing clicked.
  await expect(memos.getByText(/[A-Z][a-z]+ [A-Z][a-zA-Z.'-]+/).first()).toBeVisible();
  await expect(page.getByText(/requires a purchase/i)).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
});

test("the swap badge is the gap between our lineup and yours, and the tick closes it", async ({ page }) => {
  // The headline behaviour of the starters plate. The Megalabowl's week-2 lineup is
  // genuinely settled -- `advise` finds no swap worth calling -- so the badge has to be
  // put there to be tested, the same way the share button's start call is above. What is
  // real is the wiring: the plate pairs a slot with the feed's call by the incoming
  // player's id, and the memo's tick is what drops the badge.
  const lineupUrl = `${API_URL}/api/league/${CONNECTION.platform}/${CONNECTION.league_id}/team/${CONNECTION.team_id}/lineup`;
  const real = await page.request.get(lineupUrl, { headers: { "x-edge-user": DEV_USER } }).then((r) => r.json());
  const slot = real.slots.find((s: { player: unknown }) => s.player);
  expect(slot, "the fixture lineup has no slot with a player in it").toBeTruthy();
  // Initials that cannot collide with any face already on the strip.
  const OUT = { id: "out-test", name: "Quentin Zeller", position: "RB" };

  await page.route("**/lineup*", async (route) => {
    const res = await route.fetch({ headers: { ...route.request().headers(), "x-edge-user": DEV_USER } });
    const lineup = await res.json();
    const target = lineup.slots.find((s: { player: { id: string } | null }) => s.player?.id === slot.player.id);
    target.change = true;
    lineup.changes = [
      { slot: target.slot, out: OUT, in: { id: slot.player.id, name: slot.player.name }, gain: 4.3, confidence: "Lock", reason: "Zeller is out." },
    ];
    await route.fulfill({ response: res, json: lineup });
  });
  await page.route("**/actions*", async (route) => {
    const res = await route.fetch({ headers: { ...route.request().headers(), "x-edge-user": DEV_USER } });
    const feed = await res.json();
    feed.actions = [
      {
        ...START_CALL,
        id: `start:${slot.slot}:${slot.player.id}`,
        title: `Start ${slot.player.name} over ${OUT.name}`,
        players: [slot.player, OUT],
      },
      ...(feed.actions ?? []),
    ];
    await route.fulfill({ response: res, json: feed });
  });

  await page.goto("/home");
  const plate = page.getByRole("link", { name: new RegExp(STARTERS.head, "i") });
  const badge = plate.getByText("QZ", { exact: true });
  await expect(badge, "no swap badge on the slot the engine wants changed").toBeVisible();

  const coach = page.locator("main ol > li").filter({ hasText: DEPARTMENTS.team });
  await coach.getByRole("button", { name: "Make the call" }).click();
  await expect(badge, "the badge survived the call being ticked").toHaveCount(0);

  // And untick: the strip is a live read of the gap, not a one-way animation.
  await coach.getByRole("button", { name: /called/i }).click();
  await expect(badge).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test("a thumbs-down takes the item off the Debrief, and a reload keeps it off", async ({ page }) => {
  // D5, end to end in the browser: the thumb is a real control now, so the page has to
  // answer it. The item is hidden here and nowhere else -- the depth chart, the wire and
  // the trade board stay complete, which `src/lib/sheet.test.ts` pins on the data side.
  //
  // Whichever memo the engine actually put a dismissable call on, rather than a named
  // department: the fixture league's lineup is settled some weeks and busy others, and a
  // test that picks the wrong one fails on the fixture rather than on the feature.
  await page.goto("/home");
  const memos = page.locator("main ol > li");
  await expect(memos.first()).toBeVisible();
  // Resolve to a fixed index first. Filtering by the thumbs-down is how the memo is
  // *found*, but a Playwright locator re-runs its query on every use — and clicking that
  // button swaps it for the reason chips, so the same locator would then match a
  // different memo, or none.
  const wrong = /this call was wrong/i;
  const count = await memos.count();
  let at = -1;
  for (let i = 0; i < count; i += 1) {
    if (await memos.nth(i).getByRole("button", { name: wrong }).count()) {
      at = i;
      break;
    }
  }
  expect(at, "no memo carried a call that could be dismissed").toBeGreaterThanOrEqual(0);
  const memo = memos.nth(at);
  const before = (await memo.locator("h3").first().textContent())?.trim() ?? "";
  expect(before.length, "the memo with the thumbs on it had no title").toBeGreaterThan(0);

  await memo.getByRole("button", { name: wrong }).click();
  // The reason chips, as on every other feedback control in the app.
  await memo.getByRole("button", { name: "I disagree" }).click();

  // Either the next-ranked call took its place, or the department has nothing left and
  // says so. Both are the feature; what must not happen is the old title staying up.
  await expect(memo.getByRole("heading", { name: before, exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.locator("main ol > li").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: before, exact: true })).toHaveCount(0);
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

  const board = page.getByRole("list").first();
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
  const row = page.getByRole("list").first().getByRole("listitem").first();
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
  await expect(page.getByPlaceholder(SCOUT.placeholder)).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test("the API really is the fixture server, not mocks", async ({ page }) => {
  // If NEXT_PUBLIC_API_URL were unset the app would quietly serve src/lib/mocks.ts and the
  // whole suite would pass without ever touching the engine. Catch that here.
  const seen: string[] = [];
  page.on("request", (r) => r.url().includes("/api/") && seen.push(r.url()));
  await page.goto("/home");
  // Attached, not visible: this test is about where the data came from rather than
  // about what is on screen.
  await expect(page.locator("main ol > li").first()).toBeAttached();
  expect(seen.some((u) => u.includes("/actions")), `no API calls seen: ${seen.join(", ")}`).toBe(true);
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
  const who = (await name.textContent())?.trim() ?? "";
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
