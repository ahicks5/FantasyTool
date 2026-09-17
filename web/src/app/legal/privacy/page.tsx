import type { Metadata } from "next";
import { LAST_UPDATED } from "../layout";

export const metadata: Metadata = {
  title: "Privacy — Edge",
  description: "What Edge stores, who it goes to, and how to get it back or erased.",
};

export default function Privacy() {
  return (
    <>
      <h1 className="display text-3xl">Privacy</h1>
      <p className="mt-1 text-sm text-muted">Last updated {LAST_UPDATED}</p>

      <p className="mt-6">
        Short version: we hold your email address, which leagues you connected, what you bought, and
        the recommendations we made you. We have never had your password for anything. You can
        download all of it or delete all of it at any time.
      </p>

      <h2 className="display mt-8 text-xl">What we store</h2>
      <ul className="mt-2 grid gap-2">
        <li>
          <strong>Your email address</strong>, once you sign in. Sign-in is a magic link, so there is
          no password to store and we never see one.
        </li>
        <li>
          <strong>The leagues you connect</strong>: the platform, the league id, which team is yours,
          and the league&rsquo;s name. These are public identifiers on Sleeper and ESPN.
        </li>
        <li>
          <strong>What you bought</strong>: the product, the season, and a Stripe reference. Card
          details go to Stripe and never reach us.
        </li>
        <li>
          <strong>What we recommended</strong>, and which version of the engine produced it. This is
          how we check next week whether we were right.
        </li>
        <li>
          <strong>Your Helpful / Wrong votes</strong> on a recommendation, and the reason if you gave
          one.
        </li>
      </ul>
      <p className="mt-3">
        You can browse without an account. Connect a league signed out and nothing is stored on our
        side at all &mdash; the choice lives in your own browser.
      </p>

      <h2 className="display mt-8 text-xl">What we do not store</h2>
      <p className="mt-2">
        No passwords, no card numbers, no league chat, no contact list, no location, and no
        advertising or cross-site tracking identifiers. We do not sell anything to anyone, and we do
        not buy data about you either.
      </p>

      <h2 className="display mt-8 text-xl">Who else sees it</h2>
      <ul className="mt-2 grid gap-2">
        <li>
          <strong>Sleeper and ESPN</strong> &mdash; we read your league from their public interfaces.
          They see requests for a league, not anything about you.
        </li>
        <li>
          <strong>Stripe</strong> &mdash; handles the payment and holds your card details, not us.
        </li>
        <li>
          <strong>Supabase</strong> &mdash; sends the sign-in link and holds the account record.
        </li>
        <li>
          <strong>Anthropic</strong> &mdash; when a trade verdict is explained in writing, the
          engine&rsquo;s numbers and the player names in that trade are sent to the Claude API. Your
          email address and your league id are not part of that request.
        </li>
        <li>
          <strong>Our hosts</strong> &mdash; Vercel and our API host, who run the servers.
        </li>
      </ul>

      <h2 className="display mt-8 text-xl">Shared verdict links</h2>
      <p className="mt-2">
        When you share a trade verdict, the public page holds only what is printed on the card: the
        verdict, the players in the deal, the numbers, and the explanation. It carries no email
        address, no league id, and no roster beyond those players. Anyone with the link can open it,
        so treat it as public &mdash; because it is.
      </p>

      <h2 className="display mt-8 text-xl">Getting your data back, or deleted</h2>
      <p className="mt-2">
        Signed in, <code>GET /api/me/data</code> returns everything we hold about your account, and{" "}
        <code>DELETE /api/me?confirm=delete</code> erases it. Or email us and we will do it for you.
      </p>
      <p className="mt-2">
        Deleting your account deletes your purchases too, which means a season pass goes with it. We
        would rather say that plainly than surprise you on a Sunday morning. Share links you created
        keep working, because they contain nothing of yours to erase.
      </p>

      <h2 className="display mt-8 text-xl">How long we keep it</h2>
      <p className="mt-2">
        Account and purchase records last as long as the account. Recommendation logs are kept
        through the following season so we can measure accuracy, then deleted. Shared verdict
        snapshots are kept until you ask us to remove one.
      </p>

      <h2 className="display mt-8 text-xl">Children</h2>
      <p className="mt-2">Edge is not intended for anyone under 13, and we do not knowingly collect their data.</p>

      <h2 className="display mt-8 text-xl">Changes</h2>
      <p className="mt-2">
        If we start storing something new, this page changes before the code does, and the date at
        the top moves.
      </p>
    </>
  );
}
