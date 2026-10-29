/**
 * Drizzle 0.45 applies a journal entry only if its `when` is newer than the newest applied one, so an
 * out-of-order merge is skipped silently. These checks catch that, and a journal that disagrees with
 * the SQL files, without a database.
 */

export interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

export interface Journal {
  entries: JournalEntry[];
}

export function parseJournal(value: unknown): Journal {
  if (typeof value !== "object" || value === null || !("entries" in value)) {
    throw new Error("journal must be an object with an entries array");
  }
  const { entries } = value;
  if (!Array.isArray(entries)) {
    throw new Error("journal entries must be an array");
  }
  return {
    entries: entries.map((entry: unknown, position: number): JournalEntry => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        !("idx" in entry && typeof entry.idx === "number") ||
        !("when" in entry && typeof entry.when === "number") ||
        !("tag" in entry && typeof entry.tag === "string")
      ) {
        throw new Error(
          `journal entry at position ${position} needs a numeric idx and when, and a tag`,
        );
      }
      return { idx: entry.idx, when: entry.when, tag: entry.tag };
    }),
  };
}

/** Returns one message per problem; an empty array means the journal is consistent. */
export function verifyJournal(journal: Journal, sqlFileNames: readonly string[]): string[] {
  const problems: string[] = [];
  const sqlFiles = new Set(sqlFileNames);
  journal.entries.forEach((entry, position) => {
    if (entry.idx !== position) {
      problems.push(`entry ${entry.tag}: idx ${entry.idx}, expected ${position}`);
    }
    const previous = journal.entries[position - 1];
    if (previous !== undefined && entry.when <= previous.when) {
      problems.push(
        `entry ${entry.tag}: when ${entry.when} is not after ${previous.tag} (${previous.when}); drizzle would skip it`,
      );
    }
    if (!sqlFiles.has(`${entry.tag}.sql`)) {
      problems.push(`entry ${entry.tag}: ${entry.tag}.sql is missing`);
    }
  });
  const tags = new Set(journal.entries.map((entry) => `${entry.tag}.sql`));
  for (const file of sqlFileNames) {
    if (!tags.has(file)) {
      problems.push(`${file} is not in the journal`);
    }
  }
  return problems;
}
