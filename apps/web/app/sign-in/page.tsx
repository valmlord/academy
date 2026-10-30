import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { SignInForm } from "@/components/sign-in-form";
import { signInTitle } from "@/lib/copy";
import { safeNextPath } from "@/lib/next-path";
import { getSession } from "@/lib/session";
import { needsSeedHint } from "./actions";

export const metadata: Metadata = {
  title: signInTitle,
};

// Public (design/pages/sign-in). `next` is validated here, so the client only ever gets a same-origin
// path; the signed-out note shows only for the exact value 1 (ADR-0008 item 5).
export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">): Promise<ReactElement> {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  // A second sign-in would create a second session: a signed-in visitor goes straight on.
  if ((await getSession()) !== null) redirect(next);
  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex flex-1 items-start justify-center px-4 py-12 max-[30rem]:pt-6"
    >
      <SignInForm
        next={next}
        signedOut={params["signed-out"] === "1"}
        needsSeedHint={needsSeedHint}
      />
    </main>
  );
}
