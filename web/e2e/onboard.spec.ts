import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { API_URL } from "../playwright.config";
import { ACCOUNT, CONNECT, DESK, ONBOARD, RIDE } from "../src/lib/vocab";
import { dayStamp } from "../src/lib/elevator";

/**
 * The sign-up walk (docs/SPEC-ONBOARDING.md), end to end against the fixture API at 375px:
 * one question a screen, phone first, a league on the way in, the first call, the free week.
 *
 * The fixture API has no Stripe key, so the free week is written directly (the same row
 * Stripe's $0 invoice writes) and the button says so. It texts nothing: the dev verifier
 * hands the code back, and mails nothing: the confirm link comes back in the reply.
 */

const LEAGUE = { league_id: "1403186749361901568", team_name: "GoldenPP" };

async function stubExternal(route: Route): Promise<void> {
  const { hostname } = new URL(route.request().url());
  if (hostname === "127.0.0.1" || hostname === "localhost") return route.continue();
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

function freshPhone(): string {
  const n = String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
  return `555${"2" + n.slice(0, 2)}${String(Math.floor(Math.random() * 1e4)).padStart(4, "0")}`;
}

function freshEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide, "the walk scrolls sideways at 375px").toBeLessThanOrEqual(1);
}

/** The number, then the code off the dev API: the sixth digit submits it. */
async function phoneAndCode(page: Page, phone: string) {
  await expect(page.getByTestId("walk-phone")).toBeVisible();
  await page.getByLabel(ONBOARD.phone.label).fill(phone);
  await page.getByRole("button", { name: ONBOARD.phone.send }).click();
  await expect(page.getByTestId("walk-code")).toBeVisible();
  const code = ((await page.getByTestId("dev-code").textContent()) ?? "").match(/(\d{6})/)?.[1] ?? "";
  await page.getByLabel(ONBOARD.code.label).fill(code);
}

/** The league screen, with the fixture league found by a Sleeper username. */
async function linkLeague(page: Page) {
  await expect(page.getByTestId("walk-league")).toBeVisible();
  await page.getByRole("radio", { name: "Sleeper" }).click();
  await page.locator("#sleeper-input").fill("someone");
  await page.getByRole("button", { name: "Find" }).click();
  await page.getByRole("button", { name: new RegExp(LEAGUE.team_name) }).click();
  await page.getByRole("button", { name: CONNECT.submit }).click();
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

test("the walk: phone, code, nameplate, mailbox, league, the first call, the free week, and in", async ({ context, page }) => {
  await beAStranger(context);
  await page.goto("/");
  await page.locator('a[href="/register"]:visible').first().click();
  await page.waitForURL("**/register");

  // One question: the number. The bar is already lit, and email is a side door.
  await expect(page.getByRole("heading", { level: 1, name: ONBOARD.phone.title })).toBeVisible();
  await expect(page.getByRole("button", { name: ONBOARD.phone.useEmail })).toBeVisible();
  await noSidewaysScroll(page);
  await phoneAndCode(page, freshPhone());

  // The nameplate, with the game-day texts box unticked.
  await expect(page.getByRole("heading", { level: 1, name: ONBOARD.name.title })).toBeVisible();
  await expect(page.locator('[data-auth="sms-opt-in"] input')).not.toBeChecked();
  await page.getByLabel(ONBOARD.name.label).fill("Andrew");
  await page.getByRole("button", { name: ONBOARD.name.cta }).click();

  // The mailbox makes the account.
  await expect(page.getByRole("heading", { level: 1, name: ONBOARD.mailbox.title })).toBeVisible();
  await page.getByLabel(ONBOARD.mailbox.label).fill(freshEmail("walk"));
  await page.getByRole("button", { name: ONBOARD.mailbox.cta }).click();
  await expect(page.getByRole("heading", { level: 1, name: ONBOARD.league.title })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("booth.session"))).toBeTruthy();

  // The league, with no slot warning: the first of three is nothing to warn about.
  await linkLeague(page);
  await expect(page.getByTestId("confirm-link")).toHaveCount(0);

  // The first call: stamped, theirs, and the paid rooms' moves without their names.
  await expect(page.getByTestId("walk-reveal")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(LEAGUE.team_name) })).toBeVisible();
  await expect(page.getByTestId("reveal-call")).toBeVisible();
  await noSidewaysScroll(page);
  await page.getByRole("button", { name: ONBOARD.reveal.cta }).click();

  // The offer: FREEWEEK already applied, the week chosen, $0 today and the day it charges.
  await expect(page.getByTestId("walk-offer")).toBeVisible();
  await expect(page.getByTestId("offer-code")).toHaveText(ONBOARD.offer.applied("FREEWEEK"));
  await expect(page.getByTestId("offer-week_pass")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("offer-week_pass")).toContainText("$0 today");
  await expect(page.getByTestId("offer-week_pass")).toContainText("$4.99 on");
  await expect(page.getByTestId("offer-full_report")).toContainText("$29.99 on");
  await expect(page.getByTestId("offer-skip")).toBeVisible();
  await noSidewaysScroll(page);
  // No Stripe on the fixture API: the free week opens on the spot.
  await page.getByTestId("offer-take").click();

  await expect(page.getByRole("heading", { level: 1, name: ONBOARD.done.paidTitle })).toBeVisible();
  await page.getByTestId("walk-exit").click();
  await page.waitForURL("**/home");
  const ride = page.getByRole("status", { name: RIDE.aria });
  if (await ride.count()) await ride.click();
  await expect(page.getByRole("region", { name: DESK.aria })).toBeVisible();

  // The account: the league on file, the free week on the plan, every room open.
  await page.goto("/account");
  await expect(page.getByTestId("league-room")).toHaveText("1 of 3 leagues");
  await expect(page.getByTestId("plan-line")).toContainText("Free week");
  await expect(page.locator("[data-plan=premium]").first()).toBeVisible();

  // Walking it again is not offered: /register sends a finished account upstairs.
  await page.goto("/register");
  await page.waitForURL("**/home");
});

