import { existsSync } from "node:fs";
import path from "node:path";
import { createDb } from "@academy/db";
import { betterAuth } from "better-auth";
import { createAuthLog } from "../lib/auth/logger";
import { createAuthOptions } from "../lib/auth/options";
import { seedUser } from "../lib/seed";
import { runSeed } from "../lib/seed-cli";

// `pnpm seed`: creates, repairs or re-keys the only user from SEED_EMAIL / SEED_PASSWORD (README "Web
// app"). It never imports lib/auth/index.ts or lib/session.ts: their server-only marker throws here.

// The repository keeps one root .env; a variable already set in the shell wins over the file.
const rootEnvFile = path.join(import.meta.dirname, "../../../.env");
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

process.exitCode = await runSeed({
  env: process.env,
  createDb: (url) => createDb(url),
  seed: async ({ db, secret }, input) => {
    const log = createAuthLog((line) => console.error(line));
    const auth = betterAuth(createAuthOptions({ db, secret, log }));
    return seedUser(await auth.$context, input);
  },
  log: (line) => console.log(line),
});
