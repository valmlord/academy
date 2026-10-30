"use server";

import { getDb } from "@/lib/auth";

/**
 * Whether the platform has no user at all (sign-in AC5). Public on purpose: it reveals only that the
 * seed has not run, never whether a given email exists. The one database read outside the data access
 * layer (ADR-0008 item 8).
 */
export async function needsSeedHint(): Promise<boolean> {
  const result = await getDb().execute("SELECT 1 FROM users LIMIT 1");
  return result.rows.length === 0;
}