test("no phone: email, password, nameplate, no league yet, and not now to the free week", async ({ context, page }) => {
  await beAStranger(context);
  await page.goto("/register");
  await page.getByRole("button", { name: ONBOARD.phone.useEmail }).click();
  const email = freshEmail("door");
  await page.getByLabel(ONBOARD.email.label).fill(email);
  await page.getByRole("button", { name: ONBOARD.email.cta }).click();
  await expect(page.getByTestId("walk-password")).toBeVisible();

  // Back keeps what was typed.
  await page.getByTestId("walk-back").click();
  await expect(page.getByLabel(ONBOARD.email.label)).toHaveValue(email);
  await page.getByRole("button", { name: ONBOARD.email.cta }).click();

  await page.getByLabel(ONBOARD.password.label).fill("owner of the building");
  await page.getByRole("button", { name: ONBOARD.password.cta }).click();
  await page.getByLabel(ONBOARD.name.label).fill("Sam");
  await page.getByRole("button", { name: ONBOARD.name.cta }).click();

  // No mail provider on the fixture API: no inbox screen claiming a link went out.
  await expect(page.getByTestId("walk-league")).toBeVisible();
  await expect(page.getByTestId("walk-verify")).toHaveCount(0);
  await page.getByTestId("walk-no-league").click();

  await expect(page.getByTestId("walk-offer")).toBeVisible();
  await page.getByTestId("offer-skip").click();
  await expect(page.getByRole("heading", { level: 1, name: ONBOARD.done.freeTitle })).toBeVisible();
  await page.getByTestId("walk-exit").click();
  await page.waitForURL("**/home");

  // Said not now: the account is free and the free week is still there for later.
  const token = await page.evaluate(() => localStorage.getItem("booth.session"));
  const me = await (await page.request.get(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(me.account.plan.tier).toBe("free");
  expect(me.trial_eligible).toBe(true);
  expect(me.account.name).toBe("Sam");
});

test("a half-walked account picks up where it stopped", async ({ context, page }) => {
  await beAStranger(context);
  const res = await page.request.post(`${API_URL}/api/auth/register`, {
    data: { email: freshEmail("resume"), password: "owner of the building", name: "Lee" },
  });
  const token = (await res.json()).token as string;
  await context.addInitScript((t) => window.localStorage.setItem("booth.session", t), token);
  await page.goto("/register");
  // Named and signed in, no league: the league is the first gap.
  await expect(page.getByTestId("walk-league")).toBeVisible();
  // The account page's welcome sends a new account back into the walk.
  await page.goto("/account");
  await expect(page.getByTestId("welcome").getByRole("link", { name: ACCOUNT.welcome.cta })).toHaveAttribute("href", "/register");
});

test("a confirm link proves the address once, and a spent one says so", async ({ context, page }) => {
  await beAStranger(context);
  const res = await page.request.post(`${API_URL}/api/auth/register`, {
    data: { email: freshEmail("confirm"), password: "owner of the building", name: "Kit" },
  });
  const token = (await res.json()).token as string;
  const start = await page.request.post(`${API_URL}/api/auth/email/verify/start`, { headers: { Authorization: `Bearer ${token}` } });
  const out = await start.json();
  expect(out.sent).toBe(false);
  const path = new URL(out.dev_link as string).search;
  await page.goto(`/verify${path}`);
  await expect(page.getByTestId("verify-done")).toBeVisible();
  await expect(page.getByRole("heading", { name: ONBOARD.confirm.done })).toBeVisible();
  expect(page.url()).not.toContain("token=");
  await page.goto("/account");
  await expect(page.getByTestId("email-verified")).toBeVisible();
  await page.goto(`/verify${path}`);
  await expect(page.getByTestId("verify-bad")).toBeVisible();
});
