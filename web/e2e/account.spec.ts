import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { API_URL } from "../playwright.config";
import { ACCOUNT, CONNECT, DESK, LINES, ONBOARD, PRICING, RIDE, WIRE } from "../src/lib/vocab";
import { dayStamp } from "../src/lib/elevator";

/**
 * The account, end to end against the fixture API: a stranger meets the sign-in sheet on
 * /connect, creates an account, links a league, sees the plan flag, upgrades without
 * Stripe, and comes back to the league without re-entering it. Then the owner's desk.
 *
 * The web build carries NEXT_PUBLIC_DEV_USER, so every API call normally wears the dev
 * header and reads as signed in. The tests that need a stranger strip that header at the
 * network layer; once the visitor signs in, the Bearer token wins in `getAuthHeaders`.
 */

const CONNECTION = {
  platform: "sleeper",
  league_id: "1403186749361901568",
  league_name: "The Megalabowl",
  team_id: "5",
  team_name: "GoldenPP",
  week: 2,
};

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

/** Make the browser a stranger: the dev header never reaches the API. */
async function beAStranger(context: BrowserContext) {
  await context.route("**/api/**", (route) => {
    const headers = { ...route.request().headers() };
    delete headers["x-edge-user"];
    route.continue({ headers });
  });
}

function freshEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

const PASSWORD = "owner of the building";

/** A number the fixture API will text (it texts nothing: the dev verifier hands the code back). */
function freshPhone(): string {
  return `(555) 2${String(Math.floor(Math.random() * 1e6)).padStart(6, "0").slice(0, 2)}-${String(Math.floor(Math.random() * 1e4)).padStart(4, "0")}`;
}

/** The phone door, end to end: the number, the code off the dev API, and (for a new number) the profile. */
async function phoneIn(scope: Page | ReturnType<Page["getByRole"]>, phone: string, profile?: { name: string; email: string }) {
  await scope.getByLabel(ACCOUNT.phone.label).fill(phone);
  await scope.getByRole("button", { name: ACCOUNT.phone.send }).click();
  const dev = scope.getByTestId("dev-code");
  await expect(dev).toBeVisible();
  const code = ((await dev.textContent()) ?? "").match(/(\d{6})/)?.[1] ?? "";
  await scope.getByLabel(ACCOUNT.phone.codeLabel).fill(code);
  await scope.getByRole("button", { name: ACCOUNT.phone.verify }).click();
  if (profile) {
    await expect(scope.getByText(ACCOUNT.phone.profileTitle)).toBeVisible();
    await scope.getByLabel(ACCOUNT.name).fill(profile.name);
    await scope.getByLabel(ACCOUNT.phone.emailOptional).fill(profile.email);
    await scope.getByRole("button", { name: ACCOUNT.phone.finish }).click();
  }
}

/** The sign-up walk's first screens (docs/SPEC-ONBOARDING.md): the number, the code, the nameplate, the mailbox. */
async function walkIn(page: Page, phone: string, profile: { name: string; email: string }) {
  await page.getByLabel(ONBOARD.phone.label).fill(phone);
  await page.getByRole("button", { name: ONBOARD.phone.send }).click();
  const dev = page.getByTestId("dev-code");
  await expect(dev).toBeVisible();
  const code = ((await dev.textContent()) ?? "").match(/(\d{6})/)?.[1] ?? "";
  await page.getByLabel(ONBOARD.code.label).fill(code);
  await expect(page.getByRole("heading", { level: 1, name: ONBOARD.name.title })).toBeVisible();
  if (profile.name) {
    await page.getByLabel(ONBOARD.name.label).fill(profile.name);
    await page.getByRole("button", { name: ONBOARD.name.cta }).click();
  } else await page.getByTestId("walk-skip-name").click();
  await expect(page.getByRole("heading", { level: 1, name: ONBOARD.mailbox.title })).toBeVisible();
  if (profile.email) {
    await page.getByLabel(ONBOARD.mailbox.label).fill(profile.email);
    await page.getByRole("button", { name: ONBOARD.mailbox.cta }).click();
  } else await page.getByTestId("walk-skip-email").click();
  await expect(page.getByTestId("walk-league")).toBeVisible();
}

