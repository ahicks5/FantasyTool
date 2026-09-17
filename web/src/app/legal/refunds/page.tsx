import type { Metadata } from "next";
import { LAST_UPDATED } from "../layout";

export const metadata: Metadata = {
  title: "Refunds — Edge",
  description: "Seven days, no questions. How to get your money back from Edge.",
};

export default function Refunds() {
  return (
    <>
      <h1 className="display text-3xl">Refunds</h1>
      <p className="mt-1 text-sm text-muted">Last updated {LAST_UPDATED}</p>

      <div className="card mt-6 p-5">
        <p className="display text-xl">Seven days, no questions.</p>
        <p className="mt-2">
          Email <a className="underline" href="mailto:support@edge.example">support@edge.example</a> from
          the address you bought with, within seven days of the purchase, and we refund it. You do
          not have to explain why.
        </p>
      </div>

      <h2 className="display mt-8 text-xl">Why it works this way</h2>
      <p className="mt-2">
        A season pass costs less than a sandwich. Arguing about one would cost us both more than the
        pass is worth, and a refund policy with conditions attached is just a slower way of saying
        no.
      </p>

      <h2 className="display mt-8 text-xl">The details</h2>
      <ul className="mt-2 grid gap-2">
        <li>Refunds go back to the card you paid with, and take a few business days to land.</li>
        <li>A refund removes the pass it paid for. Your account and your leagues stay.</li>
        <li>
          After seven days we will still look at it. If the product was broken for you, or an outage
          cost you a week you paid for, say so and we will sort it out.
        </li>
        <li>
          If you want your account erased as well, that is the{" "}
          <a className="underline" href="/legal/privacy">
            privacy page
          </a>
          , and it is one request.
        </li>
      </ul>

      <h2 className="display mt-8 text-xl">Before you pay</h2>
      <p className="mt-2">
        You should not have to rely on this. Start/sit calls are free forever on one team, every
        locked feature tells you how big the move behind it is before you unlock it, and our weekly
        accuracy is published. Buy once you have seen it work on your own league.
      </p>
    </>
  );
}
