import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER } from "../../src/migrate.js";
import { type Journal, parseJournal, verifyJournal } from "./journal.js";

function journalOf(...entries: [idx: number, when: number, tag: string][]): Journal {
  return { entries: entries.map(([idx, when, tag]) => ({ idx, when, tag })) };
}

describe("U1 migration journal order", () => {
  it("accepts the generated drizzle folder", () => {
    const journal = parseJournal(
      JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8")),
    );
    const sqlFiles = readdirSync(MIGRATIONS_FOLDER).filter((name) => name.endsWith(".sql"));

    const problems = verifyJournal(journal, sqlFiles);

    expect(problems).toEqual([]);
  });

  it("rejects an entry appended with an older when than its predecessor", () => {
    const journal = journalOf([0, 2000, "0000_newer"], [1, 1000, "0001_older"]);

    const problems = verifyJournal(journal, ["0000_newer.sql", "0001_older.sql"]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("0001_older");
  });

  it("rejects a gap in idx", () => {
    const journal = journalOf([0, 1000, "0000_a"], [2, 2000, "0002_c"]);

    const problems = verifyJournal(journal, ["0000_a.sql", "0002_c.sql"]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("0002_c");
  });

  it("rejects an entry without its sql file", () => {
    const journal = journalOf([0, 1000, "0000_a"], [1, 2000, "0001_b"]);

    const problems = verifyJournal(journal, ["0000_a.sql"]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("0001_b");
  });

  it("rejects a stray sql file that the journal does not list", () => {
    const journal = journalOf([0, 1000, "0000_a"]);

    const problems = verifyJournal(journal, ["0000_a.sql", "0001_stray.sql"]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("0001_stray");
  });
});

describe("U2 default migrations folder", () => {
  it("is absolute and holds the journal", () => {
    const journalPath = path.join(MIGRATIONS_FOLDER, "meta/_journal.json");

    expect(path.isAbsolute(MIGRATIONS_FOLDER)).toBe(true);
    expect(existsSync(journalPath)).toBe(true);
  });
});