/** The door opens on the phone; the email-and-password accounts are one tap away. */
async function useEmail(scope: Page | ReturnType<Page["getByRole"]>) {
  await scope.getByRole("button", { name: ACCOUNT.phone.useEmail }).click();
}

/** Register straight against the API, for the tests that start already signed in. */
async function registerViaApi(page: Page, email: string): Promise<string> {
  const res = await page.request.post(`${API_URL}/api/auth/register`, { data: { email, password: PASSWORD, name: "E2E" } });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()).token as string;
}

test.beforeEach(async ({ context, page }) => {
  await context.route("**/*", stubExternal);
  await context.addInitScript(
    ([rideKey, today]) => {
      try {
        window.localStorage.setItem(rideKey, today);
        window.localStorage.setItem("booth.scout", "1");
        window.localStorage.setItem("booth.call", "1");
      } catch {
        /* blocked storage */
      }
    },
    ["booth.ride", dayStamp(new Date())] as const,
  );
  page.setDefaultTimeout(15_000);
});

test("a stranger's door is the account: register, land on it, then link a league, and the account shows it", async ({ context, page }) => {
  await beAStranger(context);
  const email = freshEmail("owner");
  const phone = freshPhone();

  // /connect with no account is the door to one, not a league form.
  await page.goto("/connect");
  const gate = page.getByTestId("connect-gate");
  await expect(gate).toBeVisible();
  await expect(gate.getByText(ACCOUNT.gate.title)).toBeVisible();
  await expect(page.getByRole("radio", { name: "Sleeper" })).toHaveCount(0);

  // The landing page leads to /register: the sign-up walk, one question a screen.
  await page.goto("/");
  // The press is counted, by name, before the page moves on (`cta_click`, /admin's funnel tab).
  const pressed = page.waitForRequest(
    (r) => r.url().endsWith("/api/events") && r.method() === "POST" && r.postData()?.includes('"cta_click"') === true,
  );
  await page.locator('a[href="/register"]:visible').first().click();
  const press = await pressed;
  expect(JSON.parse(press.postData() ?? "{}")).toEqual({ name: "cta_click", props: { door: "hero" } });
  expect((await press.response())?.status(), "the API took it").toBe(200);
  await page.waitForURL("**/register");
  await walkIn(page, phone, { name: "Andrew", email });
  expect(await page.evaluate(() => localStorage.getItem("booth.session"))).toBeTruthy();

  // Link the fixture league the way a visitor does, inside the walk.
  await page.getByRole("radio", { name: "Sleeper" }).click();
  await page.locator("#sleeper-input").fill("someone");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByRole("heading", { name: "Select your team" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(CONNECTION.team_name) }).click();
  await page.getByRole("button", { name: CONNECT.submit }).click();
  // The first call, then not now to the free week: the account stays free for the sheet below.
  await expect(page.getByTestId("walk-reveal")).toBeVisible();
  await page.getByRole("button", { name: ONBOARD.reveal.cta }).click();
  await page.getByTestId("offer-skip").click();
  await page.getByTestId("walk-exit").click();
  await page.waitForURL("**/home");
  // Connecting clears the day's ride stamp, so the elevator plays here; a tap lands it.
  const ride = page.getByRole("status", { name: RIDE.aria });
  if (await ride.count()) await ride.click();
  await expect(ride).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("region", { name: DESK.aria })).toBeVisible();

  // The top bar wears the initial; the account page shows the league on file and the flag.
  await expect(page.getByRole("link", { name: ACCOUNT.topbar.account("Andrew") })).toHaveText("A");
  // By the top bar's link, not a reload: a reload would refetch the account and hide the
  // bug where the session cache still listed the leagues from before the save (2026-09-28).
  await page.getByRole("link", { name: ACCOUNT.topbar.account("Andrew") }).click();
  await page.waitForURL("**/account");
  await expect(page.getByRole("heading", { level: 1, name: ACCOUNT.title })).toBeVisible();
  await expect(page.getByTestId("league-room")).toHaveText("1 of 3 leagues");
  await expect(page.getByText(CONNECTION.league_name).first()).toBeVisible();
  await expect(page.locator("[data-plan=free]").first()).toBeVisible();
  await expect(page.getByText(ACCOUNT.plan.premium, { exact: true })).toHaveCount(0);

  // Upgrade, with no Stripe on the API: the sheet says it is free, the grant lands, the flag flips.
  await page.getByTestId("upgrade-bundle").click();
  const up = page.getByTestId("upgrade-sheet");
  await expect(up).toBeVisible();
  await expect(up.getByText(ACCOUNT.upgrade.comp)).toBeVisible();
  // The TikTok code: a wrong one says so, the right one halves the season, and the API takes it.
  await up.getByTestId("promo-open").click();
  const promo = up.getByLabel(ACCOUNT.upgrade.promo.label);
  await promo.fill("nope");
  await up.getByRole("button", { name: ACCOUNT.upgrade.promo.apply }).click();
  await expect(up.getByText(ACCOUNT.upgrade.promo.bad)).toBeVisible();
  await promo.fill("sthtiktok");
  await up.getByRole("button", { name: ACCOUNT.upgrade.promo.apply }).click();
  await expect(up.getByTestId("season-price")).toHaveText("$14.99");
  await up.getByRole("button", { name: ACCOUNT.upgrade.takeSeason }).click();
  await expect(up.getByText(ACCOUNT.upgrade.done)).toBeVisible();
  await up.getByRole("button", { name: ACCOUNT.upgrade.close }).last().click();
  await expect(page.locator("[data-plan=premium]").first()).toBeVisible();
  await expect(page.getByTestId("upgrade-bundle")).toHaveCount(0);
  await expect(page.getByTestId("league-room")).toHaveText("1 of 3 leagues");

  // Not the owner: the front office is closed to this account.
  await page.goto("/admin");
  await expect(page.getByText(ACCOUNT.admin.notYou)).toBeVisible();

  // Sign out: the token is gone and the door shows the form.
  await page.goto("/account");
  await page.getByRole("button", { name: ACCOUNT.signOut, exact: true }).click();
  await page.waitForURL("**/");
  expect(await page.evaluate(() => localStorage.getItem("booth.session"))).toBeNull();
  await page.goto("/login");
  await expect(page.getByLabel(ACCOUNT.phone.label)).toBeVisible();
  // And back in with the phone: a number on file signs straight in, no profile step, and
  // goes straight to the call sheet on its league (W-011), with no ride: the same team
  // reopened the same day is not a new office (W-012).
  await phoneIn(page, phone);
  await page.waitForURL("**/home");
  await expect(page.getByRole("region", { name: DESK.aria })).toBeVisible();
  await expect(page.getByRole("status", { name: RIDE.aria })).toHaveCount(0);
  // /login once in is the switcher, with the league on it.
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: ACCOUNT.whereTo.title })).toBeVisible();
  await expect(page.getByTestId("where-league")).toHaveCount(1);
});

