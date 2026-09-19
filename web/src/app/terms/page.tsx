import type { Metadata } from "next";
import { Bullets, LegalPage, Section } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms — Penthouse",
  description: "What you are buying, what it does and does not promise, and how refunds work.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <Section heading="What Penthouse is">
        <p>
          Penthouse reads a fantasy football league you already have and tells you what it would do this week: who to start,
          who to claim and for how much, and whether a proposed trade is worth taking. It is information and opinion.
          The decisions stay yours.
        </p>
        <p>
          {LEGAL.operator} is not affiliated with, endorsed by, or connected to the NFL, ESPN, Sleeper, Yahoo, or any
          other league platform. Their names are used only to say which leagues we can read.
        </p>
      </Section>

      <Section heading="Your account">
        <p>
          You can connect a league and see your week without an account. Signing in happens at checkout, by a link sent
          to your email address, so whoever can read that inbox can reach the account. Keep it to yourself.
        </p>
      </Section>

      <Section heading="What you are paying for">
        <Bullets
          items={[
            <>
              A pass is a <strong>one-time payment for the rest of the current NFL season</strong>. There is no
              subscription and nothing renews on its own. When the season ends, the pass ends with it.
            </>,
            <>
              Prices are shown before you pay and charged in US dollars. The price you see at checkout is the price you
              pay.
            </>,
            <>
              Each pass covers the number of leagues stated on the pricing page. The free tier covers one team.
            </>,
          ]}
        />
      </Section>

      <Section heading="Refunds">
        <p>
          If Penthouse is not useful to you, ask within {LEGAL.refundDays} days of buying and we will refund it in full. No
          reasoning required.
        </p>
        <p>
          After that window, a pass is non-refundable, except where the law says otherwise. If we take your money and
          the product does not work, that is a refund whenever it happens, not a favour.
        </p>
      </Section>

      <Section heading="What Penthouse does not promise">
        <p>
          Projections come from third parties and are estimates. Penthouse re-scores them to your league&rsquo;s settings and
          reasons about them, but it cannot know whether a running back tweaks a hamstring in warmups.
        </p>
        <p>
          The confidence tags are measured, not decorative: they describe how often calls at that margin have been right
          historically. Historical accuracy is not a guarantee about any particular week, and a &ldquo;Lock&rdquo; that
          loses is within the advertised behaviour rather than a defect.
        </p>
        <p>
          Penthouse is provided as is. We are not liable for lineup outcomes, league placings, missed waiver claims, trades
          you accept or decline, or anything else that follows from acting on its advice. Nothing here is financial or
          betting advice, and Penthouse is not a gambling service.
        </p>
      </Section>

      <Section heading="Using it fairly">
        <Bullets
          items={[
            <>Use Penthouse for your own leagues. Do not resell, rebrand or redistribute what it produces as a service.</>,
            <>
              Do not hammer the API, scrape it, or automate against it beyond ordinary use of the app. It sits on top of
              other people&rsquo;s rate limits as well as ours.
            </>,
            <>
              Connecting a league means you are entitled to see that league. If you supply ESPN credentials, they must
              be yours. You remain bound by your league platform&rsquo;s own terms.
            </>,
          ]}
        />
      </Section>

      <Section heading="Availability">
        <p>
          Penthouse is a seasonal product and is most useful during the NFL season. We aim to keep it up through the week
          that matters, particularly before kickoff, but it can be interrupted, and the data providers it depends on can
          change or withdraw without notice.
        </p>
      </Section>

      <Section heading="Ending it">
        <p>
          You can stop using Penthouse at any time and ask us to delete your account. We can suspend access for behaviour
          that breaks these terms or that puts the service at risk, and where that happens through no fault of yours we
          will refund the unused part of a pass.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          These terms can change. If they do in a way that matters, the date at the top changes and we say so in the
          app. Changes do not apply retroactively to a pass you have already bought.
        </p>
      </Section>

      {LEGAL.jurisdiction && (
        <Section heading="Governing law">
          <p>These terms are governed by the laws of {LEGAL.jurisdiction}.</p>
        </Section>
      )}
    </LegalPage>
  );
}
