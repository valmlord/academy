import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { notFoundTitle } from "@/lib/copy";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: notFoundTitle,
};

// Any path no other route matches renders (app)/not-found.tsx inside the signed-in shell instead of the
// framework's English 404 (design 4.Q5). The proxy redirects anonymous requests before they get here;
// requireSession catches a forged cookie.
export default async function MissingPage({ params }: PageProps<"/[...missing]">): Promise<never> {
  const { missing } = await params;
  await requireSession(`/${missing.map(encodeURIComponent).join("/")}`);
  notFound();
}