test("a returning account lands on its league without entering it again", async ({ context, page }) => {
  await beAStranger(context);
  const email = freshEmail("return");
  const token = await registerViaApi(page, email);
  const linked = await page.request.post(`${API_URL}/api/connect`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { platform: CONNECTION.platform, league_id: CONNECTION.league_id, team_id: CONNECTION.team_id },
  });
  expect(linked.ok(), await linked.text()).toBe(true);
  // A new device: the token, and nothing else, in storage.
  await context.addInitScript((t) => window.localStorage.setItem("booth.session", t), token);
  await page.goto("/home");
  await expect(page.getByRole("region", { name: DESK.aria })).toBeVisible();
  await expect(page.getByRole("region", { name: DESK.aria }).getByText(CONNECTION.team_name).first()).toBeVisible();
  const stored = JSON.parse((await page.evaluate(() => localStorage.getItem("booth.connection"))) ?? "null");
  expect(stored?.league_id).toBe(CONNECTION.league_id);
  expect(stored?.team_id).toBe(CONNECTION.team_id);
  // Signed in, the wordmark is the way back to the call sheet, never the landing page, and
  // it reads SUITE everywhere but the landing page (W-007).
  await page.goto("/team");
  const mark = page.getByRole("link", { name: LINES.homeAria });
  await expect(mark).toHaveAttribute("href", "/home");
  await expect(mark).toHaveText(/^SUITE/);
  await page.goto("/account");
  await expect(page.getByRole("link", { name: LINES.homeAria })).toHaveAttribute("href", "/home");
});

