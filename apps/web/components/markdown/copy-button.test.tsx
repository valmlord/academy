import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyDeniedLabel, copyLabel } from "@/lib/copy";
import { CopyButton } from "./copy-button";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
}

describe("CopyButton", () => {
  it("names the denial and keeps focus when the clipboard refuses", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    render(<CopyButton text="echo hi" />);
    const button = screen.getByRole("button", { name: copyLabel });
    button.focus();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByRole("button", { name: copyDeniedLabel })).toBe(button);
    expect(document.activeElement).toBe(button);
  });

  it("copies the text and keeps its label when the clipboard accepts", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    render(<CopyButton text="echo hi" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copyLabel }));
    });

    expect(writeText).toHaveBeenCalledWith("echo hi");
    expect(screen.getByRole("button", { name: copyLabel })).toBeInTheDocument();
  });
});
