# Brand — two temperatures

The app and the things that leave the app are read in different places by different people.
They do not get the same visual language.

## Inside: the ledger

Warm paper, near-black ink, hairline rules, colour only where it carries a meaning, tabular
numerals everywhere, one dark surface per screen. No gradients, no glow, no confetti. Motion
is the single 0.42s `rise`, once.

Why: we ask for $7 on the strength of the numbers. Anything that looks like a sportsbook makes
the projections look like a guess. The restraint is the sales pitch.

Tokens: `web/src/app/globals.css`. The status colours (start / sit / lean / flip) were validated
against the real card surfaces in both themes — never swap a hex without re-running that check,
and never let colour carry a meaning on its own (every status ships with a word and a meter).

## Outside: the flare

Every 1080x1080 card is dark, carries **one** idea set enormous, and ends in a lime strip.

- One word and one number. Everything else is fine print or belongs on the `/s/` page.
- Display type at 100px and up, condensed (Archivo's `wdth` axis, 68–82).
- Designed to be read at 400px wide in a feed. Check it at that size before shipping it.
- The league name and the week stay on the card: they are the receipt.

Why: nobody screenshots a dashboard. They screenshot a ruling that ends an argument they were
already having.

### The flare

`--color-flare: #d6f94a`, text on it always `--color-flare-ink`.

1. It is never a status. It cannot mean start, gain or accept.
2. It never appears in app chrome — share cards, the landing hero, and marketing only.
3. Once per surface. In practice that means: the bottom strip, and the wordmark's meter.

It is a second green, next to `start` (`#0b7a4b`). They only coexist because they sit in
completely different lightness bands — a fluorescent fill against a deep forest text colour —
and never share a role. If that ever reads as ambiguous on a real card, the fallback is no
accent at all: paper, ink, and the four signals.

### The mark

The wordmark's dot is the three-bar confidence meter that is already on every call in the
product, so the logo and the app say one thing. Bars can render at 1, 2 or 3 to match the
confidence of whatever the card is about (`Wordmark filled=`, `graphics._mark`).

## The cards

All three are in `edge/graphics.py`, one chassis, and mirrored for in-app preview in
`web/src/components/ShareCard.tsx`. **Change one, change both** — the preview and the real PNG
have to agree.

| Card | Function | Who can make it | Strip |
| --- | --- | --- | --- |
| Trade verdict | `verdict_card_html` | Trade Lab ($5) | We grade every call. Win or lose. |
| Start/sit | `lock_card_html` | **free, no account** | Free. One league, every week. |
| Receipts | `receipts_card_html` | us, every Tuesday | We post this every Tuesday. Win or lose. |

Render them from the CLI:

```
uv run python -m edge.cli card     <league> <my_team> <their_team> <give> <get>
uv run python -m edge.cli lockcard <league> <team>          # defaults to Locks only
uv run python -m edge.cli receipts <week>                   # from docs/backtest_week<n>.json
```

## Positioning

Nobody else in fantasy publishes their record. That is the whole opening. The receipts card
goes out every Tuesday whether the week was good or bad — a scorecard you only post after a
win is worth nothing, and `receipts_card_html` renders a losing week in red without being
asked to.

The word to market is **Lock**, not "Edge". It is in the product, it is validated, it is one
syllable, and it is what somebody types in a league chat when they are certain.