test("a wrong password says one thing and signs nobody in", async ({ context, page }) => {
  await beAStranger(context);
  const email = freshEmail("wrong");
  await registerViaApi(page, email);
  await page.goto("/login");
  await useEmail(page);
  await page.getByLabel(ACCOUNT.email).fill(email);
  await page.getByLabel(ACCOUNT.password).fill("not the password");
  await page.getByRole("button", { name: ACCOUNT.signIn, exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  // It once said "Your session has expired", which is the generic 401 copy for league reads.
  const alert = page.locator('[data-auth="signin"]').getByRole("alert");
  await expect(alert).toContainText(ACCOUNT.errors.wrong);
  await expect(alert).not.toContainText(/session|expired/i);
  expect(await page.evaluate(() => localStorage.getItem("booth.session"))).toBeNull();
  // The email form leads with the way back to the phone.
  await page.getByTestId("use-phone").click();
  await expect(page.getByLabel(ACCOUNT.phone.label)).toBeVisible();
});

test("the account changes its password and signs out the other devices, and this one stays in", async ({ context, page }) => {
  await beAStranger(context);
  const email = freshEmail("security");
  const token = await registerViaApi(page, email);
  const other = await page.request.post(`${API_URL}/api/auth/login`, { data: { email, password: PASSWORD } });
  const otherToken = (await other.json()).token as string;
  await context.addInitScript((t) => window.localStorage.setItem("booth.session", t), token);
  await page.goto("/account");
  const security = page.getByTestId("security");
  await security.getByRole("button", { name: ACCOUNT.security.change }).click();
  await security.getByLabel(ACCOUNT.security.current).fill(PASSWORD);
  await security.getByLabel(ACCOUNT.newPassword).fill("a whole new floor plan");
  await security.getByRole("button", { name: ACCOUNT.security.save }).click();
  await expect(security.getByRole("status")).toHaveText(ACCOUNT.security.changed);
  const me = async (t: string) =>
    (await (await page.request.get(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${t}` } })).json()).signed_in;
  expect(await me(token)).toBe(true);
  expect(await me(otherToken)).toBe(false);
  await security.getByRole("button", { name: ACCOUNT.security.others }).click();
  await expect(security.getByRole("status")).toHaveText(ACCOUNT.security.othersDone(0));
});

test("sign-in has a way to sign up, and it carries ?next= (W-009)", async ({ context, page }) => {
  await beAStranger(context);
  await page.goto("/login?next=/trade");
  const line = page.getByTestId("new-here");
  await expect(line).toContainText(ACCOUNT.noAccount);
  await line.getByRole("button", { name: ACCOUNT.getStarted }).click();
  await page.waitForURL("**/register?next=%2Ftrade");
  await expect(page.getByRole("heading", { level: 1, name: ONBOARD.phone.title })).toBeVisible();
});

test("forgot password says your sign-in is your email", async ({ context, page }) => {
  await beAStranger(context);
  await page.goto("/login");
  await useEmail(page);
  await page.getByRole("button", { name: ACCOUNT.forgot }).click();
  await expect(page.getByTestId("which-email")).toHaveText(ACCOUNT.reset.whichEmail);
});

test("a locked room's button opens the sign-in sheet, then the upgrade, and the room opens", async ({ context, page }) => {
  await beAStranger(context);
  await context.addInitScript((c) => window.localStorage.setItem("booth.connection", c), JSON.stringify(CONNECTION));
  const email = freshEmail("wire");
  await page.goto("/waivers");
  await expect(page.getByText(WIRE.lockEyebrow, { exact: true }).first()).toBeVisible();
  // No room is sold on its own any more: the lock offers the season and a week.
  await expect(page.getByTestId("locked-week")).toBeVisible();
  await page.getByTestId("locked-season").click();
  const sheet = page.getByRole("dialog", { name: ACCOUNT.signIn });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(ACCOUNT.reason.upgrade)).toBeVisible();
  await phoneIn(sheet, freshPhone(), { name: "", email });
  const up = page.getByTestId("upgrade-sheet");
  await expect(up).toBeVisible();
  await expect(up.getByText(ACCOUNT.upgrade.for(WIRE.lockEyebrow))).toBeVisible();
  await up.getByRole("button", { name: ACCOUNT.upgrade.takeSeason }).click();
  await expect(up.getByText(ACCOUNT.upgrade.done)).toBeVisible();
  await up.getByRole("button", { name: ACCOUNT.upgrade.close }).last().click();
  await expect(page.getByRole("heading", { name: WIRE.title })).toBeVisible();
  await expect(page.locator("a.pickup:visible")).toHaveCount(3, { timeout: 20_000 });
});

test("the owner's front office lists every account and the levers work", async ({ context, page }) => {
  // The dev-header identity is EDGE_ADMINS on the fixture server, so this browser is the owner.
  await context.addInitScript((c) => window.localStorage.setItem("booth.connection", c), JSON.stringify(CONNECTION));
  const email = freshEmail("fan");
  await registerViaApi(page, email);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: ACCOUNT.admin.title })).toBeVisible();
  // The numbers come first: this week's tiles, off the telemetry the sign-up above just wrote.
  const M = ACCOUNT.admin.metrics;
  await expect(page.getByTestId("tile-revenue")).toBeVisible();
  await expect(page.getByText(M.tiles.signups, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: M.tabs.funnel }).click();
  await expect(page.getByTestId("funnel-landing_signup")).toBeVisible();
  // Which landing button people press sits under the steps.
  await expect(page.getByTestId("funnel-doors").getByText(M.doorsTitle)).toBeVisible();
  // Spend goes in on Channels, and its row shows up with a verdict.
  await page.getByRole("button", { name: M.tabs.channels }).click();
  await page.getByLabel(M.spendChannel).fill("e2e");
  await page.getByLabel(M.spendDollars).fill("20");
  await page.getByRole("button", { name: M.spendAdd }).click();
  await expect(page.locator("[data-testid=channel-row]", { hasText: "e2e" })).toContainText(M.verdict.kill);
  await page.getByRole("button", { name: M.spendRemove }).first().click();
  for (const t of ["revenue", "retention", "loop"] as const) {
    await page.getByRole("button", { name: M.tabs[t] }).click();
    await expect(page.getByTestId("admin-metrics")).toBeVisible();
  }
  // No sideways scroll at 375px, whatever the tables hold.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: M.tabs.accounts }).click();
  await expect(page.getByTestId("admin-count")).toHaveText(/\d+ accounts?/);
  await page.getByLabel(ACCOUNT.admin.search).fill(email);
  const row = page.locator(`[data-testid=admin-row][data-email="${email}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByText(ACCOUNT.plan.free, { exact: true })).toBeVisible();
  await expect(row.getByText(ACCOUNT.admin.leagues(0, 3))).toBeVisible();
  // The account's timeline starts at its sign-up.
  await row.getByRole("button", { name: ACCOUNT.admin.timeline }).click();
  await expect(row.getByTestId("admin-timeline")).toContainText("signup");
  // Grant a week: the flag flips and the button turns into its undo.
  await row.getByRole("button", { name: `${ACCOUNT.admin.grant} ${PRICING.names.week_pass}` }).click();
  await expect(row.getByRole("button", { name: `${ACCOUNT.admin.revoke} ${PRICING.names.week_pass}` })).toBeVisible();
  await expect(row.getByRole("button", { name: `${ACCOUNT.admin.grant} ${PRICING.names.waivers}` })).toHaveCount(0);
  await expect(row.getByText(ACCOUNT.plan.premium, { exact: true })).toBeVisible();
  // One more league.
  await row.getByRole("button", { name: ACCOUNT.admin.slot }).click();
  await expect(row.getByText(ACCOUNT.admin.leagues(0, 4))).toBeVisible();
  // A reset link, handed over by hand.
  await row.getByRole("button", { name: ACCOUNT.admin.resetLink }).click();
  await expect(row.getByText(/\/reset\?token=/)).toBeVisible();
  // Take the pass back.
  await row.getByRole("button", { name: `${ACCOUNT.admin.revoke} ${PRICING.names.week_pass}` }).click();
  await expect(row.getByRole("button", { name: `${ACCOUNT.admin.grant} ${PRICING.names.week_pass}` })).toBeVisible();
  await expect(row.getByText(ACCOUNT.plan.free, { exact: true })).toBeVisible();
});

test("a phone-only account adds an email later, and an email account adds a phone", async ({ context, page }) => {
  await beAStranger(context);
  await page.goto("/register");
  const phone = freshPhone();
  await walkIn(page, phone, { name: "Pat", email: "" });
  await page.goto("/account");
  const contact = page.getByTestId("contact");
  await expect(contact.getByText(ACCOUNT.emailOnFile.none)).toBeVisible();
  await contact.getByRole("button", { name: ACCOUNT.emailOnFile.add }).click();
  const email = freshEmail("later");
  await contact.getByLabel(ACCOUNT.email).fill(email);
  await contact.getByRole("button", { name: ACCOUNT.emailOnFile.save }).click();
  await expect(contact.getByRole("status")).toHaveText(ACCOUNT.emailOnFile.saved);
  await expect(contact.getByText(email)).toBeVisible();

  // An email-and-password account puts a phone on file, and can then sign in with it.
  const other = freshEmail("addphone");
  const token = await registerViaApi(page, other);
  await context.addInitScript((t) => window.localStorage.setItem("booth.session", t), token);
  await page.goto("/account");
  await contact.getByRole("button", { name: ACCOUNT.phone.add }).click();
  const second = freshPhone();
  await contact.getByLabel(ACCOUNT.phone.label).fill(second);
  await contact.getByRole("button", { name: ACCOUNT.phone.send }).click();
  const code = ((await contact.getByTestId("dev-code").textContent()) ?? "").match(/(\d{6})/)?.[1] ?? "";
  await contact.getByLabel(ACCOUNT.phone.codeLabel).fill(code);
  await contact.getByRole("button", { name: ACCOUNT.phone.verify }).click();
  await expect(contact.getByRole("status")).toHaveText(ACCOUNT.phone.added);
  await expect(contact.getByText(second)).toBeVisible();
});

test("signing in or out in one tab reaches the others without a reload", async ({ context, page }) => {
  await beAStranger(context);
  const email = freshEmail("tabs");
  await registerViaApi(page, email);
  const other = await context.newPage();
  other.setDefaultTimeout(15_000);
  await page.goto("/login");
  await other.goto("/login");
  await expect(other.getByRole("heading", { level: 1, name: ACCOUNT.signIn })).toBeVisible();

  // Sign in here; the other tab, untouched, turns into the signed-in door.
  await useEmail(page);
  await page.getByLabel(ACCOUNT.email).fill(email);
  await page.getByLabel(ACCOUNT.password).fill(PASSWORD);
  await page.getByRole("button", { name: ACCOUNT.signIn, exact: true }).click();
  // No league on this account: nowhere upstairs to land, so "Where to?" is just add a league
  // and the settings (W-011).
  await expect(page.getByRole("heading", { level: 1, name: ACCOUNT.whereTo.title })).toBeVisible();
  await expect(page.getByTestId("where-league")).toHaveCount(0);
  await expect(page.getByTestId("where-add")).toBeVisible();
  await expect(other.getByRole("heading", { level: 1, name: ACCOUNT.whereTo.title })).toBeVisible();
  // Into the building, where the top bar shows the account.
  await page.goto("/home");
  await expect(page.getByRole("link", { name: ACCOUNT.topbar.account("E2E") })).toBeVisible();

  // Sign out over there; this tab reads signed out and forgets the account.
  await other.getByRole("button", { name: ACCOUNT.signOut, exact: true }).click();
  await expect(page.getByRole("link", { name: ACCOUNT.topbar.signIn })).toBeVisible();
  await expect(page.getByRole("link", { name: ACCOUNT.topbar.account("E2E") })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("booth.session"))).toBeNull();
});

test("a token the API has ended is dropped, and the door asks to sign in", async ({ context, page }) => {
  await beAStranger(context);
  const token = await registerViaApi(page, freshEmail("dead"));
  const ended = await page.request.post(`${API_URL}/api/auth/logout`, { headers: { Authorization: `Bearer ${token}` } });
  expect(ended.ok()).toBe(true);
  await page.goto("/login");
  await page.evaluate((t) => localStorage.setItem("booth.session", t), token);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: ACCOUNT.signIn })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("booth.session"))).toBeNull();
});

test("a signed-in browser at the door sees 'checking you in', never a blank page or the form, while the API answers", async ({ context, page }) => {
  await beAStranger(context);
  const token = await registerViaApi(page, freshEmail("wait"));
  await page.goto("/login");
  await page.evaluate((t) => localStorage.setItem("booth.session", t), token);
  // A cold API: hold who-is-this for a few seconds.
  await page.route(`${API_URL}/api/me`, async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.fallback();
  });
  await page.reload();
  await expect(page.getByTestId("door-checking")).toBeVisible();
  await expect(page.getByText(ACCOUNT.checking)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: ACCOUNT.signIn })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: ACCOUNT.whereTo.title })).toBeVisible();
  await expect(page.getByTestId("door-checking")).toHaveCount(0);
});

