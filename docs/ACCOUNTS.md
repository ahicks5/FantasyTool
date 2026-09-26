# Accounts: register, sign in, recovery

The one page for how a person gets into Penthouse, how they get back in when they are locked
out, and what we hold. Owned by the accounts work; change it in the same commit as the code.
The contract is `docs/API.md` "Accounts"; the web wiring is `docs/WEB.md` "The account".

## The flows

| Flow | Page | API | What is checked |
|---|---|---|---|
| Register | `/register`, or the sheet from any locked room | `POST /api/auth/register` | address shape (≤254), password 8–256 chars, name ≤80; 409 if the address is taken. Signs in on success and lands on `/account`. |
| Sign in | `/login`, or the sheet | `POST /api/auth/login` | one 401 for wrong password and unknown address, same scrypt cost for both; 10 failures per address per 15 min → 429. |
| Stay signed in | every page | `Authorization: Bearer` | token hash looked up in `sessions`; 30 days; an unknown or expired token is cleared from the browser (`session.ts`). |
| Sign out | `/account`, `/login` | `POST /api/auth/logout` | this device only; the browser drops the token even if the call fails. |
| Sign out other devices | `/account` → Sign-in and security | `POST /api/auth/logout-others` | every session but this one. |
| Change password | `/account` → Sign-in and security | `POST /api/auth/password` | needs the current password (a borrowed unlocked phone cannot take the account); ends every other session and every unspent reset link. |
| Forgot password | `/login` → Forgot your password? | `POST /api/auth/forgot` | always `ok`; 3 mails per address per hour; the link lasts 2 hours and works once. |
| Set a new password | `/reset?token=…` | `POST /api/auth/reset` | token spent atomically; ends every session and every other link; clears the sign-in throttle; signs in here. The page takes the token off the address bar. |
| Delete the account | `/account` → type "delete" | `DELETE /api/me?confirm=delete` | removes the user, sessions, resets, leagues, purchases, prefs, runs and feedback. The address can register again. |

Pages that need an account check it twice: the view asks the sheet (`useAccountGate`) and the
API answers 401 regardless. `/account` and `/admin` are guarded; `POST /api/connect` is 401 to a
stranger; `/admin` routes are 403 to anyone but an admin.

## Recovery plan

**Forgot password.** The reset link, by email once a provider is set (below). Until then the
form says plainly that nothing was sent, shows the support address (`NEXT_PUBLIC_SUPPORT_EMAIL`)
when it is set, and the owner issues the link by hand: `/admin` → the account → "Reset link",
then send it from the support mailbox **to the address on the account, never to another one**.
Handing a link to whoever asks is handing them the account.

**Forgot username.** There is no username: the sign-in is the email address. The forgot screen
says so. Someone unsure which address they used tries each on the forgot form (it never says
which one has an account). If they still cannot find it, they write to support; the owner can
look them up on `/admin` by name or by a league on file, and replies **to the address on the
account** — never tells the asker which address it is.

**Locked out by the throttle.** It lifts after 15 minutes, and a password reset clears it at once.

**Lost a phone or a shared laptop.** Sign in anywhere, then "Sign out other devices", or change
the password, which does both.

**Someone else registered my email.** There is no email verification yet, so this can happen.
The real owner of the inbox runs "Forgot password": the link goes to them, the reset signs the
squatter out everywhere, and the account is theirs. Leagues the squatter linked can be forgotten
from `/account`.

## What we store (both backends, `edge/api/store.py` and `store_pg.py`)

| Table | Columns | Notes |
|---|---|---|
| `users` | `email` PK (lower-cased), `password_hash`, `name`, `role`, `created`, `last_login` | scrypt, self-describing (`scrypt$n$r$p$salt$dk`) so the cost can rise without a migration. Never leaves the API (`public_user`, export hides it). |
| `sessions` | `token_hash` PK, `email` (indexed), `created`, `expires` | SHA-256 of a 32-byte random token. A copy of the database signs nobody in. |
| `resets` | `token_hash` PK, `email` (indexed), `created`, `expires`, `used` | same hashing; `used` set in the same statement that checks it. |

Expired sessions and spent or expired links are pruned on every sign-in (`prune_auth`).
`tests/test_store_contract.py` pins every rule on both backends — run it against a scratch
Postgres before touching either store.

## Known gaps and what they need

1. **Reset email does not send yet.** Needs on Render: `EDGE_EMAIL_PROVIDER=resend`,
   `RESEND_API_KEY`, `EDGE_EMAIL_FROM` (a verified sending domain). Nothing in code changes.
2. **No email verification.** Mitigated by the reset flow above. Worth adding once mail sends:
   a "confirm your address" link, required before the first purchase.
3. **The throttles are per process.** Right for one Render container; with several, the
   budget multiplies by the count and wants a shared counter (same note as `limits.py`).
4. **Changing the sign-in email** is not self-serve. Today: export, delete, register again, and
   the owner re-grants any pass from `/admin`. Worth building if people ask.
5. **Accounts need a durable database.** On Render's free plan the local disk does not survive a
   redeploy, so without `DATABASE_URL` every account, session and purchase is lost on each deploy.
