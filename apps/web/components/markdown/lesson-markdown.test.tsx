import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import type { Html, Root } from "mdast";
import { renderToStaticMarkup } from "react-dom/server";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyLabel } from "@/lib/copy";
import type { LessonTextKind } from "@/lib/course/text";
import { RecordingResizeObserver } from "@/test/dom-stubs";
import { sectionsOf } from "./headings";
import { LessonMarkdown } from "./lesson-markdown";

// The code block's pre observes its own box, and jsdom has no ResizeObserver.
beforeEach(() => {
  RecordingResizeObserver.instances.length = 0;
  vi.stubGlobal("ResizeObserver", RecordingResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderMarkdown(markdown: string, kind: LessonTextKind = "theory"): HTMLElement {
  const { container } = render(<LessonMarkdown markdown={markdown} kind={kind} />);
  return container;
}

const headingsOf = (container: HTMLElement): string[] =>
  [...container.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(
    (heading) => `${heading.tagName.toLowerCase()} ${heading.textContent}`,
  );

describe("LessonMarkdown headings", () => {
  const theory = "# Title\n\nIntro.\n\n## One\n\n### Sub\n\n#### Deep\n\n# Two\n\n## Three\n";

  it("drops the theory's leading title and maps the rest from h2", () => {
    const container = renderMarkdown(theory);

    expect(headingsOf(container)).toEqual(["h2 One", "h3 Sub", "h4 Deep", "h2 Two", "h2 Three"]);
  });

  it("numbers every theory h2 as a focusable section", () => {
    const container = renderMarkdown(theory);

    const sections = [...container.querySelectorAll("h2")].map((h) => [h.id, h.tabIndex]);

    expect(sections).toEqual([
      ["sec-1", -1],
      ["sec-2", -1],
      ["sec-3", -1],
    ]);
  });

  it("lists the same sections for the table of contents", () => {
    expect(sectionsOf(theory)).toEqual([
      { id: "sec-1", text: "One" },
      { id: "sec-2", text: "Two" },
      { id: "sec-3", text: "Three" },
    ]);
  });

  it("maps task headings one level down from h2, with no section ids", () => {
    const container = renderMarkdown("# A\n\n## B\n\n### C\n\n#### D\n", "task");

    expect(headingsOf(container)).toEqual(["h2 A", "h3 B", "h4 C", "h4 D"]);
    expect(container.querySelector("[id^=sec-]")).toBeNull();
  });

  it("wraps a table so it scrolls on its own", () => {
    const container = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n");

    expect(container.querySelector(".table-wrap > table")).not.toBeNull();
  });
});

describe("LessonMarkdown safety", () => {
  it("renders a code block with a copy button", () => {
    const container = renderMarkdown("```sh\necho hi\n```\n");

    const block = container.querySelector(".code-block");

    expect(block?.querySelector("pre")?.textContent).toBe("echo hi\n");
    expect(block?.querySelector("button")?.textContent).toBe(copyLabel);
  });

  it("server-renders the pre of a code block with no tabindex, role or aria-label", () => {
    const html = renderToStaticMarkup(
      <LessonMarkdown markdown={"```sh\necho hi\n```\n"} kind="theory" />,
    );

    const preTag = /<pre[^>]*>/.exec(html)?.[0];

    expect(preTag).toBe("<pre>");
  });

  it("shows raw HTML as literal text", () => {
    const container = renderMarkdown("Ask the <actor> to act.\n");

    expect(container.textContent).toContain("Ask the <actor> to act.");
    expect(container.querySelector("actor")).toBeNull();
  });

  it("never renders a script element", () => {
    const container = renderMarkdown("<script>alert(1)</script>\n");

    expect(container.querySelector("script")).toBeNull();
  });

  it("drops a javascript: link target", () => {
    const container = renderMarkdown("[x](javascript:alert(1))\n");

    expect(container.querySelector("a")?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("renders no image", () => {
    const container = renderMarkdown("![x](https://example.com/a.png)\n");

    expect(container.querySelector("img")).toBeNull();
  });
});

const COURSE = path.join(import.meta.dirname, "../../../../course");

function lessonTexts(): string[] {
  return readdirSync(COURSE, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && (entry.name === "theory.md" || entry.name === "task.md"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter(
      (file) => !file.split(path.sep).some((part) => part === "checks" || part === "starter"),
    );
}

// Relative and sorted so test names are the same on every machine: absolute paths differ per
// checkout and readdirSync order differs between file systems.
const lessonFiles: string[] = lessonTexts()
  .map((file) => path.relative(COURSE, file))
  .sort();

describe("LessonMarkdown on the real course", () => {
  // it.each over an empty list registers no tests and passes, so an empty list fails here.
  it("finds lesson texts to check", () => {
    expect(lessonFiles.length).toBeGreaterThan(0);
  });

  it.each(lessonFiles)("shows every raw HTML node of %s as literal text", (relativeFile) => {
    const markdown = readFileSync(path.join(COURSE, relativeFile), "utf8");
    const tree: Root = unified().use(remarkParse).use(remarkGfm).parse(markdown);
    const values: string[] = [];
    visit(tree, "html", (node: Html) => {
      values.push(node.value);
    });

    const container = renderMarkdown(
      markdown,
      path.basename(relativeFile) === "task.md" ? "task" : "theory",
    );

    for (const value of values) expect(container.textContent, relativeFile).toContain(value);
    expect(container.querySelector("script"), relativeFile).toBeNull();
  });
});
