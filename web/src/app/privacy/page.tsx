import type { Metadata } from "next";
import { Bullets, LegalPage, Section } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy — Penthouse",
  description: "What Penthouse stores, what it deliberately does not, and who else sees it.",
};

/**
 * Written from what the code actually does, not from a template. If the data flow
 * changes — a new third party, a new stored field — this page changes with it. The
 * ESPN credential section in particular describes a real and unusual design decision
 * (see CLAUDE.md) and is the part most worth keeping accurate.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <Section heading="The short version">
        <p>
          {LEGAL.operator} stores the least it can get away with: an email address so your purchase follows you, which
          leagues you connected, and what it recommended so it can check later whether it was right. It never stores
          your ESPN password or cookies, and never sees your card details. There is no advertising and nothing is sold
          to anyone.
        </p>
      </Section>

      <Section heading="What is stored">
        <Bullets
          items={[
            <>
              <strong>Your email address</strong>, if you sign in. Sign-in is a magic link, so there is no password to
              store. It is the key that purchases and connected leagues hang off.
            </>,
            <>
              <strong>The leagues you connect</strong>: the platform, the league and team identifiers, and the league
              name. Enough to rebuild your week when you come back.
            </>,
            <>
              <strong>Your purchases</strong>: which pass, which season, and the Stripe checkout reference. Never a card
              number, which we could not store even if we wanted to.
            </>,
            <>
              <strong>What we recommended</strong>, with the version of the engine that produced it, plus any
              Helpful/Wrong vote you leave. This is how we grade ourselves against what actually happened. It is the
              only reason the accuracy numbers on the site mean anything.
            </>,
          ]}
        />
      </Section>

      <Section heading="ESPN private leagues: your cookies are borrowed, never kept">
        <p>
          Reading a private ESPN league requires two cookies from your browser, <code>espn_s2</code> and{" "}
          <code>SWID</code>. Those are a read session for your whole ESPN account. They cannot be narrowed to one
          league, and we cannot revoke them.
        </p>
        <p>
          So we do not keep them. They stay in your browser, ride along with the request that needs them, and are gone
          when it finishes. They are never written to our database or to disk, and logs record only a fingerprint,
          never the values. Cached league data is keyed to that fingerprint, so a private league is never served to
          someone who has not proved they can read it.
        </p>
        <p>
          The deliberate cost: anything that runs without you, such as a scheduled weekly email, cannot read a private
          ESPN league, because by then we have nothing to read it with. We think that is the right trade.
        </p>
      </Section>

      <Section heading="Public share pages">
        <p>
          Turning a trade verdict into a link at <code>/s/…</code> publishes a display-only snapshot: the verdict, the
          player names already on the card, and the numbers. It carries no email address, no league identifier and no
          roster. Anyone with the link can open it, so treat it as public, because it is.
        </p>
      </Section>

      <Section heading="Who else is involved">
        <Bullets
          items={[
            <>
              <strong>Stripe</strong> takes the payment. Card details go to Stripe, never to us. We receive that a
              purchase succeeded and a reference for it.
            </>,
            <>
              <strong>Supabase</strong> sends the sign-in link and stores the account record.
            </>,
            <>
              <strong>Sleeper and ESPN</strong> are read to fetch your league, rosters and projections. We read from
              them; we do not send them anything about you beyond what the request requires.
            </>,
            <>
              <strong>Anthropic</strong>, only when written trade explanations are switched on, and then only the
              numbers and player names already in the verdict. Never your email or your league. With the setting off,
              explanations come from templates and nothing leaves our server.
            </>,
            <>Our hosting providers, who necessarily process requests on our behalf.</>,
          ]}
        />
      </Section>

      <Section heading="What is kept in your browser">
        <p>
          Your sign-in session, the league you last connected, your light or dark preference, and — in a demo build —
          which features are unlocked. These sit in your browser&rsquo;s own storage, not on our servers. There are no
          advertising or analytics trackers.
        </p>
      </Section>

      <Section heading="Keeping and deleting">
        <p>
          Recommendation records are kept while they are useful for measuring accuracy. Purchase records are kept as
          long as the law requires for a sale.
        </p>
        <p>
          {LEGAL.supportEmail ? (
            <>
              Ask at <a className="underline" href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a> and we will
              delete your account and everything attached to it.
            </>
          ) : (
            <>Ask us and we will delete your account and everything attached to it.</>
          )}{" "}
          Deleting the account ends access to any pass bought with it.
        </p>
      </Section>

      <Section heading="Age">
        <p>Penthouse is not intended for anyone under 13, and we do not knowingly collect their information.</p>
      </Section>

      <Section heading="Changes">
        <p>
          If this page changes in a way that matters, the date at the top changes and we say so in the app. Continuing
          to use Penthouse after that means the new version applies.
        </p>
      </Section>
    </LegalPage>
  );
}
