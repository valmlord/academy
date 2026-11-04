import { createHash, timingSafeEqual } from "node:crypto";

// Q4: one shared secret between web and the service. Both sides are hashed before the comparison, so the
// compared buffers always have the same length and the time taken says nothing about the secret's length or
// about how many leading characters matched.

const SCHEME = "Bearer ";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Built once at startup; the secret itself is not kept by the checker. */
export function authorizationChecker(secret: string): (header: string | undefined) => boolean {
  const expected = digest(secret);
  return (header) => {
    if (header === undefined || !header.startsWith(SCHEME)) return false;
    return timingSafeEqual(digest(header.slice(SCHEME.length)), expected);
  };
}
