"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { createSignOut } from "@/lib/sign-out";

/**
 * Ends the session behind the user menu's sign-out item (ADR-0008 item 5). Needs no session of its
 * own: without one it only deletes cookies. Better Auth gets the request's own headers, so it sees the
 * session cookie and Host.
 */
export async function signOutAction(): Promise<never> {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  return createSignOut({
    signOut: () => getAuth().api.signOut({ headers: requestHeaders }),
    deleteCookie: (name) => cookieStore.delete(name),
    redirect,
    log: (line) => console.error(line),
  })();
}
