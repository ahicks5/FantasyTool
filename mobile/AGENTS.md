# The iPhone app

Expo SDK 57, React Native, TypeScript. **Read `docs/IOS.md` first**: what the app is (a native
frame around the live site, plus ESPN sign-in, reminders, the share sheet and haptics), why it
is built that way, and how it ships to TestFlight.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. Before writing code that touches an Expo, EAS or
React Native API, read the versioned docs for the SDK in `package.json`
(`https://docs.expo.dev/versions/v57.0.0/`) or the installed package's `.d.ts`. Two that already
bit here: `StyleSheet.absoluteFillObject` is gone (use `absoluteFill`), and an Expo module's
import is the package, never a deep path.

## Rules that are this repo's, not Expo's

- **Words a user reads live in `web/src/lib/vocab.ts`** (the `NATIVE` section), imported from
  there. Metro is pointed at `web/src/lib` in `metro.config.js` for exactly this.
- **Logic is pure and tested in node** (`policy.ts`, `bridge.ts`, `espn.ts`, `reminders.ts`):
  no React Native import in those files, and imports between them carry `.ts`, the same rule as
  `web/src/lib` (docs/WEB.md, "A tested lib module imports its neighbours with `.ts`").
- **Nothing about a league leaves the phone.** The ESPN key goes from ESPN's page to ours in a
  URL fragment, never to the server (`docs/DATA.md`).
- One screen, no router: the app is the site. A new native screen is a modal over `App.tsx`.
- `ios/` and `android/` are generated (Continuous Native Generation) and gitignored. Configure
  native behaviour in `app.json` and config plugins, never by hand.
- Add a native library with `npx expo install <pkg>`, and only when the stdlib or an Expo
  module cannot do the job. Anything outside Expo Go needs a development build.

## Before pushing

```bash
npm run typecheck && npm test && npm run bundle:check
```

CI's `mobile` job runs the same three. A change in `web/src/lib/{vocab,espnKey,format,native}.ts`
can break the app; this job is what catches it.
