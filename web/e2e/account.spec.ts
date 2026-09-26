import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { API_URL } from "../playwright.config";
import { ACCOUNT, DESK, RIDE, WIRE } from "../src/lib/vocab";
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

  // The landing page leads to /register; create the account there.
  await page.goto("/");
  await page.locator('a[href="/register"]:visible').first().click();
  await page.waitForURL("**/register");
  // Just a phone number, then the texted code, then the name and the email.
  await phoneIn(page, phone, { name: "Andrew", email });

  // A new account lands on its own page: you're in, one thing left.
  await page.waitForURL("**/account");
  expect(await page.evaluate(() => localStorage.getItem("booth.session"))).toBeTruthy();
  await expect(page.getByRole("heading", { level: 1, name: ACCOUNT.welcome.title("Andrew") })).toBeVisible();
  const welcome = page.getByTestId("welcome");
  await expect(welcome).toBeVisible();
  await expect(page.getByTestId("league-room")).toHaveText("0 of 3 leagues");
  await welcome.getByRole("link", { name: ACCOUNT.welcome.cta }).click();
  await page.waitForURL("**/connect");
  await expect(gate).toHaveCount(0);

  // Link the fixture league the way a visitor does.
  await page.getByRole("radio", { name: "Sleeper" }).click();
  await page.locator("#sleeper-input").fill("someone");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByRole("heading", { name: "Select your team" })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(CONNECTION.team_name) }).click();
  await page.getByRole("button", { name: /Show my moves/ }).click();
  await page.waitForURL("**/home");
  // Connecting clears the day's ride stamp, so the elevator plays here; a tap lands it.
  const ride = page.getByRole("status", { name: RIDE.aria });
  if (await ride.count()) await ride.click();
  await expect(ride).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("region", { name: DESK.aria })).toBeVisible();

  // The top bar wears the initial; the account page shows the league on file and the flag.
  await expect(page.getByRole("link", { name: ACCOUNT.topbar.account("Andrew") })).toHaveText("A");
  await page.goto("/account");
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
  await up.getByRole("button", { name: ACCOUNT.upgrade.get("The Penthouse") }).click();
  await expect(up.getByText(ACCOUNT.upgrade.done)).toBeVisible();
  await up.getByRole("button", { name: ACCOUNT.upgrade.close }).last().click();
  await expect(page.locator("[data-plan=premium]").first()).toBeVisible();
  await expect(page.getByTestId("upgrade-bundle")).toHaveCount(0);
  await expect(page.getByTestId("league-room")).toHaveText("1 of 5 leagues");

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
  // And back in with the phone: a number on file signs straight in, no profile step.
  await phoneIn(page, phone);
  await page.waitForURL("**/home");
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
  await expect(page.getByText("Wire Pass").first()).toBeVisible();
  await page.getByRole("button", { name: /Unlock Wire Pass/ }).click();
  const sheet = page.getByRole("dialog", { name: ACCOUNT.signIn });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(ACCOUNT.reason.upgrade)).toBeVisible();
  await phoneIn(sheet, freshPhone(), { name: "", email });
  const up = page.getByTestId("upgrade-sheet");
  await expect(up).toBeVisible();
  await expect(up.getByText(ACCOUNT.upgrade.for("Wire Pass"))).toBeVisible();
  await up.getByRole("button", { name: ACCOUNT.upgrade.get("Wire Pass") }).click();
  await expect(up.getByText(ACCOUNT.upgrade.done)).toBeVisible();
  await up.getByRole("button", { name: ACCOUNT.upgrade.close }).last().click();
  await expect(page.getByRole("heading", { name: WIRE.title })).toBeVisible();
  await expect(page.locator("a.pickup")).toHaveCount(3, { timeout: 20_000 });
});

test("the owner's front office lists every account and the levers work", async ({ context, page }) => {
  // The dev-header identity is EDGE_ADMINS on the fixture server, so this browser is the owner.
  await context.addInitScript((c) => window.localStorage.setItem("booth.connection", c), JSON.stringify(CONNECTION));
  const email = freshEmail("fan");
  await registerViaApi(page, email);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: ACCOUNT.admin.title })).toBeVisible();
  await expect(page.getByTestId("admin-count")).toHaveText(/\d+ accounts?/);
  await page.getByLabel(ACCOUNT.admin.search).fill(email);
  const row = page.locator(`[data-testid=admin-row][data-email="${email}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByText(ACCOUNT.plan.free, { exact: true })).toBeVisible();
  await expect(row.getByText(ACCOUNT.admin.leagues(0, 3))).toBeVisible();
  // Grant a pass: the flag flips and the button turns into its undo.
  await row.getByRole("button", { name: `${ACCOUNT.admin.grant} Wire Pass` }).click();
  await expect(row.getByRole("button", { name: `${ACCOUNT.admin.revoke} Wire Pass` })).toBeVisible();
  await expect(row.getByText(ACCOUNT.plan.premium, { exact: true })).toBeVisible();
  // One more league.
  await row.getByRole("button", { name: ACCOUNT.admin.slot }).click();
  await expect(row.getByText(ACCOUNT.admin.leagues(0, 4))).toBeVisible();
  // A reset link, handed over by hand.
  await row.getByRole("button", { name: ACCOUNT.admin.resetLink }).click();
  await expect(row.getByText(/\/reset\?token=/)).toBeVisible();
  // Take the pass back.
  await row.getByRole("button", { name: `${ACCOUNT.admin.revoke} Wire Pass` }).click();
  await expect(row.getByRole("button", { name: `${ACCOUNT.admin.grant} Wire Pass` })).toBeVisible();
  await expect(row.getByText(ACCOUNT.plan.free, { exact: true })).toBeVisible();
});

test("a phone-only account adds an email later, and an email account adds a phone", async ({ context, page }) => {
  await beAStranger(context);
  await page.goto("/register");
  const phone = freshPhone();
  await phoneIn(page, phone, { name: "Pat", email: "" });
  await page.waitForURL("**/account");
  const contact = page.getByTestId("contact");
  await expect(contact.getByText(ACCOUNT.emailOnFile.none)).toBeVisible();
  await expect(page.getByText(ACCOUNT.emailOnFile.optInNeedsEmail)).toBeVisible();
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
