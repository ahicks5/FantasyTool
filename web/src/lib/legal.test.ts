import { test } from "node:test";
import assert from "node:assert/strict";
import { legalIsLaunchReady, missingLegalConfig, type LegalConfig } from "./legal.ts";

const complete: LegalConfig = {
  operator: "Penthouse",
  supportEmail: "support@example.com",
  jurisdiction: "the State of Indiana, USA",
  effective: "18 September 2026",
  refundDays: 14,
};

test("a filled-in config is ready for Stripe's review", () => {
  assert.deepEqual(missingLegalConfig(complete), []);
  assert.equal(legalIsLaunchReady(complete), true);
});

test("a missing support address is named, because Stripe asks for one", () => {
  assert.deepEqual(missingLegalConfig({ ...complete, supportEmail: "" }), ["supportEmail"]);
  assert.equal(legalIsLaunchReady({ ...complete, supportEmail: "" }), false);
});

test("a missing effective date is named", () => {
  assert.deepEqual(missingLegalConfig({ ...complete, effective: "" }), ["effective"]);
});

test("every blank required value is reported at once, not one per deploy", () => {
  assert.deepEqual(missingLegalConfig({ ...complete, supportEmail: "", effective: "" }), [
    "supportEmail",
    "effective",
  ]);
});

test("governing law is optional: omitting it beats guessing it", () => {
  assert.deepEqual(missingLegalConfig({ ...complete, jurisdiction: "" }), []);
});
