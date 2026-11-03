import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONFIG_VARIABLES } from "../../src/config.js";

// U-env-example (design 12.1): CI copies .env.example to .env, so a live line here reaches every later process
// there; a live COMPOSE_FILE would also hand every workspace the superuser path to Postgres (ADR-0002 item 6).

const ENV_EXAMPLE = readFileSync(
  fileURLToPath(new URL("../../../../.env.example", import.meta.url)),
  "utf8",
);
const LINES = ENV_EXAMPLE.split("\n");

function isCommented(name: string): boolean {
  return LINES.some((line) => line.startsWith(`# ${name}=`));
}

/** A line a dotenv reader or a shell would act on: `NAME=...` or `export NAME=...`, indented or not. */
function isLive(name: string): boolean {
  const live = new RegExp(`^\\s*(export\\s+)?${name}=`);
  return LINES.some((line) => live.test(line));
}

describe(".env.example (U-env-example)", () => {
  it("lists every variable the service reads as a commented line", () => {
    const missing = CONFIG_VARIABLES.filter((name) => !isCommented(name));

    expect(missing).toEqual([]);
  });

  it("has no live line for a service variable, COMPOSE_FILE or DB_PORT", () => {
    const live = [...CONFIG_VARIABLES, "COMPOSE_FILE", "DB_PORT"].filter(isLive);

    expect(live).toEqual([]);
  });

  it("names the db-port override for COMPOSE_FILE in a comment", () => {
    expect(isCommented("COMPOSE_FILE")).toBe(true);
  });
});
