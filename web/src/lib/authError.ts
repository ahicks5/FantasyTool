/**
 * What a sign-in, register, reset or change-password form says when the API refuses it.
 *
 * The generic `describeError` is written for league reads: its 401 is "your session has
 * expired" and its 429 blames the league platform. On the door those are wrong, so the
 * account forms map their own statuses here and hand everything else (offline, 5xx) back
 * to the generic copy. Pure, so it is tested flat.
 */
import { describeError, HttpError, type ErrorCopy } from "./errors.ts";
import { ACCOUNT } from "./vocab.ts";

export function describeAuthError(error: unknown, options: { online?: boolean } = {}): ErrorCopy {
  if (options.online !== false && error instanceof HttpError) {
    if (error.status === 401) return { title: ACCOUNT.errors.wrong, detail: ACCOUNT.errors.wrongDetail, canRetry: false };
    if (error.status === 409) return { title: ACCOUNT.errors.taken, detail: ACCOUNT.errors.takenDetail, canRetry: false };
    if (error.status === 429) return { title: ACCOUNT.errors.slow, detail: ACCOUNT.errors.slowDetail, canRetry: false };
    if (error.status === 400) {
      const detail = error.message.trim();
      if (/expired|already used/i.test(detail)) return { title: ACCOUNT.errors.bad, detail: ACCOUNT.reset.expired, canRetry: false };
      // The API's 400s on these routes are written to be read: "Use at least 8 characters."
      return { title: ACCOUNT.errors.bad, detail: detail ? detail[0].toUpperCase() + detail.slice(1) : "", canRetry: false };
    }
  }
  return describeError(error, options);
}
