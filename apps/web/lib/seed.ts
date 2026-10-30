import type { Auth } from "better-auth";

// The seed creates, repairs or re-keys the platform's only user (ADR-0008 item 10). It writes through
// Better Auth's internal adapter and password hash, so the email is lowercased and the hash format is
// Better Auth's own. Every branch converges when rerun after a crash.

export type AuthContext = Awaited<Auth["$context"]>;

export interface SeedInput {
  email: string | undefined;
  password: string | undefined;
  name: string | undefined;
}

export type SeedResult = "created" | "repaired" | "updated";

/** A different user exists: the seed manages exactly one. */
export class SeedConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedConflictError";
  }
}

/** SEED_EMAIL or SEED_PASSWORD breaks a rule; the message names the variable and the rule only. */
export class InvalidSeedInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSeedInputError";
  }
}

// Better Auth's password bounds, as configured in createAuthOptions.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const DEFAULT_NAME = "Learner";
const CREDENTIAL_PROVIDER = "credential";

interface ValidInput {
  email: string;
  password: string;
  name: string;
}

function validated(input: SeedInput): ValidInput {
  const email = input.email?.trim() ?? "";
  if (email === "" || !email.includes("@")) {
    throw new InvalidSeedInputError("SEED_EMAIL must be an email address");
  }
  const password = input.password ?? "";
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new InvalidSeedInputError(
      `SEED_PASSWORD must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters, got ${password.length}`,
    );
  }
  const name = input.name?.trim() || DEFAULT_NAME;
  return { email, password, name };
}

export async function seedUser(ctx: AuthContext, input: SeedInput): Promise<SeedResult> {
  const { email, password, name } = validated(input);
  const adapter = ctx.internalAdapter;
  const hash = await ctx.password.hash(password);
  const found = await adapter.findUserByEmail(email);

  if (found === null) {
    if ((await adapter.countTotalUsers()) > 0) {
      throw new SeedConflictError(
        "another user already exists; the seed manages one user, the one in SEED_EMAIL",
      );
    }
    const user = await adapter.createUser(
      { email, name, emailVerified: false },
      { method: "email-password" },
    );
    await adapter.linkAccount({
      userId: user.id,
      providerId: CREDENTIAL_PROVIDER,
      accountId: user.id,
      password: hash,
    });
    return "created";
  }

  const userId = found.user.id;
  // Re-keying (or linking) is the recovery path, so it ends every session of the old password.
  if ((await adapter.findCredentialAccount(userId)) === null) {
    // A previous run stopped between createUser and linkAccount.
    await adapter.linkAccount({
      userId,
      providerId: CREDENTIAL_PROVIDER,
      accountId: userId,
      password: hash,
    });
    await adapter.deleteUserSessions(userId);
    return "repaired";
  }
  await adapter.updatePassword(userId, hash);
  await adapter.deleteUserSessions(userId);
  return "updated";
}
