import type { ReactElement } from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { inlineLinkClassName } from "@/components/ui/link-styles";
import type { LessonTextKind } from "@/lib/course/text";
import { CopyButton } from "./copy-button";
import { remarkLessonHeadings } from "./headings";

// Lesson Markdown rendered on the server (ADR-0009 item 9). react-markdown's defaults are the safety
// rules: raw HTML renders as literal text (so "<actor>" in a lesson stays visible) and javascript: URLs are
// dropped. Images are not rendered until a design covers them, so a lesson cannot make the browser fetch a
// third-party URL. No syntax highlighting: the design system has no syntax colours.

// The hast element react-markdown passes as `node`; the web takes no direct dependency on hast's types.
type Element = NonNullable<ExtraProps["node"]>;
type ElementContent = Element["children"][number];

function textContent(nodes: ElementContent[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return node.value;
      if (node.type === "element") return textContent(node.children);
      return "";
    })
    .join("");
}

function codeText(pre: Element | undefined): string {
  return pre === undefined ? "" : textContent(pre.children);
}

const components: Components = {
  pre: ({ node, children }) => (
    <div className="code-block">
      <div className="code-block-header">
        <CopyButton text={codeText(node)} />
      </div>
      <pre>{children}</pre>
    </div>
  ),
  table: ({ children }) => (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  ),
  // Same tab, no target: the copy has no "opens in a new tab" text (lesson acceptance notes).
  a: ({ href, children }) => (
    <a href={href} className={inlineLinkClassName}>
      {children}
    </a>
  ),
};

export function LessonMarkdown({
  markdown,
  kind,
}: {
  markdown: string;
  kind: LessonTextKind;
}): ReactElement {
  return (
    <article className="prose">
      <Markdown
        remarkPlugins={[remarkGfm, [remarkLessonHeadings, { kind }]]}
        disallowedElements={["img"]}
        components={components}
      >
        {markdown}
      </Markdown>
    </article>
  );
}
