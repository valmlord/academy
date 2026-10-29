import { defineConfig } from "drizzle-kit";

// No credentials and no env: generate and check work from the schema alone. The migrations table
// stays at Drizzle's default (drizzle.__drizzle_migrations), shared with the runtime migrator.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
