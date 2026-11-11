// A thrown value is outside data: an error that is not one of ours may carry any text in its name, its
// constructor's name or its `code`, and a getter on any of them may throw. A field of a thrown value that is not
// one of our error classes reaches a log line only through these functions, and none of them throws, because
// their callers run inside catch blocks that must not. Our own classes' messages and fields are built for
// logging (design 10) and are printed directly: http/errors.ts, CourseReadError in reconcile.ts and
// InvalidConfigError in main.ts.

// The pattern of web's relay (apps/web/server/relay.ts), restated because the two share no package.
const ERROR_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

// Web's SYSTEM_CODE character set with ERROR_NAME's length, deliberately not web's `{0,31}`: ws 8.22.0 raises
// codes of 33-38 characters (WS_ERR_UNSUPPORTED_MESSAGE_LENGTH for an oversized browser frame) and fastify 5.12.7
// has 30 codes over 32 characters, and those must stay readable in the log.
const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

// A Proxy whose `getPrototypeOf` trap throws makes `instanceof` throw; such a value has not shown it is an Error,
// so it counts as not one rather than being printed under a class it may not have.
function isError(error: unknown): error is Error {
  try {
    return error instanceof Error;
  } catch {
    return false;
  }
}

/**
 * The name of a thrown Error when it is a string and an identifier of at most 64 characters, otherwise `Error`;
 * `NonError` for any other thrown value.
 */
export function errorName(error: unknown): string {
  if (!isError(error)) return "NonError";
  try {
    // Read once: a getter could pass the checks with one value and return another.
    const name: unknown = error.name;
    return typeof name === "string" && ERROR_NAME.test(name) ? name : "Error";
  } catch {
    return "Error";
  }
}

/**
 * The constructor name of a thrown Error when it is an identifier of at most 64 characters, otherwise `Error`;
 * `typeof` for any other thrown value. The constructor name, not `name`, because a DOMException or a subclass
 * that does not set `this.name` would print differently.
 */
export function errorKind(error: unknown): string {
  if (!isError(error)) return typeof error;
  try {
    // `constructor` and its `name` are each read once, for the reason given in errorName. The compiler types
    // `constructor` as a Function, but an own property can make it anything: a null or undefined one throws
    // here and lands in the same catch as a throwing getter, a primitive one gives a name that is not a string.
    const name: unknown = error.constructor.name;
    return typeof name === "string" && ERROR_NAME.test(name) ? name : "Error";
  } catch {
    return "Error";
  }
}

/**
 * The `code` of any thrown object when it is a string matching ERROR_CODE, otherwise `null`; the caller picks
 * the placeholder, because some lines print `-` and others leave the code out.
 */
export function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  try {
    const code: unknown = Reflect.get(error, "code");
    // The typeof check comes first so that RegExp.test never coerces an object through its toString.
    return typeof code === "string" && ERROR_CODE.test(code) ? code : null;
  } catch {
    return null;
  }
}

/** `Kind (CODE)`, or only `Kind` when the value has no valid code: the startup failure field of main.ts. */
export function errorKindAndCode(error: unknown): string {
  const kind = errorKind(error);
  const code = errorCode(error);
  return code === null ? kind : `${kind} (${code})`;
}
