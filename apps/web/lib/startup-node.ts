import { migrateDatabase } from "@academy/db";
import { migrateOnStartup } from "./startup";

// Node-only wiring of migrateOnStartup. #34 adds the stale-attempt sweep here, after the migration.
export async function runStartup(): Promise<void> {
  await migrateOnStartup({
    databaseUrl: process.env.DATABASE_URL,
    migrate: (url) => migrateDatabase(url),
    exit: (code) => process.exit(code),
    logError: (line) => console.error(line),
    logInfo: (line) => console.log(line),
  });
}