test("signing in at the door goes straight to the call sheet on the last league; the door after is the switcher", async ({ context, page }) => {
  await beAStranger(context);
  const email = freshEmail("menu");
  const token = await registerViaApi(page, email);
  const linked = await page.request.post(`${API_URL}/api/connect`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { platform: CONNECTION.platform, league_id: CONNECTION.league_id, team_id: CONNECTION.team_id },
  });
  expect(linked.ok(), await linked.text()).toBe(true);
  await page.goto("/login");
  await useEmail(page);
  await page.getByLabel(ACCOUNT.email).fill(email);
  await page.getByLabel(ACCOUNT.password).fill(PASSWORD);
  const signIn = page.getByRole("button", { name: ACCOUNT.signIn, exact: true });
  await signIn.click();
  // The form stays, its button spinning, until the page moves on: no in-between card (W-010).
  await expect(page.getByTestId("door-checking")).toHaveCount(0);
  await page.waitForURL("**/home");
  await expect(page.getByRole("region", { name: DESK.aria })).toBeVisible();
  const opened = JSON.parse((await page.evaluate(() => localStorage.getItem("booth.connection"))) ?? "null");
  expect(opened?.league_id).toBe(CONNECTION.league_id);

  // Back at the door, signed in: "Where to?" is the league switcher.
  await page.goto("/login");
  const menu = page.getByTestId("where-to");
  await expect(menu.getByRole("heading", { level: 1, name: ACCOUNT.whereTo.title })).toBeVisible();
  await expect(menu.getByTestId("where-league")).toHaveCount(1);
  await expect(menu.getByTestId("where-add")).toHaveAttribute("href", "/connect");
  await expect(menu.getByTestId("where-settings")).toHaveAttribute("href", "/account");
  // One tap on the league opens it.
  await menu.getByTestId("where-league").click();
  await page.waitForURL("**/home");
  const stored = JSON.parse((await page.evaluate(() => localStorage.getItem("booth.connection"))) ?? "null");
  expect(stored?.league_id).toBe(CONNECTION.league_id);
});
