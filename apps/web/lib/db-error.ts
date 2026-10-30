// ADR-0008 item 11 (L1): a database error is logged by its name, code and constraint only. Drizzle's
// message carries the query parameters (session tokens, password hashes), and the error object, its
// stack or its cause would print them too.

// An error's name is as untrusted as its message: only an identifier is printed.
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
// A SQLSTATE (23505) or a Node code (ECONNREFUSED). A `code` of any other shape is skipped, because
// any value can claim one.
const ERROR_CODE = /^[A-Z0-9_]{1,32}$/;
// Constraint names are ours (ADR-0007 item 6): lower-case snake_case.
const CONSTRAINT_NAME = /^[a-z][a-z0-9_]{0,62}$/;
// Drizzle wraps the pg error once and pg errors have no further cause; 10 levels leave room for other
// wrappers and stop a cyclic chain.
const MAX_CAUSE_DEPTH = 10;

interface CodedError {
  code: string;
  constraint: string | undefined;
}

/** `<Name> (<code>[, constraint <name>])`, or `<Name>` when the cause chain carries no code. */
export function describeDbError(error: unknown): string {
  const name = error instanceof Error && IDENTIFIER.test(error.name) ? error.name : "unknown";
  const coded = firstCode(error);
  if (coded === undefined) return name;
  const constraint = coded.constraint === undefined ? "" : `, constraint ${coded.constraint}`;
  return `${name} (${coded.code}${constraint})`;
}

/** The first SQLSTATE or Node error code in the cause chain, for choosing a hint. */
export function dbErrorCode(error: unknown): string | undefined {
  return firstCode(error)?.code;
}

function firstCode(error: unknown): CodedError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) return undefined;
    if ("code" in current && typeof current.code === "string" && ERROR_CODE.test(current.code)) {
      return { code: current.code, constraint: constraintOf(current) };
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

function constraintOf(error: object): string | undefined {
  return "constraint" in error &&
    typeof error.constraint === "string" &&
    CONSTRAINT_NAME.test(error.constraint)
    ? error.constraint
    : undefined;
}
