import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every player's name in the app is a door into his page.
 *
 * That is the whole feature, and it is the kind of feature that decays quietly: the sweep
 * was done once, and the next surface someone builds will print `{p.name}` because that is
 * what the file beside it used to do. So the sweep is a test rather than a commit.
 *
 * It looks for a name rendered directly into JSX and requires that the file either goes
 * through `PlayerName` or is on the list below **with a reason**. The reason is the point:
 * an exemption someone has to write a sentence for is an exemption someone thinks about.
 */

const ROOTS = ["src/components", "src/app"];

/** `{p.name}`, `{w.player.name}`, `{c.out?.name}`. Not `${x.name}`, which is a sentence. */
const RENDERED_NAME = /(^|[^$=])\{\s*[A-Za-z_$][\w.?[\]"']*\.name\s*(\?\?[^}]*)?\}/;

/**
 * Files allowed to print a name without opening a page, and why.
 *
 * Three kinds live here. Some are not players at all -- a product, a league, an NFL team.
 * Some are a player the app genuinely cannot open, because the payload behind the surface
 * carries no player id: `StarterLine` and `StarterQuestion` are names and slots, and
 * `SharedPlayer` deliberately drops the id so a shared card cannot leak a roster. And one
 * is the player page's own header, which is already the page.
 *
 * `GameDay.tsx` is not listed because it never writes `.name` -- it takes a bare `name`
 * string prop. It is the same blocker as `FilmWeek`'s starter row and wants the same fix.
 */
const ALLOWED: Record<string, string> = {
  "src/components/Players.tsx": "PlayerName itself: this is the one place a name is printed.",
  "src/components/player/PlayerSheet.tsx": "The player page's own header. It is already his page.",
  "src/components/Locked.tsx": "A product's name on the paywall, not a player's.",
  "src/components/LineupView.tsx":
    "The board's slot rows only. The whole row is the target now (PlayerTarget), so the " +
    "name inside it cannot also be a button -- a button cannot hold a button. The swap " +
    "lines and the bench rows above and below it do go through PlayerName.",
  "src/components/player/Report.tsx": "The player page's own header. It is already his page.",
  "src/components/Pricing.tsx": "A product's name on the price list, not a player's.",
  "src/components/Unlocking.tsx": "A product's name, said back after a purchase, not a player's.",
  "src/components/Standings.tsx": "A fantasy team's name in the table, not a player's.",
  "src/components/ShareCard.tsx":
    "The share card. `SharedPlayer` carries no id on purpose, so there is nothing to open, " +
    "and the card is an image for someone who has never opened the app.",
  "src/components/FilmWeek.tsx":
    "The starter rows only. `StarterLine` (lib/recap.ts) is a name, a slot and a score with " +
    "no player id on it, so there is no page to open. The bench rows beside them do go " +
    "through PlayerName. Carrying the id through the recap payload is the fix.",
  "src/components/PlayerSearch.tsx":
    "A search hit already opens his page, at /waivers/<id>. That route is the deep link " +
    "(SPEC-PLAYER-PAGE.md, D-8) and the page the static demo exports, so the search is the " +
    "one surface that should keep taking you to it rather than raising a sheet over it.",
  "src/app/s/[id]/page.tsx": "The shared verdict page. Same `SharedPlayer` with no id, and it is read signed-out.",
  "src/app/connect/page.tsx": "League and team names on the way in, before there is a league to score anyone by.",
  "src/app/trade/page.tsx":
    "The selected-player chips are themselves buttons that remove the man from the offer, " +
    "and a button cannot hold another button. The roster rows they are built from go " +
    "through PlayerLine, which does open his page.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

test("no surface renders a player's name without opening his page", () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      if (file in ALLOWED) continue;
      const body = readFileSync(file, "utf8");
      for (const line of body.split("\n")) {
        if (RENDERED_NAME.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "a name is printed here instead of opening his page. Use <PlayerName p={...} />, or add " +
      "the file to ALLOWED in this test with the reason it cannot:\n" +
      offenders.join("\n"),
  );
});

test("every exemption names a file that still exists", () => {
  // An allowlist that outlives its files is how an exemption becomes permanent.
  const seen = new Set(ROOTS.flatMap((r) => walk(r)));
  for (const file of Object.keys(ALLOWED)) {
    assert.ok(seen.has(file), `${file} is on the allowlist but no longer exists`);
  }
});

test("every exemption gives a reason, not a shrug", () => {
  for (const [file, why] of Object.entries(ALLOWED)) {
    assert.ok(why.length > 30, `${file} is exempt without a real reason`);
    assert.ok(/\.$/.test(why), `${file}'s reason is not a sentence`);
  }
});
