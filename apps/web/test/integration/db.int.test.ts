import { afterEach, describe, expect, it } from "vitest";
import { type TestDatabase, testDatabase } from "./db";

let database: TestDatabase | undefined;

afterEach(async () => {
  await database?.drop();
  database = undefined;
});

describe("testDatabase", () => {
  it("gives every test a fresh migrated database with the users table", async () => {
    database = await testDatabase();

    const rows = await database.rows(`SELECT count(*)::int AS n FROM users`);

    expect(rows).toEqual([{ n: 0 }]);
  });
});
