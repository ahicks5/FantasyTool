/**
 * Turning a failure into something worth reading.
 *
 * Every page used to render `e.message` straight into the error box, which produced
 * "Failed to fetch" when the phone lost signal, "HTTP 500" when the API fell over, and
 * "too many requests" once rate limiting landed. None of those tell someone what to do,
 * and two of them read as the app being broken when the real cause is a tunnel or a
 * momentary blip.
 */

/** An error that knows its HTTP status, so the copy can depend on it. */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export interface ErrorCopy {
  title: string;
  detail: string;
  /** Whether trying again is likely to help. A 404 will still be a 404. */
  canRetry: boolean;
}

const NETWORK = /failed to fetch|networkerror|load failed|network request failed|ecconnrefused|fetch failed/i;
/** Messages that are a status code wearing a coat — never worth showing as detail. */
const OPAQUE = /^(http \d{3}|\d{3}|error|unknown error|\[object object\])$/i;

function messageOf(error: unknown): string {
  if (typeof error === "string") return error.trim();
  if (error instanceof Error) return error.message.trim();
  return "";
}

/**
 * `online` should be navigator.onLine where there is a browser. It is checked first
 * because a dropped connection explains every other symptom, and telling someone the
 * server is broken when their train went into a tunnel sends them to the wrong place.
 */
export function describeError(error: unknown, options: { online?: boolean } = {}): ErrorCopy {
  const message = messageOf(error);

  if (options.online === false) {
    return {
      title: "You are offline",
      detail: "Penthouse needs a connection to read your league. This will retry when you are back.",
      canRetry: true,
    };
  }

  const status = error instanceof HttpError ? error.status : 0;

  if (status === 429) {
    return {
      title: "Too many requests",
      detail: "Penthouse is asking your league platform to slow down. Give it a minute and try again.",
      canRetry: true,
    };
  }
  if (status === 401) {
    return { title: "Sign in to continue", detail: "Your session has expired.", canRetry: false };
  }
  if (status === 404) {
    return {
      title: "Not found",
      detail: message && !OPAQUE.test(message) ? message : "We could not find that league or team.",
      canRetry: false,
    };
  }
  if (status === 408 || (error instanceof Error && error.name === "AbortError")) {
    return { title: "That took too long", detail: "Your league platform was slow to answer.", canRetry: true };
  }
  if (status >= 500) {
    return {
      title: "Penthouse is having a problem",
      detail: "This one is on us. It is usually brief — try again in a moment.",
      canRetry: true,
    };
  }

  if (NETWORK.test(message) || (error instanceof TypeError && !status)) {
    return {
      title: "Cannot reach Penthouse",
      detail: "Check your connection and try again.",
      canRetry: true,
    };
  }

  return {
    title: "Something went wrong",
    detail: message && !OPAQUE.test(message) ? message : "Try again, and tell us if it keeps happening.",
    canRetry: true,
  };
}

/** navigator.onLine where there is one. Undefined elsewhere, which means "assume online". */
export function isOnline(): boolean | undefined {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") return undefined;
  return navigator.onLine;
}
