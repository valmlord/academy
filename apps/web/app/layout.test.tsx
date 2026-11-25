import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { SystemTheme } from "@/components/system-theme";
import RootLayout from "./layout";

function containsType(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => containsType(child, type));
  if (!isValidElement<{ children?: ReactNode }>(node)) return false;
  return node.type === type || containsType(node.props.children, type);
}

describe("RootLayout", () => {
  // Without it a document the client renders from scratch (the not-found shell) never gets the class.
  it("renders SystemTheme on every page", () => {
    const tree = RootLayout({ children: null, params: Promise.resolve({}) });

    expect(containsType(tree, SystemTheme)).toBe(true);
  });
});
