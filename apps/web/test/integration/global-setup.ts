import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

// Same tag as the compose `db` service.
const POSTGRES_TEST_IMAGE = "postgres:17.6-alpine";

// A canary, not a secret: tests assert it never shows up in an error or a log line.
const TEST_PASSWORD = "canary-s3cret-29";

declare module "vitest" {
  export interface ProvidedContext {
    postgresUrl: string;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let container: StartedPostgreSqlContainer;
  try {
    container = await new PostgreSqlContainer(POSTGRES_TEST_IMAGE)
      .withPassword(TEST_PASSWORD)
      .start();
  } catch (error: unknown) {
    // vitest 5.0.5 replaces a globalSetup error with "code.charCodeAt is not a function", so the
    // line is printed before the rethrow. Only the message: the container config holds the password.
    const cause = error instanceof Error ? error.message : typeof error;
    const message = `@academy/web test:integration: could not start the Postgres test container (${POSTGRES_TEST_IMAGE}). Is Docker running? Cause: ${cause}`;
    console.error(message);
    throw new Error(message, { cause: error });
  }
  project.provide("postgresUrl", container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}
