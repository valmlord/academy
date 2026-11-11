import { migrateDatabase } from "@academy/db";
import { nodeCourseFs } from "./course/node-fs";
import { readCourse } from "./course/read";
import { courseRoot } from "./course/root";
import { recomputeOutcomesOnStartup } from "./progress/recompute";
import { migrateOnStartup } from "./startup";

// Node-only wiring of migrateOnStartup and the lesson outcome recompute. #34 adds the stale-attempt
// sweep between them, so the recompute sees the swept attempts.
export async function runStartup(): Promise<void> {
  await migrateOnStartup({
    databaseUrl: process.env.DATABASE_URL,
    authEnv: {
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_SECRETS: process.env.BETTER_AUTH_SECRETS,
    },
    workspaceEnv: {
      WORKSPACE_SERVICE_URL: process.env.WORKSPACE_SERVICE_URL,
      WORKSPACE_SERVICE_SECRET: process.env.WORKSPACE_SERVICE_SECRET,
      TERMINAL_RECONNECT_ATTEMPTS: process.env.TERMINAL_RECONNECT_ATTEMPTS,
      TERMINAL_RELAY_MAX_SECONDS: process.env.TERMINAL_RELAY_MAX_SECONDS,
      ENVIRONMENT_START_SLOW_SECONDS: process.env.ENVIRONMENT_START_SLOW_SECONDS,
    },
    migrate: (url) => migrateDatabase(url),
    exit: (code) => process.exit(code),
    logError: (line) => console.error(line),
    logInfo: (line) => console.log(line),
  });
  const databaseUrl = process.env.DATABASE_URL;
  // migrateOnStartup has exited on an unset URL; this narrows the type for the compiler.
  if (databaseUrl === undefined) return;
  await recomputeOutcomesOnStartup({
    databaseUrl,
    // Not getCourse: that is a per-request cache() of React, and this runs outside any request.
    readTree: async () => readCourse(nodeCourseFs, courseRoot(process.env, process.cwd())),
    logError: (line) => console.error(line),
    logInfo: (line) => console.log(line),
  });
}
