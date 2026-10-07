/** The terms of service. The facts it cannot work out for itself live in lib/legal.ts. */
import type { Metadata } from "next";
import { Bullets, LegalPage, Section } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms · Owner's Suite",
  description: "What you are buying, what it does and does not promise, and how refunds work.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <Section heading="What Owner's Suite is">
        <p>
          Owner&rsquo;s Suite reads a fantasy football league you already have and tells you what it would do this week: who to start,
          who to claim and for how much, and whether a proposed trade is worth taking. It is information and opinion.
          The decisions stay yours, and nothing is ever changed in your league for you: we read, we never write.
        </p>
        <p>
          The numbers come from our own engine. Where a sentence explains them, it may be written by an AI model working
          only from those numbers; it does not invent a figure.
        </p>
        <p>
          {LEGAL.operator} is not affiliated with, endorsed by, or connected to the NFL, ESPN, Sleeper, Yahoo, or any
          other league platform. Their names are used only to say which leagues we can read. Today that is Sleeper and
          ESPN.
        </p>
      </Section>

      <Section heading="Your account">
        <Bullets
          items={[
            <>
              You need an account to link a league. You sign in with your mobile number and a code we text to it, or,
              if you have no mobile, with an email address and a password.
            </>,
            <>
              Whoever controls that phone or that inbox can reach the account, so keep them to yourself. One account
              per person.
            </>,
            <>
              Sign-in codes are the only texts we send unless you tick the box for game-day texts: up to four a week
              with your calls and offers. Message and data rates may apply. Reply STOP to end them or HELP for help, or
              untick the box on your account page. You never have to agree to texts to sign up or to buy.
            </>,
            <>
              Every account, free or paid, keeps up to three leagues. More can be added as league slots. Forgetting a
              league does not give its slot back for the rest of the season.
            </>,
          ]}
        />
      </Section>

      <Section heading="What you are paying for">
        <Bullets
          items={[
            <>
              The <strong>week pass</strong> is a <strong>subscription that renews automatically every week</strong> at
              the price shown before you pay, charged to the card you paid with, until you cancel. You can cancel at any
              time from your account page (Manage or cancel) or by contacting us. Cancelling stops the next renewal; the
              week you have already paid for stays open until it runs out.
            </>,
            <>
              The <strong>season pass</strong> is a <strong>one-time payment for the rest of the current NFL season</strong>.
              Nothing about it renews. While a paid week pass is running it costs less, as shown at checkout, and buying
              it ends the week pass&rsquo;s subscription so you are never charged for both.
            </>,
            <>
              A <strong>league slot</strong> is a one-time payment for one more league on your account, for the rest of
              the current season. It does not renew.
            </>,
            <>
              <strong>The free week.</strong> A new account can start either pass with its first seven days free. Your
              card is taken up front and nothing is charged during those seven days. On day eight we charge the pass you
              picked: the week pass then renews weekly, the season pass is one payment. Cancel before day eight and you
              are not charged at all.
            </>,
            <>
              Prices are shown before you pay and charged in US dollars by Stripe. The price you see at checkout is the
              price you pay. We never see or store your card details.
            </>,
            <>
              A pass you bought before these terms, such as Wire Pass or Trade Lab, keeps working for the season it was
              bought for.
            </>,
          ]}
        />
      </Section>

      <Section heading="Refunds">
        <p>
          If Owner&rsquo;s Suite is not useful to you, ask within {LEGAL.refundDays} days of buying and we will refund it in full. No
          reasoning required.
        </p>
        <p>
          After that window, a pass is non-refundable, except where the law says otherwise. If we take your money and
          the product does not work, that is a refund whenever it happens, not a favour.
        </p>
      </Section>

      <Section heading="What Owner's Suite does not promise">
        <p>
          Projections come from third parties and are estimates. Owner&rsquo;s Suite re-scores them to your league&rsquo;s settings and
          reasons about them, but it cannot know whether a running back tweaks a hamstring in warmups.
        </p>
        <p>
          The confidence tags are measured, not decorative: they describe how often calls at that margin have been right
          historically. Historical accuracy is not a guarantee about any particular week, and a &ldquo;Lock&rdquo; that
          loses is within the advertised behaviour rather than a defect.
        </p>
        <p>
          Owner&rsquo;s Suite is provided as is. We are not liable for lineup outcomes, league placings, missed waiver claims, trades
          you accept or decline, or anything else that follows from acting on its advice. Nothing here is financial or
          betting advice, and Owner&rsquo;s Suite is not a gambling service.
        </p>
      </Section>

      <Section heading="Using it fairly">
        <Bullets
          items={[
            <>Use Owner&rsquo;s Suite for your own leagues. Do not resell, rebrand or redistribute what it produces as a service.</>,
            <>
              Do not hammer the API, scrape it, or automate against it beyond ordinary use of the app. It sits on top of
              other people&rsquo;s rate limits as well as ours.
            </>,
            <>
              Linking a league means you are entitled to see that league. A private ESPN league is read with a key from
              your own ESPN sign-in, which stays on your device; it must be yours. You remain bound by your league
              platform&rsquo;s own terms.
            </>,
          ]}
        />
      </Section>

      <Section heading="Availability">
        <p>
          Owner&rsquo;s Suite is a seasonal product and is most useful during the NFL season. We aim to keep it up through the week
          that matters, particularly before kickoff, but it can be interrupted, and the data providers it depends on can
          change or withdraw without notice.
        </p>
      </Section>

      <Section heading="Ending it">
        <p>
          You can stop using Owner&rsquo;s Suite at any time and delete your account from your account page, or ask us to. We can suspend access for behaviour
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
